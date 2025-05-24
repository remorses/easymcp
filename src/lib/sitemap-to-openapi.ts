import { parseStringPromise } from "xml2js";
import { remark } from "remark";
import { visit } from "unist-util-visit";
import * as yaml from "js-yaml";

interface SitemapUrl {
  loc: string[];
}

interface Sitemap {
  urlset: {
    url: SitemapUrl[];
  };
}

interface OpenAPIPath {
  [method: string]: any;
}

interface GenerateOpenAPIOptions {
  serverUrl?: string;
  name?: string;
}

interface OpenAPISchema {
  openapi?: string;
  info?: {
    title: string;
    version: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths: {
    [path: string]: OpenAPIPath;
  };
  components?: {
    schemas?: {
      [key: string]: any;
    };
  };
}

async function fetchSitemap(url: string): Promise<string[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch sitemap: ${response.statusText}`);
    }

    const xmlContent = await response.text();
    const parsed = (await parseStringPromise(xmlContent)) as Sitemap;

    return parsed.urlset.url.map((urlObj) => urlObj.loc[0]);
  } catch (error) {
    console.error("Error fetching sitemap:", error);
    throw error;
  }
}

async function fetchMarkdown(url: string): Promise<string> {
  try {
    const markdownUrl = `${url}.md`;
    const response = await fetch(markdownUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch markdown: ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    console.error(`Error fetching markdown from ${url}:`, error);
    return "";
  }
}

function extractYamlCodeBlocks(markdownContent: string): Array<{ content: string; method?: string; path?: string }> {
  const yamlBlocks: Array<{ content: string; method?: string; path?: string }> = [];

  const tree = remark().parse(markdownContent);

  visit(tree, "code", (node: any) => {
    // Look for YAML blocks, including those that might be in fenced code blocks with method info
    if (
      (node.lang === "yaml" || (node.lang && node.lang.includes("yaml"))) &&
      node.value
    ) {
      // Check if the lang contains method and path info like "yaml GET /v1/session/{id}"
      let method: string | undefined;
      let path: string | undefined;
      
      if (node.lang && node.lang.includes(" ")) {
        const parts = node.lang.split(" ");
        if (parts.length >= 3 && parts[0] === "yaml") {
          method = parts[1].toLowerCase();
          path = parts[2];
        }
      }
      
      yamlBlocks.push({
        content: node.value,
        method,
        path
      });
    }
  });

  return yamlBlocks;
}

function parseOpenAPIFromYaml(
  yamlContent: string,
  headerMethod?: string,
  headerPath?: string,
): { path: string; method: string; spec: any; components?: any } | null {
  try {
    const parsed = yaml.load(yamlContent) as any;

    // If we have method and path from header, treat the YAML as direct OpenAPI spec
    if (headerMethod && headerPath && parsed) {
      const components = parsed.components || undefined;
      // Remove components from the main spec to avoid duplication
      const { components: _, ...spec } = parsed;
      
      return { 
        path: headerPath, 
        method: headerMethod, 
        spec, 
        components 
      };
    }

    // Fallback to old format parsing
    if (parsed && parsed.paths && parsed.paths.path && parsed.paths.method) {
      const path = parsed.paths.path;
      const method = parsed.paths.method.toLowerCase();

      // Build OpenAPI operation specification
      const spec: any = {};

      // Handle parameters from request
      if (parsed.paths.request) {
        const request = parsed.paths.request;

        // Add parameters (path, query, header, cookie)
        const parameters: any[] = [];

        if (request.parameters) {
          // Path parameters
          if (request.parameters.path) {
            Object.entries(request.parameters.path).forEach(
              ([name, param]: [string, any]) => {
                parameters.push({
                  name,
                  in: "path",
                  required: param.schema?.[0]?.required || true,
                  schema: param.schema?.[0]
                    ? {
                        type: param.schema[0].type,
                        ...(param.schema[0].title && {
                          title: param.schema[0].title,
                        }),
                      }
                    : { type: "string" },
                });
              },
            );
          }

          // Query parameters
          if (request.parameters.query) {
            Object.entries(request.parameters.query).forEach(
              ([name, param]: [string, any]) => {
                parameters.push({
                  name,
                  in: "query",
                  required: param.required || false,
                  schema: param.schema || { type: "string" },
                });
              },
            );
          }

          // Header parameters
          if (request.parameters.header) {
            Object.entries(request.parameters.header).forEach(
              ([name, param]: [string, any]) => {
                if (name !== "x-api-key") {
                  // Skip API key headers, they'll be in security
                  parameters.push({
                    name,
                    in: "header",
                    required: param.required || false,
                    schema: param.schema || { type: "string" },
                  });
                }
              },
            );
          }
        }

        if (parameters.length > 0) {
          spec.parameters = parameters;
        }

        // Add request body if present
        if (request.body && Object.keys(request.body).length > 0) {
          spec.requestBody = request.body;
        }

        // Add security if present
        if (request.security) {
          spec.security = request.security;
        }
      }

      // Handle responses
      if (parsed.paths.response) {
        spec.responses = parsed.paths.response;
      }

      // Add deprecated flag if present
      if (parsed.paths.deprecated !== undefined) {
        spec.deprecated = parsed.paths.deprecated;
      }

      // Extract components
      const components = parsed.components || undefined;

      return { path, method, spec, components };
    }

    return null;
  } catch (error) {
    console.error("Error parsing YAML:", error);
    return null;
  }
}

async function processMarkdownFiles(urls: string[], options?: GenerateOpenAPIOptions): Promise<OpenAPISchema> {
  const openApiSchema: OpenAPISchema = {
    openapi: "3.0.3",
    info: {
      title: options?.name || "Generated API",
      version: "1.0.0",
    },
    paths: {},
    components: {
      schemas: {},
    },
  };

  if (options?.serverUrl) {
    openApiSchema.servers = [
      {
        url: options.serverUrl,
        description: "API Server",
      },
    ];
  }

  for (const url of urls) {
    try {
      const markdownContent = await fetchMarkdown(url);
      if (!markdownContent) continue;

      const yamlBlocks = extractYamlCodeBlocks(markdownContent);

      for (const yamlBlock of yamlBlocks) {
        const pathInfo = parseOpenAPIFromYaml(yamlBlock.content, yamlBlock.method, yamlBlock.path);

        if (pathInfo) {
          const { path, method, spec, components } = pathInfo;

          if (!openApiSchema.paths[path]) {
            openApiSchema.paths[path] = {};
          }

          openApiSchema.paths[path][method] = spec;

          // Merge components if they exist
          if (components && components.schemas) {
            if (!openApiSchema.components) {
              openApiSchema.components = { schemas: {} };
            }
            if (!openApiSchema.components.schemas) {
              openApiSchema.components.schemas = {};
            }

            openApiSchema.components.schemas = {
              ...openApiSchema.components.schemas,
              ...components.schemas,
            };
          }
        }
      }
    } catch (error) {
      console.error(`Error processing ${url}:`, error);
    }
  }

  return openApiSchema;
}

export async function generateOpenAPIFromSitemap(
  sitemapUrl: string,
  options?: GenerateOpenAPIOptions,
): Promise<OpenAPISchema> {
  try {
    console.log("Fetching sitemap...");
    const urls = await fetchSitemap(sitemapUrl);
    console.log(`Found ${urls.length} URLs in sitemap`);

    console.log("Processing markdown files...");
    const openApiSchema = await processMarkdownFiles(urls, options);

    console.log("OpenAPI schema generation completed");
    return openApiSchema;
  } catch (error) {
    console.error("Error generating OpenAPI schema:", error);
    throw error;
  }
}

// Example usage
export async function main() {
  const sitemapUrl = process.argv[2];
  const serverUrl = process.argv[3];
  const name = process.argv[4];

  if (!sitemapUrl) {
    console.error("Please provide a sitemap URL as an argument");
    console.error("Usage: node script.js <sitemapUrl> [serverUrl] [name]");
    process.exit(1);
  }

  try {
    const options: GenerateOpenAPIOptions = {};
    if (serverUrl) {
      options.serverUrl = serverUrl;
    }
    if (name) {
      options.name = name;
    }
    
    const schema = await generateOpenAPIFromSitemap(sitemapUrl, options);
    console.log(JSON.stringify(schema, null, 2));
  } catch (error) {
    console.error("Failed to generate OpenAPI schema:", error);
    process.exit(1);
  }
}
