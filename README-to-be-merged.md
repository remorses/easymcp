# OpenAPI to MCP Generator

A powerful tool that automatically converts OpenAPI specifications into MCP (Model Context Protocol) servers with tools and resources, plus TypeScript models.

## 🚀 Features

- **TypeScript Models**: Generate strongly-typed TypeScript classes from OpenAPI schemas
- **MCP Tools**: Convert API endpoints to MCP tools with automatic parameter validation
- **MCP Resources**: Transform GET endpoints into MCP resources for read-only access
- **Zod Validation**: Automatic schema validation using Zod
- **HTTP Client**: Built-in HTTP client with error handling
- **NPM Publishing**: One-command publishing to npm registry
- **CLI Interface**: Easy-to-use command-line interface

## 📦 Installation

```bash
npm install -g openapi-mcp-generator
```

Or clone and build locally:

```bash
git clone <repository-url>
cd openapi-mcp-generator
npm install
npm run build
```

## 🔧 Usage

### CLI Tool

Convert any OpenAPI specification to MCP server:

```bash
# Basic usage
openapi-to-mcp ./path/to/openapi.json

# With custom options
openapi-to-mcp ./api-spec.yaml \
  --output ./my-output \
  --api-name my-api \
  --base-url https://api.example.com \
  --verbose

# Publish to npm
openapi-to-mcp ./openapi.json --publish --npm-scope @my-org
```

### Programmatic Usage

```typescript
import { OpenAPIToTypescriptProcessor } from './src/generators/openapi-to-ts/processor.js';

const processor = new OpenAPIToTypescriptProcessor({
  outputDir: './generated',
  apiName: 'my-api',
  generateModels: true,
  generateMcpTools: true,
  generateMcpResources: true
});

const result = await processor.process(openApiSchema);
```

## 📁 Generated Structure

```
generated/
├── models/api-name/          # TypeScript models
│   ├── User.ts
│   ├── Product.ts
│   └── index.ts
└── mcp/api-name/            # MCP server
    ├── server.ts            # Main server class
    └── config.ts            # API configuration
```

## 🛠️ Generated MCP Tools

For each API endpoint, the generator creates:

- **Tools**: Interactive operations (GET, POST, PUT, DELETE)
- **Resources**: Read-only access to GET endpoints
- **Validation**: Zod schemas for all parameters
- **Error Handling**: Comprehensive HTTP error handling

### Example Generated Tool

```typescript
// From: GET /users/{id}
async getUsersById(args: { id: string }) {
  const response = await this.httpClient.get(`/users/${args.id}`);
  return response.data;
}
```

### Example Generated Resource

```typescript
// From: GET /users
{
  uri: "my-api://users",
  name: "Users list",
  mimeType: "application/json"
}
```

## 🎯 Examples

### Pokemon API

```bash
# Generate Pokemon MCP server
openapi-to-mcp ./data/openapis/jsons/pokeapi.json \
  --api-name pokemon \
  --output ./generated

# Use the generated server
import { PokemonMcpServer } from './generated/mcp/pokemon/server.js';

const server = new PokemonMcpServer();
await server.start();
```

### User Management API

```bash
# Generate and publish to npm
openapi-to-mcp ./user-api.json \
  --api-name user-management \
  --publish \
  --npm-scope @my-company
```

## 🔧 CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--output, -o` | Output directory | `./generated` |
| `--api-name, -n` | Override API name | From OpenAPI title |
| `--base-url, -b` | Override base URL | From OpenAPI servers |
| `--no-models` | Skip TypeScript models | `false` |
| `--no-tools` | Skip MCP tools | `false` |
| `--no-resources` | Skip MCP resources | `false` |
| `--verbose, -v` | Verbose output | `false` |
| `--publish` | Publish to npm | `false` |
| `--npm-scope` | NPM scope | `@ema.viv` |
| `--npm-version` | NPM version | Auto-increment |

## 🏗️ Architecture

### Core Components

- **`OpenAPIToTypescriptProcessor`**: Main processing engine
- **`McpToolGenerator`**: Converts endpoints to MCP tools
- **`McpResourceGenerator`**: Converts GET endpoints to resources
- **`TypescriptModelGenerator`**: Generates TypeScript models
- **`NpmPublisher`**: Handles npm package publishing

### Generated MCP Server Features

- **Tool Registration**: Automatic tool discovery and registration
- **Resource Management**: URI-based resource access
- **Parameter Validation**: Zod schema validation
- **Error Handling**: Comprehensive HTTP error responses
- **Type Safety**: Full TypeScript support

## 🧪 Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Development Mode

```bash
npm run dev
```

## 📝 Supported OpenAPI Features

- ✅ OpenAPI 3.0+ specifications
- ✅ Path parameters (`/users/{id}`)
- ✅ Query parameters
- ✅ Request bodies (JSON, form data)
- ✅ Response schemas
- ✅ HTTP methods (GET, POST, PUT, DELETE, PATCH)
- ✅ Authentication headers
- ✅ Multiple content types
- ✅ Nested object schemas
- ✅ Array schemas
- ✅ Enum values

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🔗 Related Projects

- [Model Context Protocol](https://github.com/modelcontextprotocol/specification)
- [OpenAPI Specification](https://swagger.io/specification/)
- [Zod](https://github.com/colinhacks/zod)

## 🆘 Support

- Create an issue for bug reports
- Start a discussion for feature requests
- Check existing issues before creating new ones

---

**Generated with ❤️ by OpenAPI MCP Generator**
