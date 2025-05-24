import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { dereferenceSync } from 'dereference-json-schema';


import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { OpenAPIV3 } from "openapi-types";

function getOperationRequestBody(
  operation: OpenAPIV3.OperationObject,
): OpenAPIV3.SchemaObject | undefined {
  if (!operation.requestBody) return undefined;

  const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject;
  const content = requestBody.content["application/json"];
  return content?.schema as OpenAPIV3.SchemaObject;
}

function getOperationParameters(operation: OpenAPIV3.OperationObject): {
  queryParams?: OpenAPIV3.SchemaObject;
  pathParams?: OpenAPIV3.SchemaObject;
} {
  if (!operation.parameters) return {};

  const queryProperties: Record<string, OpenAPIV3.SchemaObject> = {};
  const pathProperties: Record<string, OpenAPIV3.SchemaObject> = {};
  const queryRequired: string[] = [];
  const pathRequired: string[] = [];

  operation.parameters.forEach((param) => {
    if ("$ref" in param) return; // TODO referenced parameters

    if (param.in === "query") {
      queryProperties[param.name] = param.schema as OpenAPIV3.SchemaObject;
      if (param.required) queryRequired.push(param.name);
    } else if (param.in === "path") {
      pathProperties[param.name] = param.schema as OpenAPIV3.SchemaObject;
      if (param.required) pathRequired.push(param.name);
    }
  });

  const result: {
    queryParams?: OpenAPIV3.SchemaObject;
    pathParams?: OpenAPIV3.SchemaObject;
  } = {};

  if (Object.keys(queryProperties).length > 0) {
    result.queryParams = {
      type: "object",
      properties: queryProperties,
      required: queryRequired.length > 0 ? queryRequired : undefined,
    };
  }

  if (Object.keys(pathProperties).length > 0) {
    result.pathParams = {
      type: "object",
      properties: pathProperties,
      required: pathRequired.length > 0 ? pathRequired : undefined,
    };
  }

  return result;
}
function extractApiFromBaseUrl(openapi: OpenAPIV3.Document): string {
  if (openapi.servers && openapi.servers.length > 0) {
    return openapi.servers[0].url;
  }
  throw new Error("No servers defined in OpenAPI document");
}

function getAuthHeaders(openapi: OpenAPIV3.Document, operation?: OpenAPIV3.OperationObject): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = process.env.API_TOKEN;

  if (!token || !openapi.components?.securitySchemes) {
    return headers;
  }

  const securitySchemes = openapi.components.securitySchemes;

  // Check for operation-specific security requirements first
  let operationSecuritySchemes: string[] = [];
  if (operation?.security && operation.security.length > 0) {
    // Get the first security requirement from the operation
    const firstSecurityReq = operation.security[0];
    operationSecuritySchemes = Object.keys(firstSecurityReq);
  }

  // Find the preferred security scheme based on priority
  let selectedScheme: OpenAPIV3.SecuritySchemeObject | null = null;
  let selectedSchemeName = "";

  // Priority order: Bearer > OAuth2 > API Key > Basic
  const priorityOrder = ["bearer", "oauth2", "apiKey", "basic"];

  // First try to match operation-specific security schemes
  if (operationSecuritySchemes.length > 0) {
    for (const schemeName of operationSecuritySchemes) {
      const scheme = securitySchemes[schemeName];
      if (!scheme || "$ref" in scheme) continue;

      selectedScheme = scheme as OpenAPIV3.SecuritySchemeObject;
      selectedSchemeName = schemeName;
      break;
    }
  }

  // If no operation-specific scheme found, use priority-based selection
  if (!selectedScheme) {
    for (const priority of priorityOrder) {
      for (const [schemeName, scheme] of Object.entries(securitySchemes)) {
        if ("$ref" in scheme) continue;

        if (
          (priority === "bearer" && scheme.type === "http" && scheme.scheme === "bearer") ||
          (priority === "oauth2" && scheme.type === "oauth2") ||
          (priority === "apiKey" && scheme.type === "apiKey" && scheme.in === "header") ||
          (priority === "basic" && scheme.type === "http" && scheme.scheme === "basic")
        ) {
          selectedScheme = scheme as OpenAPIV3.SecuritySchemeObject;
          selectedSchemeName = schemeName;
          break;
        }
      }
      if (selectedScheme) break;
    }
  }

  // If no preferred scheme found, use the first available one
  if (!selectedScheme) {
    const entries = Object.entries(securitySchemes);
    if (entries.length > 0) {
      const [schemeName, scheme] = entries[0];
      if (!("$ref" in scheme)) {
        selectedScheme = scheme as OpenAPIV3.SecuritySchemeObject;
        selectedSchemeName = schemeName;
      }
    }
  }

  if (!selectedScheme) {
    return headers;
  }

  switch (selectedScheme.type) {
    case "http":
      if (selectedScheme.scheme === "bearer") {
        headers["Authorization"] = `Bearer ${token}`;
      } else if (selectedScheme.scheme === "basic") {
        headers["Authorization"] = `Basic ${token}`;
      }
      break;
    case "apiKey":
      if (selectedScheme.in === "header") {
        headers[selectedScheme.name] = token;
      }
      break;
    case "oauth2":
      headers["Authorization"] = `Bearer ${token}`;
      break;
  }

  return headers;
}

