import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { OpenAPIToTypescriptProcessor } from '../generators/openapi-to-ts/processor.js';
import { parseStringPromise } from 'xml2js';
import { OpenAPIV3 } from 'openapi-types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { paramCase, pascalCase } from 'change-case';

export class OpenAPIGeneratorServer {
  private server: McpServer;
  private processor!: OpenAPIToTypescriptProcessor;

  constructor(private readonly outputDir: string) {
    this.server = new McpServer({
      name: 'openapi-generator',
      version: '1.0.0'
    });

    this.setupTools();
  }

  private getApiName(spec: OpenAPIV3.Document): string {
    // Try to get a name from the OpenAPI info
    if (spec.info?.title) {
      return paramCase(spec.info.title);
    }
    
    // Generate a default name using timestamp
    return `api-${Date.now()}`;
  }

  private async loadOpenApiFromFile(filePath: string): Promise<OpenAPIV3.Document> {
    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();
    
    if (ext === '.json') {
      return JSON.parse(content);
    } else if (ext === '.yaml' || ext === '.yml') {
      const yaml = require('js-yaml');
      return yaml.load(content);
    } else {
      // Try JSON first, then YAML
      try {
        return JSON.parse(content);
      } catch {
        const yaml = require('js-yaml');
        return yaml.load(content);
      }
    }
  }

  private setupTools() {
    // Tool to generate from file path - UNIFIED APPROACH
    this.server.tool(
      'generate-mcp-from-file',
      'Generate MCP server from OpenAPI specification file (supports any OpenAPI schema)',
      {
        filePath: z.string().describe('Path to OpenAPI specification file (JSON or YAML)'),
        options: z.object({
          apiName: z.string().optional().describe('Override API name (defaults to title from OpenAPI spec)'),
          generateModels: z.boolean().optional().default(true).describe('Generate TypeScript model classes'),
          generateTools: z.boolean().optional().default(true).describe('Generate MCP tools from all endpoints'),
          generateResources: z.boolean().optional().default(true).describe('Generate MCP resources from GET endpoints'),
          baseUrl: z.string().optional().describe('Override the base URL for API calls'),
          outputDir: z.string().optional().describe('Override output directory (defaults to server output dir)')
        }).optional()
      },
      async ({ filePath, options }) => {
        try {
          // Check if file exists
          try {
            await fs.access(filePath);
          } catch {
            return {
              content: [{
                type: 'text',
                text: `Error: File not found: ${filePath}`
              }],
              isError: true
            };
          }

          // Load and parse OpenAPI spec from file
          const spec = await this.loadOpenApiFromFile(filePath);

          // Get API name from options, spec, or generate default
          const apiName = options?.apiName || this.getApiName(spec);

          // Override base URL if provided
          if (options?.baseUrl && spec.servers) {
            spec.servers[0] = { url: options.baseUrl };
          }

          // Determine output directory
          const outputDir = options?.outputDir || this.outputDir;

          // Create processor with options
          this.processor = new OpenAPIToTypescriptProcessor({
            outputDir,
            apiName,
            generateModels: options?.generateModels !== false,
            generateMcpTools: options?.generateTools !== false,
            generateMcpResources: options?.generateResources !== false,
            generateClients: false,
            generateServices: false
          });

          // Process the OpenAPI spec
          const result = await this.processor.process(spec);

          // Write generated files
          for (const file of result.files) {
            const fullPath = path.resolve(outputDir, file.path);
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, file.content, 'utf8');
          }

          const modelFiles = result.files.filter(f => f.path.startsWith('models/'));
          const mcpFiles = result.files.filter(f => f.path.startsWith('mcp/'));

          return {
            content: [{
              type: 'text',
              text: `Successfully generated MCP server from "${filePath}" for API "${apiName}":\n\n` +
                    `📊 Summary:\n` +
                    `- Total files: ${result.files.length}\n` +
                    `- Model files: ${modelFiles.length}\n` +
                    `- MCP server files: ${mcpFiles.length}\n` +
                    `- API Title: ${spec.info.title}\n` +
                    `- API Version: ${spec.info.version}\n\n` +
                    `📁 Generated files:\n` +
                    result.files.map(f => `- ${f.path}`).join('\n') +
                    (result.warnings.length ? '\n\n⚠️  Warnings:\n' + result.warnings.join('\n') : '') +
                    (mcpFiles.length > 0 ? '\n\n🔧 To use the generated MCP server:\n' +
                      `import { ${pascalCase(apiName)}McpServer } from './${path.posix.join(outputDir, 'mcp', apiName, 'server.js')}';\n` +
                      `const server = new ${pascalCase(apiName)}McpServer('${options?.baseUrl || spec.servers?.[0]?.url || 'https://api.example.com'}');\n` +
                      'await server.start();' : '') +
                    '\n\n📋 Generated structure:\n' +
                    `${outputDir}/\n` +
                    (modelFiles.length > 0 ? `├── models/${apiName}/\n│   ├── [TypeScript model classes]\n│   └── index.ts\n` : '') +
                    (mcpFiles.length > 0 ? `└── mcp/${apiName}/\n    ├── server.ts (MCP server)\n    └── config.ts (API config)` : '')
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error processing OpenAPI file: ${error}`
            }],
            isError: true
          };
        }
      }
    );

    // Tool to generate TypeScript code from OpenAPI spec
    this.server.tool(
      'generate-typescript',
      'Generate TypeScript code from OpenAPI specification',
      {
        openapi: z.string().describe('OpenAPI specification in JSON or YAML format'),
        options: z.object({
          modelNamePrefix: z.string().optional(),
          modelNameSuffix: z.string().optional(),
          generateClients: z.boolean().optional(),
          generateServices: z.boolean().optional(),
          generateModels: z.boolean().optional(),
          generateMcpTools: z.boolean().optional().describe('Generate MCP tools from API endpoints'),
          generateMcpResources: z.boolean().optional().describe('Generate MCP resources from GET endpoints'),
          apiName: z.string().optional()
        }).optional()
      },
      async ({ openapi, options }) => {
        try {
          // Parse OpenAPI spec
          let spec: OpenAPIV3.Document;
          try {
            spec = JSON.parse(openapi);
          } catch {
            // If JSON parsing fails, try parsing as YAML
            const yaml = require('js-yaml');
            spec = yaml.load(openapi);
          }

          // Get API name from options, spec, or generate default
          const apiName = options?.apiName || this.getApiName(spec);

          // Create processor with options
          this.processor = new OpenAPIToTypescriptProcessor({
            outputDir: this.outputDir,
            apiName,
            modelNamePrefix: options?.modelNamePrefix,
            modelNameSuffix: options?.modelNameSuffix,
            generateClients: options?.generateClients,
            generateServices: options?.generateServices,
            generateModels: options?.generateModels,
            generateMcpTools: options?.generateMcpTools,
            generateMcpResources: options?.generateMcpResources
          });

          // Process the OpenAPI spec
          const result = await this.processor.process(spec);

          // Write generated files
          for (const file of result.files) {
            const fullPath = path.resolve(this.outputDir, file.path);
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, file.content, 'utf8');
          }

          const mcpFilesCount = result.files.filter(f => f.path.startsWith('mcp/')).length;
          const modelFilesCount = result.files.filter(f => f.path.startsWith('models/')).length;

          return {
            content: [{
              type: 'text',
              text: `Successfully generated ${result.files.length} files for API "${apiName}":\n` +
                    `- ${modelFilesCount} model files\n` +
                    `- ${mcpFilesCount} MCP server files\n\n` +
                    'Generated files:\n' +
                    result.files.map(f => `- ${f.path}`).join('\n') +
                    (result.warnings.length ? '\n\nWarnings:\n' + result.warnings.join('\n') : '') +
                    (mcpFilesCount > 0 ? '\n\nTo use the generated MCP server:\n' +
                      `import { ${pascalCase(apiName)}McpServer } from './mcp/${apiName}/server.js';\n` +
                      `const server = new ${pascalCase(apiName)}McpServer();\n` +
                      'await server.start();' : '')
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error generating TypeScript code: ${error}`
            }],
            isError: true
          };
        }
      }
    );

