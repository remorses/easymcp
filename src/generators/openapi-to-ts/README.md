# OpenAPI to TypeScript and MCP Generator

This generator converts OpenAPI 3.0 specifications into TypeScript definitions and Model Context Protocol (MCP) servers, enabling seamless integration of REST APIs with MCP-compatible applications.

## Features

- **TypeScript Models**: Generate TypeScript classes and interfaces from OpenAPI schemas
- **MCP Tools**: Convert API endpoints to MCP tools for interactive API calls
- **MCP Resources**: Transform GET endpoints into MCP resources for data access
- **Zod Validation**: Automatic parameter validation using Zod schemas
- **Error Handling**: Comprehensive error handling and reporting

## Usage

### Basic Usage

```typescript
import { OpenAPIToTypescriptProcessor } from './processor.js';

const processor = new OpenAPIToTypescriptProcessor({
  outputDir: './generated',
  apiName: 'my-api',
  generateModels: true,
  generateMcpTools: true,
  generateMcpResources: true
});

const result = await processor.process(openApiDocument);
```

### MCP Server Integration

The generator creates a complete MCP server class that can be used directly:

```typescript
import { MyApiMcpServer } from './generated/mcp/my-api/server.js';

// Create and start the MCP server
const server = new MyApiMcpServer('https://api.example.com');
const mcpServer = await server.start();

// Connect to a transport (e.g., HTTP, WebSocket)
await mcpServer.connect(transport);
```

## Generated Structure

```
generated/
├── models/
│   └── my-api/
│       ├── User.ts
│       ├── CreateUserRequest.ts
│       └── index.ts
└── mcp/
    └── my-api/
        ├── server.ts
        └── config.ts
```

## MCP Tools

Each API endpoint is converted to an MCP tool:

- **GET /users** → `getUsers` tool
- **POST /users** → `postUsers` tool  
- **GET /users/{id}** → `getUsersById` tool
- **PUT /users/{id}** → `putUsersById` tool
- **DELETE /users/{id}** → `deleteUsersById` tool

### Tool Features

- Automatic parameter extraction from path, query, and body
- Zod schema validation for all inputs
- HTTP error handling with meaningful messages
- JSON response formatting

## MCP Resources

GET endpoints are also converted to MCP resources for read-only data access:

- **GET /users** → `users` resource at `my-api://users`
- **GET /users/{id}** → `users-id` resource at `my-api://users/{id}`

### Resource Features

- URI template support for parameterized endpoints
- Automatic MIME type detection
- Error handling with fallback content
- Support for query parameters

## Configuration Options

```typescript
interface GeneratorOptions {
  outputDir: string;                    // Output directory for generated files
  apiName: string;                      // API name for file organization
  modelNamePrefix?: string;             // Prefix for model class names
  modelNameSuffix?: string;             // Suffix for model class names
  generateClients?: boolean;            // Generate HTTP clients (future)
  generateServices?: boolean;           // Generate service classes (future)
  generateModels?: boolean;             // Generate TypeScript models
  generateMcpTools?: boolean;           // Generate MCP tools
  generateMcpResources?: boolean;       // Generate MCP resources
}
```

## OpenAPI Support

### Supported Features

- ✅ Path parameters (`/users/{id}`)
- ✅ Query parameters (`?limit=10&offset=0`)
- ✅ Request bodies (JSON, form data)
- ✅ Response schemas and MIME types
- ✅ Parameter validation and descriptions
- ✅ HTTP methods (GET, POST, PUT, PATCH, DELETE, etc.)
- ✅ Schema references (`$ref`)
- ✅ Enum types and validation
- ✅ Array and object types
- ✅ String formats (email, date, datetime, etc.)

### Limitations

- Schema references in generated code use `z.any()` (will be improved)
- Complex nested schemas may need manual refinement
- Authentication headers not automatically included (configure manually)

## Example

See `src/examples/generate-mcp-from-openapi.ts` for a complete working example that demonstrates:

- Creating an OpenAPI specification
- Generating TypeScript models and MCP server
- Using the generated MCP server

## Error Handling

The generator includes comprehensive error handling:

- **Validation Errors**: Invalid OpenAPI specifications
- **Generation Errors**: Issues during code generation
- **Runtime Errors**: HTTP errors during API calls
- **Type Errors**: Parameter validation failures

All errors are properly formatted and include helpful context for debugging.

## Integration with MCP Clients

The generated MCP servers are compatible with any MCP client, including:

- Claude Desktop
- MCP Inspector
- Custom MCP applications

Tools and resources appear automatically in the client interface with proper descriptions and parameter validation. 