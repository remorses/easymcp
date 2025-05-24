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
  securitySchemeNames?: string[];
} | null {
  try {
    const parsed = yaml.load(yamlContent) as any;

    if (parsed && parsed.paths) {
      const spec: any = {};
      const pathData = parsed.paths;

      // Use path and method from YAML if available, otherwise use header values
      const path = pathData.path || headerPath;
      const method = pathData.method || headerMethod;
      const securitySchemeNames: string[] = [];

      // Handle parameters from request
      if (pathData.request) {
        const request = pathData.request;

        // Add parameters (path, query, header, cookie)
        const parameters: any[] = [];

        if (request.parameters) {
          // Path parameters
          if (request.parameters.path && Object.keys(request.parameters.path).length > 0) {
            Object.entries(request.parameters.path).forEach(
              ([name, param]: [string, any]) => {
                parameters.push({
                  name,
                  in: "path",
                  required: param.schema?.[0]?.required !== false,
                  schema: param.schema?.[0]
                    ? {
                        type: param.schema[0].type || "string",
                        ...(param.schema[0].title && {
                          title: param.schema[0].title,
                        }),
                        ...(param.schema[0].description && {
                          description: param.schema[0].description,
                        }),
                      }
                    : { type: "string" },
                });
              },
            );
          }

          // Query parameters
          if (request.parameters.query && Object.keys(request.parameters.query).length > 0) {
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

          // Header parameters (skip API key headers as they're handled in security)
          if (request.parameters.header && Object.keys(request.parameters.header).length > 0) {
            Object.entries(request.parameters.header).forEach(
              ([name, param]: [string, any]) => {
                if (!name.toLowerCase().includes("api") && param.type !== "apiKey") {
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
          const requestBody: any = {
            content: {},
          };

          // Process each content type in the body
          Object.entries(request.body).forEach(([contentType, bodyDef]: [string, any]) => {
            if (bodyDef.schemaArray && bodyDef.schemaArray.length > 0) {
              const schema = bodyDef.schemaArray[0];
              requestBody.content[contentType] = {
                schema: convertSchema(schema),
              };

              if (bodyDef.examples) {
                requestBody.content[contentType].examples = bodyDef.examples;
              }
            }
          });

          if (Object.keys(requestBody.content).length > 0) {
            spec.requestBody = requestBody;
          }
        }

        // Add security if present
        if (request.security && Array.isArray(request.security)) {
          spec.security = request.security.map((securityItem: any) => {
            if (securityItem.parameters?.header) {
              // Convert Mintlify security format to OpenAPI format
              const securitySchemes: any = {};
              Object.entries(securityItem.parameters.header).forEach(([name, header]: [string, any]) => {
                if (header.type === 'apiKey') {
                  const schemeName = securityItem.title || name;
                  securitySchemes[schemeName] = [];
                  securitySchemeNames.push(schemeName);
                }
              });
              return securitySchemes;
            }
            return securityItem;
          });
        }
      }

      // Handle responses
      if (pathData.response) {
        const responses: any = {};
        
        Object.entries(pathData.response).forEach(([statusCode, responseDef]: [string, any]) => {
          const response: any = {};
          
          if (responseDef.description) {
            response.description = responseDef.description;
          }
          
          // Process response content
          if (typeof responseDef === 'object' && !responseDef.description) {
            response.content = {};
            Object.entries(responseDef).forEach(([contentType, contentDef]: [string, any]) => {
              if (contentDef.schemaArray && contentDef.schemaArray.length > 0) {
                const schema = contentDef.schemaArray[0];
                response.content[contentType] = {
                  schema: convertSchema(schema),
                };

                if (contentDef.examples) {
                  response.content[contentType].examples = contentDef.examples;
                }
              }
              
              if (contentDef.description) {
                response.description = contentDef.description;
              }
            });
          }
          
          if (!response.description) {
            response.description = 'Successful response';
          }
          
          responses[statusCode] = response;
        });
        
        spec.responses = responses;
      }

      // Handle summary and description
      if (pathData.summary) {
        spec.summary = pathData.summary;
      }

      if (pathData.description) {
        spec.description = pathData.description;
      }

      // Add deprecated flag if present
      if (pathData.deprecated !== undefined) {
        spec.deprecated = pathData.deprecated;
      }

      // Handle tags
      if (pathData.tags) {
        spec.tags = pathData.tags;
      }

      // Extract and process components
      let components = parsed.components || {};
      
      // Extract schemas from request body and responses
      const extractedSchemas: any = {};
      
      // Extract schemas from request body
      if (pathData.request?.body) {
        Object.values(pathData.request.body).forEach((bodyDef: any) => {
          if (bodyDef.schemaArray) {
            bodyDef.schemaArray.forEach((schema: any) => {
              if (schema.refIdentifier && schema.title) {
                const schemaName = schema.title;
                extractedSchemas[schemaName] = convertSchema(schema);
              }
            });
          }
        });
      }
      
      // Extract schemas from responses
      if (pathData.response) {
        Object.values(pathData.response).forEach((responseDef: any) => {
          Object.values(responseDef).forEach((contentDef: any) => {
            if (contentDef.schemaArray) {
              contentDef.schemaArray.forEach((schema: any) => {
                if (schema.refIdentifier && schema.title) {
                  const schemaName = schema.title;
                  extractedSchemas[schemaName] = convertSchema(schema);
                }
              });
            }
          });
        });
      }
      
      // Merge extracted schemas with existing components
      if (Object.keys(extractedSchemas).length > 0) {
        if (!components.schemas) {
          components.schemas = {};
        }
        components.schemas = {
          ...components.schemas,
          ...extractedSchemas,
        };
      }

      return {
        path,
        method,
        spec: spec as OpenAPIV3.OperationObject,
        components: Object.keys(components).length > 0 ? components : undefined,
        securitySchemeNames,
      };
    }

    return null;
  } catch (error) {
    console.error("Error parsing YAML:", error);
    return null;
  }
}

// Helper function to convert Mintlify schema format to OpenAPI schema format
function convertSchema(schema: any): any {
  if (!schema) return {};

  // Handle $ref first
  if (schema.$ref) {
    return { $ref: schema.$ref };
  }

  // Handle refIdentifier (convert to $ref)
  if (schema.refIdentifier) {
    return { $ref: schema.refIdentifier };
  }

  const converted: any = {};

  if (schema.type) converted.type = schema.type;
  if (schema.title) converted.title = schema.title;
  if (schema.description) converted.description = schema.description;
  if (schema.examples) converted.examples = schema.examples;
  if (schema.format) converted.format = schema.format;
  if (schema.default !== undefined) converted.default = schema.default;

  // Handle properties for object types
  if (schema.properties) {
    converted.properties = {};
    Object.entries(schema.properties).forEach(([key, prop]: [string, any]) => {
      if (prop.allOf && prop.allOf.length > 0) {
        // For allOf, use the first schema in the array
        converted.properties[key] = convertSchema(prop.allOf[0]);
      } else {
        converted.properties[key] = convertSchema(prop);
      }
    });
  }

  // Handle required properties - check both 'required' and 'requiredProperties'
  if (schema.requiredProperties) {
    converted.required = schema.requiredProperties;
  } else if (schema.required && Array.isArray(schema.required)) {
    converted.required = schema.required;
  }

  // Handle array items
  if (schema.items) {
    if (schema.items.allOf && schema.items.allOf.length > 0) {
      // For items with allOf, extract the $ref if present
      const firstItem = schema.items.allOf[0];
      if (firstItem.$ref) {
        converted.items = { $ref: firstItem.$ref };
      } else {
        converted.items = convertSchema(firstItem);
      }
    } else {
      converted.items = convertSchema(schema.items);
    }
  }

  // Handle allOf - convert each item
  if (schema.allOf && schema.allOf.length > 0) {
    if (schema.allOf.length === 1) {
      // If only one item in allOf, flatten it
      return convertSchema(schema.allOf[0]);
    } else {
      converted.allOf = schema.allOf.map((item: any) => convertSchema(item));
    }
  }

  // Handle anyOf
  if (schema.anyOf) {
    converted.anyOf = schema.anyOf.map((item: any) => convertSchema(item));
  }

  // Handle oneOf
  if (schema.oneOf) {
    converted.oneOf = schema.oneOf.map((item: any) => convertSchema(item));
  }

  return converted;
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

  const securitySchemes = new Set<string>();

  for (const url of urls) {
    try {
      const markdownContent = await fetchMarkdown(url);
      if (!markdownContent) continue;

      const yamlBlocks = extractYamlCodeBlocks(markdownContent, url);

      for (const yamlBlock of yamlBlocks) {
        console.log(yamlBlock.content)
        const pathInfo = parseOpenAPIFromYaml(
          yamlBlock.content,
          yamlBlock.method,
          yamlBlock.path,
        );

        if (pathInfo) {
          const { path, method, spec, components, securitySchemeNames } = pathInfo;

          if (!openApiSchema.paths[path]) {
            openApiSchema.paths[path] = {};
          }

          (openApiSchema.paths[path] as any)[method] = spec;

          // Track security schemes
          if (securitySchemeNames) {
            securitySchemeNames.forEach(name => securitySchemes.add(name));
          }

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

  // Add security schemes to components
  if (securitySchemes.size > 0) {
    if (!openApiSchema.components) {
      openApiSchema.components = {};
    }
    if (!openApiSchema.components.securitySchemes) {
      openApiSchema.components.securitySchemes = {};
    }

    securitySchemes.forEach(schemeName => {
      openApiSchema.components!.securitySchemes![schemeName] = {
        type: "apiKey",
        in: "header",
        name: schemeName.toLowerCase().includes("x-api-key") ? "x-api-key" : "X-API-KEY",
      };
    });
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