    // Tool to generate only MCP server from OpenAPI spec
    this.server.tool(
      'generate-mcp-server',
      'Generate only MCP server (tools and resources) from OpenAPI specification',
      {
        openapi: z.string().describe('OpenAPI specification in JSON or YAML format'),
        options: z.object({
          apiName: z.string().optional(),
          generateTools: z.boolean().optional().default(true).describe('Generate MCP tools from all endpoints'),
          generateResources: z.boolean().optional().default(true).describe('Generate MCP resources from GET endpoints'),
          baseUrl: z.string().optional().describe('Override the base URL for API calls')
        }).optional()
      },
      async ({ openapi, options }) => {
        try {
          // Parse OpenAPI spec
          let spec: OpenAPIV3.Document;
          try {
            spec = JSON.parse(openapi);
          } catch {
            // If JSON parsing fails, try parsing as YAML
            const yaml = require('js-yaml');
            spec = yaml.load(openapi);
          }

          // Get API name from options, spec, or generate default
          const apiName = options?.apiName || this.getApiName(spec);

          // Override base URL if provided
          if (options?.baseUrl && spec.servers) {
            spec.servers[0] = { url: options.baseUrl };
          }

          // Create processor with MCP-only options
          this.processor = new OpenAPIToTypescriptProcessor({
            outputDir: this.outputDir,
            apiName,
            generateModels: false,
            generateClients: false,
            generateServices: false,
            generateMcpTools: options?.generateTools !== false,
            generateMcpResources: options?.generateResources !== false
          });

          // Process the OpenAPI spec
          const result = await this.processor.process(spec);

          // Write generated files
          for (const file of result.files) {
            const fullPath = path.resolve(this.outputDir, file.path);
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, file.content, 'utf8');
          }

          const toolsGenerated = options?.generateTools !== false;
          const resourcesGenerated = options?.generateResources !== false;

          return {
            content: [{
              type: 'text',
              text: `Successfully generated MCP server for API "${apiName}":\n` +
                    `- ${result.files.length} files generated\n` +
                    `- Tools: ${toolsGenerated ? 'Yes' : 'No'}\n` +
                    `- Resources: ${resourcesGenerated ? 'Yes' : 'No'}\n\n` +
                    'Generated files:\n' +
                    result.files.map(f => `- ${f.path}`).join('\n') +
                    (result.warnings.length ? '\n\nWarnings:\n' + result.warnings.join('\n') : '') +
                    '\n\nTo use the generated MCP server:\n' +
                    `import { ${pascalCase(apiName)}McpServer } from './mcp/${apiName}/server.js';\n` +
                    `const server = new ${pascalCase(apiName)}McpServer('${options?.baseUrl || spec.servers?.[0]?.url || 'https://api.example.com'}');\n` +
                    'const mcpServer = await server.start();'
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error generating MCP server: ${error}`
            }],
            isError: true
          };
        }
      }
    );
  }

  async start() {
    // Create output directory if it doesn't exist
    await fs.mkdir(this.outputDir, { recursive: true });
    
    return this.server;
  }
} 