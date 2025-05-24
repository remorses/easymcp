import { parseStringPromise } from "xml2js";
import { remark } from "remark";
import { visit } from "unist-util-visit";
import * as yaml from "js-yaml";
import { OpenAPIV3 } from "openapi-types";

interface SitemapUrl {
  loc: string[];
}

interface Sitemap {
  urlset: {
    url: SitemapUrl[];
  };
}

interface GenerateOpenAPIOptions {
  serverUrl?: string;
  name?: string;
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
    const markdownUrl = url.endsWith(".md") ? url : `${url}.md`;
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

function extractYamlCodeBlocks(
  markdownContent: string,
  sourceUrl?: string,
): Array<{ content: string; method: string; path: string }> {
  const yamlBlocks: Array<{ content: string; method: string; path: string }> =
    [];

  const tree = remark().parse(markdownContent);
  visit(tree, "code", (node: any) => {
    // Look for YAML blocks
    if (node.lang === "yaml" && node.value) {
      // Check if it has method and path info in node.meta
      if (node.meta && typeof node.meta === "string") {
        const parts = node.meta.split(" ");
        if (parts.length >= 2) {
          const method = parts[0].toLowerCase();
          const path = parts[1];

          yamlBlocks.push({
            content: node.value,
            method,
            path,
          });
        } else {
          console.log(
            `Ignored YAML block in ${sourceUrl || "unknown file"}: Invalid meta format "${node.meta}" (expected: METHOD /path)`,
          );
        }
      } else {
        console.log(
          `Ignored YAML block in ${sourceUrl || "unknown file"}: No method/path in meta (found: "${JSON.stringify([node.lang, node.meta])}")`,
        );
      }
    }
  });

  return yamlBlocks;
}

function parseOpenAPIFromYaml(
  yamlContent: string,
  headerMethod: string,
  headerPath: string,
): {
  path: string;
  method: string;
  spec: OpenAPIV3.OperationObject;
  components?: OpenAPIV3.ComponentsObject;
} | null {
  try {
    const parsed = yaml.load(yamlContent) as any;

    if (parsed) {
      // Build OpenAPI operation specification from custom format
      const spec: any = {};

      // Handle parameters from request
      if (parsed.request) {
        const request = parsed.request;

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
      if (parsed.response) {
        spec.responses = parsed.response;
      }

      // Handle summary and description
      if (parsed.summary) {
        spec.summary = parsed.summary;
      }

      if (parsed.description) {
        spec.description = parsed.description;
      }

      // Add deprecated flag if present
      if (parsed.deprecated !== undefined) {
        spec.deprecated = parsed.deprecated;
      }

      // Handle tags
      if (parsed.tags) {
        spec.tags = parsed.tags;
      }

      // Extract components
      const components = parsed.components || undefined;

      return {
        path: headerPath,
        method: headerMethod,
        spec: spec as OpenAPIV3.OperationObject,
        components,
      };
    }

    return null;
  } catch (error) {
    console.error("Error parsing YAML:", error);
    return null;
  }
}

async function processMarkdownFiles(
  urls: string[],
  options?: GenerateOpenAPIOptions,
): Promise<OpenAPIV3.Document> {
  const openApiSchema: OpenAPIV3.Document = {
    openapi: "3.0.3",
    info: {
      title: options?.name || "Generated API",
      version: "1.0.0",
    },
    paths: {},
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

      const yamlBlocks = extractYamlCodeBlocks(markdownContent, url);

      for (const yamlBlock of yamlBlocks) {
        const pathInfo = parseOpenAPIFromYaml(
          yamlBlock.content,
          yamlBlock.method,
          yamlBlock.path,
        );

        if (pathInfo) {
          const { path, method, spec, components } = pathInfo;

          if (!openApiSchema.paths[path]) {
            openApiSchema.paths[path] = {};
          }

          (openApiSchema.paths[path] as any)[method] = spec;

          // Merge components if they exist
          if (components) {
            if (!openApiSchema.components) {
              openApiSchema.components = {};
            }

            // Merge all component types
            Object.keys(components).forEach((componentType) => {
              if (
                !openApiSchema.components![
                  componentType as keyof OpenAPIV3.ComponentsObject
                ]
              ) {
                (openApiSchema.components as any)[componentType] = {};
              }
              (openApiSchema.components as any)[componentType] = {
                ...(openApiSchema.components as any)[componentType],
                ...components[
                  componentType as keyof OpenAPIV3.ComponentsObject
                ],
              };
            });
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
): Promise<OpenAPIV3.Document> {
  try {
    console.log("Fetching sitemap...");
    const urls = await fetchSitemap(sitemapUrl);
    console.log(`Found ${urls.length} URLs in sitemap`);

    console.log("Processing markdown files...");
    const openApiSchema = await processMarkdownFiles(
      urls.map((x) => x + ".md"),
      options,
    );

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
