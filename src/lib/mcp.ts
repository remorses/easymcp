import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { dereferenceSync } from "dereference-json-schema";

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
    const paramObj = param as OpenAPIV3.ParameterObject;
    if (paramObj.in === "query") {
      queryProperties[paramObj.name] =
        paramObj.schema as OpenAPIV3.SchemaObject;
      if (paramObj.required) queryRequired.push(paramObj.name);
    } else if (paramObj.in === "path") {
      pathProperties[paramObj.name] = paramObj.schema as OpenAPIV3.SchemaObject;
      if (paramObj.required) pathRequired.push(paramObj.name);
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

function getAuthHeaders(
  openapi: OpenAPIV3.Document,
  operation?: OpenAPIV3.OperationObject,
): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = process.env.API_TOKEN;

  if (!token || !openapi.components?.securitySchemes) {
    return headers;
  }

  const securitySchemes = openapi.components.securitySchemes;
  let selectedScheme: OpenAPIV3.SecuritySchemeObject | null = null;

  // Check for operation-specific security requirements first
  if (operation?.security && operation.security.length > 0) {
    const firstSecurityReq = operation.security[0];
    const operationSchemeNames = Object.keys(firstSecurityReq);

    for (const schemeName of operationSchemeNames) {
      const scheme = securitySchemes[schemeName];
      if (scheme) {
        selectedScheme = scheme as OpenAPIV3.SecuritySchemeObject;
        break;
      }
    }
  }

  // If no operation-specific scheme found, use the first available scheme
  if (!selectedScheme) {
    const schemes = Object.values(securitySchemes);
    if (schemes.length > 0) {
      selectedScheme = schemes[0] as OpenAPIV3.SecuritySchemeObject;
    }
  }

  if (!selectedScheme) {
    return headers;
  }

  // Set headers based on scheme type
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
const defaultFetch = fetch;

export function createMCPServer({
  name = "spiceflow",
  version = "1.0.0",
  openapi,
  basePath = "",
  fetch = defaultFetch,
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
  openapi = dereferenceSync(openapi);
  if (!baseUrl) {
    baseUrl = extractApiFromBaseUrl(openapi);
  }

  async function fetchWithBaseServerAndAuth(
    u: string,
    options: RequestInit,
    operation?: OpenAPIV3.OperationObject,
  ) {
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
      const operation = pathObj[
        method.toLowerCase()
      ] as OpenAPIV3.OperationObject;

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

      const response = await fetchWithBaseServerAndAuth(
        fullPath,
        {
          method,
          headers: {
            "content-type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        },
        operation,
      );

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

  // server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  //   throw new Error("Resources are not supported - use tools instead");
  // });

  return { server };
}

function getRouteName({
  method,
  path,
}: {
  method: string;
  path: string;
}): string {
  return formatToolName(`${method.toUpperCase()} ${path}`, method, path);
}

const toolNameToPath = new Map<string, { method: string; path: string }>();

function getPathFromToolName(toolName: string): {
  path: string;
  method: string;
} {
  const cached = toolNameToPath.get(toolName);
  if (cached) {
    return cached;
  }
  throw new Error(`Tool name '${toolName}' not found. It might not have been registered or was invalid.`);
}

function formatToolName(nameToFormat: string, method: string, pathForMap: string): string {
  if (!nameToFormat || nameToFormat.trim() === "") {
    throw new Error("Original tool name for formatting cannot be empty");
  }

  // Replace spaces and other invalid characters with underscores
  let formatted = nameToFormat
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_") // Replace multiple underscores with single underscore
    .replace(/^_+|_+$/g, ""); // Remove leading/trailing underscores

  // Truncate to 64 characters if necessary
  if (formatted.length > 64) {
    formatted = formatted.substring(0, 64);
  }

  // Remove trailing underscores again in case truncation created them or they persisted
  formatted = formatted.replace(/_+$/, "");

  if (formatted === "") {
    throw new Error(`Tool name results in empty string after formatting (from original: '${nameToFormat}')`);
  }

  // Validate against regex
  const regex = /^[a-zA-Z0-9_-]{1,64}$/;
  if (!regex.test(formatted)) {
    throw new Error(
      `Formatted tool name "${formatted}" (from original: '${nameToFormat}') does not match required pattern: ^[a-zA-Z0-9_-]{1,64}$`,
    );
  }

  // Check for duplicates: if this formatted name already exists and belongs to a DIFFERENT tool (method/path), it's a collision.
  const existingEntry = toolNameToPath.get(formatted);
  if (existingEntry && (existingEntry.method !== method || existingEntry.path !== pathForMap)) {
      throw new Error(
          `Duplicate tool name generated: '${formatted}'. ` +
          `This name was generated for original: '${nameToFormat}' (method: '${method}', path: '${pathForMap}'). ` +
          `It conflicts with an existing tool that also maps to '${formatted}', originally from (method: '${existingEntry.method}', path: '${existingEntry.path}'). ` +
          `Ensure operationIds or path/method combinations in your OpenAPI spec are sufficiently unique to avoid naming collisions after formatting.`
      );
  }

  // Register the name with its method and path.
  // If the same tool (method/path) is formatted again to the same name, this just overwrites with identical values.
  toolNameToPath.set(formatted, { method, path: pathForMap });

  return formatted;
}
