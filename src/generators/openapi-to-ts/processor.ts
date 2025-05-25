import { OpenAPIV3 } from 'openapi-types';
import { OpenAPIProcessor, GeneratorOptions, GeneratorResult, GeneratedFile } from './types.js';
import { DefaultTypescriptModelGenerator } from './model-generator.js';
import { DefaultMcpToolGenerator } from './mcp-tool-generator.js';
import { DefaultMcpResourceGenerator } from './mcp-resource-generator.js';
import { pascalCase } from 'change-case';
import * as path from 'path';

export class OpenAPIToTypescriptProcessor implements OpenAPIProcessor {
  private modelGenerator: DefaultTypescriptModelGenerator;
  private toolGenerator: DefaultMcpToolGenerator;
  private resourceGenerator: DefaultMcpResourceGenerator;

  constructor(private readonly options: GeneratorOptions) {
    this.modelGenerator = new DefaultTypescriptModelGenerator({
      modelNamePrefix: options.modelNamePrefix,
      modelNameSuffix: options.modelNameSuffix
    });
    this.toolGenerator = new DefaultMcpToolGenerator();
    this.resourceGenerator = new DefaultMcpResourceGenerator();
  }

  private async generateModels(document: OpenAPIV3.Document): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];
    const schemas = document.components?.schemas;
    
    if (!schemas) {
      return files;
    }

    for (const [name, schema] of Object.entries(schemas)) {
      if ('$ref' in schema) {
        continue; // Skip references, they'll be handled when processing their target
      }

      try {
        const content = this.modelGenerator.generateFromSchema(schema, name);
        files.push({
          path: `models/${this.options.apiName}/${name}.ts`,
          content
        });
      } catch (error) {
        console.warn(`Warning: Failed to generate model for ${name}:`, error);
      }
    }

    // Generate index file
    const indexContent = files
      .map(file => {
        const basename = path.basename(file.path, '.ts');
        return `export * from './${basename}';`;
      })
      .join('\n');

    files.push({
      path: `models/${this.options.apiName}/index.ts`,
      content: indexContent
    });

    return files;
  }

  private async generateMcpServer(document: OpenAPIV3.Document): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];
    
    if (!this.options.generateMcpTools && !this.options.generateMcpResources) {
      return files;
    }

    const tools: string[] = [];
    const resources: string[] = [];
    
    // Process all paths and operations
    if (document.paths) {
      for (const [pathPattern, pathItem] of Object.entries(document.paths)) {
        if (!pathItem) continue;

        const operations = [
          { method: 'get', operation: pathItem.get },
          { method: 'post', operation: pathItem.post },
          { method: 'put', operation: pathItem.put },
          { method: 'patch', operation: pathItem.patch },
          { method: 'delete', operation: pathItem.delete },
          { method: 'head', operation: pathItem.head },
          { method: 'options', operation: pathItem.options },
          { method: 'trace', operation: pathItem.trace }
        ];

        for (const { method, operation } of operations) {
          if (!operation) continue;

          try {
            // Generate MCP tools for all operations
            if (this.options.generateMcpTools) {
              const toolCode = this.toolGenerator.generateFromOperation(
                operation,
                pathPattern,
                method,
                this.options.apiName
              );
              if (toolCode) {
                tools.push(toolCode);
              }
            }

            // Generate MCP resources for GET operations only
            if (this.options.generateMcpResources && method === 'get') {
              const resourceCode = this.resourceGenerator.generateFromOperation(
                operation,
                pathPattern,
                method,
                this.options.apiName
              );
              if (resourceCode) {
                resources.push(resourceCode);
              }
            }
          } catch (error) {
            console.warn(`Warning: Failed to generate MCP code for ${method.toUpperCase()} ${pathPattern}:`, error);
          }
        }
      }
    }

    // Generate the MCP server file
    if (tools.length > 0 || resources.length > 0) {
      const serverContent = this.generateMcpServerFile(document, tools, resources);
      files.push({
        path: `mcp/${this.options.apiName}/server.ts`,
        content: serverContent
      });

      // Generate a configuration file
      const configContent = this.generateMcpConfigFile(document);
      files.push({
        path: `mcp/${this.options.apiName}/config.ts`,
        content: configContent
      });
    }

    return files;
  }

  private generateMcpServerFile(document: OpenAPIV3.Document, tools: string[], resources: string[]): string {
    const apiTitle = document.info?.title || this.options.apiName;
    const apiVersion = document.info?.version || '1.0.0';
    const apiDescription = document.info?.description || `MCP server for ${apiTitle}`;
    
    // Extract base URL from servers
    const baseUrl = document.servers?.[0]?.url || 'https://api.example.com';

    return `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

/**
 * ${apiDescription}
 * Generated from OpenAPI specification
 */
export class ${pascalCase(this.options.apiName)}McpServer {
  private server: McpServer;
  private baseUrl: string;

  constructor(baseUrl: string = '${baseUrl}') {
    this.baseUrl = baseUrl;
    this.server = new McpServer({
      name: '${this.options.apiName}-mcp-server',
      version: '${apiVersion}'
    });

    this.setupToolsAndResources();
  }

  private setupToolsAndResources() {
    const server = this.server;
    const baseUrl = this.baseUrl;

${tools.join('\n\n')}

${resources.join('\n\n')}
  }

  getServer(): McpServer {
    return this.server;
  }

  async start() {
    return this.server;
  }
}

export default ${pascalCase(this.options.apiName)}McpServer;

// Main entry point for running as a standalone MCP server
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  async function main() {
    const server = new ${pascalCase(this.options.apiName)}McpServer();
    const mcpServer = await server.start();
    
    // Connect to stdio
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    
    console.error('[${this.options.apiName}-mcp-server] MCP server started and listening for connections...');
    
    // Keep the process alive
    process.on('SIGINT', () => {
      console.error('[${this.options.apiName}-mcp-server] Shutting down...');
      process.exit(0);
    });
  }

  main().catch(console.error);
}`;
  }

  private generateMcpConfigFile(document: OpenAPIV3.Document): string {
    const apiTitle = document.info?.title || this.options.apiName;
    const baseUrl = document.servers?.[0]?.url || 'https://api.example.com';

    return `export interface ${pascalCase(this.options.apiName)}Config {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

export const defaultConfig: ${pascalCase(this.options.apiName)}Config = {
  baseUrl: '${baseUrl}',
  timeout: 30000
};

/**
 * API Information
 */
export const apiInfo = {
  title: '${apiTitle}',
  version: '${document.info?.version || '1.0.0'}',
  description: '${document.info?.description?.replace(/'/g, "\\'") || `MCP server for ${apiTitle}`}',
  baseUrl: '${baseUrl}'
};`;
  }

  async process(document: OpenAPIV3.Document): Promise<GeneratorResult> {
    const result: GeneratorResult = {
      files: [],
      errors: [],
      warnings: []
    };

    try {
      // Generate models
      if (this.options.generateModels !== false) {
        const modelFiles = await this.generateModels(document);
        result.files.push(...modelFiles);
      }

      // Generate MCP server
      if (this.options.generateMcpTools || this.options.generateMcpResources) {
        const mcpFiles = await this.generateMcpServer(document);
        result.files.push(...mcpFiles);
      }

      // TODO: Add service generation
      // TODO: Add client generation

    } catch (error) {
      result.errors.push(`Failed to process OpenAPI document: ${error}`);
    }

    return result;
  }
} 