type Fetch = typeof fetch;

export function createMCPServer({
  name = "spiceflow",
  version = "1.0.0",
  openapi,
  basePath = "",
  fetch,
  paths,
  baseUrl = "",
}: {
  name?: string;
  version?: string;
  basePath?: string;
  fetch?: Fetch;
  openapi: OpenAPIV3.Document;
  paths?: string[];
  baseUrl?: string;
}) {
  const server = new Server(
    { name, version },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );
  if (!baseUrl) {
    baseUrl = extractApiFromBaseUrl(openapi);
  }
  openapi = dereferenceSync(openapi)


  async function fetchWithBaseServerAndAuth(u: string, options: RequestInit, operation?: OpenAPIV3.OperationObject) {
    const authHeaders = getAuthHeaders(openapi, operation);
    return await fetch!(new URL(u, baseUrl), {
      ...options,
      headers: {
        ...authHeaders,
        ...options?.headers,
      },
    });
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const filteredPaths = Object.entries(openapi.paths).filter(([path]) => {
      const normalizedPath = path.replace(basePath, "");
      if (["/openapi"].includes(normalizedPath)) return false;
      if (paths && paths.length > 0) {
        return paths.some((filterPath) =>
          normalizedPath.startsWith(filterPath),
        );
      }
      return true;
    });

    const tools = filteredPaths.flatMap(([path, pathObj]) =>
      Object.entries(pathObj || {})
        .filter(([method]) => method !== "parameters")
        .map(([method, operation]) => {
          const properties: Record<string, any> = {};
          const required: string[] = [];

          const requestBody = getOperationRequestBody(
            operation as OpenAPIV3.OperationObject,
          );
          if (requestBody) {
            properties.body = requestBody;
            required.push("body");
          }

          const { queryParams, pathParams } = getOperationParameters(
            operation as OpenAPIV3.OperationObject,
          );
          if (queryParams) {
            properties.query = queryParams;
          }
          if (pathParams) {
            properties.params = pathParams;
          }

          return {
            name: getRouteName({ method, path }),
            description:
              (operation as OpenAPIV3.OperationObject).description ||
              (operation as OpenAPIV3.OperationObject).summary ||
              `${method.toUpperCase()} ${path}`,
            inputSchema: {
              type: "object",
              properties,
              required: required.length > 0 ? required : undefined,
            },
          };
        }),
    );

    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    let { path, method } = getPathFromToolName(toolName);

    const pathObj = openapi.paths[path];
    if (!pathObj || !pathObj[method.toLowerCase()]) {
      return {
        content: [{ type: "text", text: `Tool ${toolName} not found` }],
        isError: true,
      };
    }

    try {
      const { body, query, params } = request.params.arguments || {};
      const operation = pathObj[method.toLowerCase()] as OpenAPIV3.OperationObject;

      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          path = path.replace(`{${key}}`, encodeURIComponent(String(value)));
        });
      }

      let fullPath = `${basePath}${path}`;
      if (query) {
        const searchParams = new URLSearchParams();
        Object.entries(query).forEach(([key, value]) => {
          searchParams.set(key, String(value));
        });
        fullPath += `?${searchParams.toString()}`;
      }

      const response = await fetchWithBaseServerAndAuth(fullPath, {
        method,
        headers: {
          "content-type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      }, operation);

      const isError = !response.ok;
      const contentType = response.headers.get("content-type");

      if (contentType?.includes("application/json")) {
        const json = await response.json();
        return {
          isError,
          content: [{ type: "text", text: JSON.stringify(json, null, 2) }],
        };
      }

      const text = await response.text();
      return {
        isError,
        content: [{ type: "text", text }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: error.message || "Unknown error" }],
        isError: true,
      };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources: { uri: string; mimeType: string; name: string }[] = [];
    for (const [path, pathObj] of Object.entries(openapi.paths)) {
      if (path.startsWith("/mcp")) {
        continue;
      }
      const getOperation = pathObj?.get as OpenAPIV3.OperationObject;
      if (getOperation && !path.includes("{")) {
        const { queryParams } = getOperationParameters(getOperation);
        const hasRequiredQuery =
          queryParams?.required && queryParams.required.length > 0;

        if (!hasRequiredQuery) {
          resources.push({
            uri: path,
            mimeType: "application/json",
            name: `GET ${path}`,
          });
        }
      }
    }
    return { resources: [] };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    throw new Error("Resources are not supported - use tools instead");
  });

  return { server };
}

function getRouteName({
  method,
  path,
}: {
  method: string;
  path: string;
}): string {
  return `${method.toUpperCase()} ${path}`;
}

function getPathFromToolName(toolName: string): {
  path: string;
  method: string;
} {
  const parts = toolName.split(" ");
  if (parts.length < 2) {
    throw new Error("Invalid tool name format");
  }
  const method = parts[0].toUpperCase();
  const path = parts.slice(1).join(" ");
  return { path, method };
}
