#!/usr/bin/env node

import { OpenAPIToTypescriptProcessor } from '../generators/openapi-to-ts/processor.js';
import { GeneratorOptions } from '../generators/openapi-to-ts/types.js';
import { publishMcpServerToNpm, getNextVersion } from '../generators/npm-publisher.js';
import { OpenAPIV3 } from 'openapi-types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { paramCase, pascalCase } from 'change-case';
import { Command } from 'commander';

interface CliOptions {
  input: string;
  output?: string;
  apiName?: string;
  models?: boolean;
  tools?: boolean;
  resources?: boolean;
  baseUrl?: string;
  verbose?: boolean;
  publish?: boolean;
  npmScope?: string;
  npmVersion?: string;
  npmAuthor?: string;
  npmLicense?: string;
}

async function loadOpenApiSchema(filePath: string): Promise<OpenAPIV3.Document> {
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

function getApiNameFromSchema(schema: OpenAPIV3.Document): string {
  if (schema.info?.title) {
    return paramCase(schema.info.title);
  }
  return 'api';
}

async function generateMcpFromOpenApi(options: CliOptions): Promise<void> {
  try {
    if (options.verbose) {
      console.log('🚀 Starting OpenAPI to MCP conversion...');
      console.log(`📁 Input file: ${options.input}`);
    }

    // Check if input file exists
    try {
      await fs.access(options.input);
    } catch {
      throw new Error(`Input file not found: ${options.input}`);
    }

    // Load and parse OpenAPI schema
    const schema = await loadOpenApiSchema(options.input);
    
    if (options.verbose) {
      console.log(`📖 Loaded OpenAPI schema: ${schema.info.title} v${schema.info.version}`);
    }

    // Determine API name
    const apiName = options.apiName || getApiNameFromSchema(schema);
    
    // Determine output directory
    const outputDir = options.output || './generated';

    // Override base URL if provided
    if (options.baseUrl && schema.servers) {
      schema.servers[0] = { url: options.baseUrl };
    }

    // Configure generator options
    const generatorOptions: GeneratorOptions = {
      outputDir,
      apiName,
      generateModels: options.models !== false,
      generateMcpTools: options.tools !== false,
      generateMcpResources: options.resources !== false,
      generateClients: false,
      generateServices: false
    };

    if (options.verbose) {
      console.log('⚙️  Generator configuration:');
      console.log(`   - API Name: ${apiName}`);
      console.log(`   - Output Directory: ${outputDir}`);
      console.log(`   - Generate Models: ${generatorOptions.generateModels}`);
      console.log(`   - Generate Tools: ${generatorOptions.generateMcpTools}`);
      console.log(`   - Generate Resources: ${generatorOptions.generateMcpResources}`);
      if (options.baseUrl) {
        console.log(`   - Base URL Override: ${options.baseUrl}`);
      }
    }

    // Create processor and generate files
    const processor = new OpenAPIToTypescriptProcessor(generatorOptions);
    const result = await processor.process(schema);

    // Write all generated files
    for (const file of result.files) {
      const fullPath = path.join(process.cwd(), outputDir, file.path);
      const dir = path.dirname(fullPath);
      
      // Ensure directory exists
      await fs.mkdir(dir, { recursive: true });
      
      // Write the file
      await fs.writeFile(fullPath, file.content, 'utf-8');
      
      if (options.verbose) {
        console.log(`✅ Generated: ${path.join(outputDir, file.path)}`);
      }
    }

    // Report results
    console.log('\n🎉 Generation completed successfully!');
    console.log(`📁 Generated ${result.files.length} files for API "${apiName}"`);
    
    const modelFiles = result.files.filter(f => f.path.startsWith('models/'));
    const mcpFiles = result.files.filter(f => f.path.startsWith('mcp/'));
    
    if (modelFiles.length > 0) {
      console.log(`📝 Model files: ${modelFiles.length}`);
    }
    if (mcpFiles.length > 0) {
      console.log(`🔧 MCP server files: ${mcpFiles.length}`);
    }

    if (result.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      result.warnings.forEach(warning => console.log(`  - ${warning}`));
    }

    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach(error => console.log(`  - ${error}`));
      process.exit(1);
    }

    // Show usage instructions
    if (mcpFiles.length > 0) {
      console.log('\n🔧 To use the generated MCP server:');
      console.log(`import { ${pascalCase(apiName)}McpServer } from './${path.posix.join(outputDir, 'mcp', apiName, 'server.js')}';`);
      console.log(`const server = new ${pascalCase(apiName)}McpServer();`);
      console.log('await server.start();');
    }

    console.log('\n📋 Generated structure:');
    console.log(`${outputDir}/`);
    if (modelFiles.length > 0) {
      console.log('├── models/');
      console.log(`│   └── ${apiName}/`);
      console.log('│       ├── [TypeScript model classes]');
      console.log('│       └── index.ts');
    }
    if (mcpFiles.length > 0) {
      console.log('└── mcp/');
      console.log(`    └── ${apiName}/`);
      console.log('        ├── server.ts (MCP server with tools & resources)');
      console.log('        └── config.ts (API configuration)');
    }

    // Handle npm publishing if requested
    if (options.publish && mcpFiles.length > 0) {
      console.log('\n📦 Publishing to npm...');
      
      const serverPath = path.join(process.cwd(), outputDir, 'mcp', apiName, 'server.ts');
      const configPath = path.join(process.cwd(), outputDir, 'mcp', apiName, 'config.ts');
      
      // Check if files exist
      try {
        await fs.access(serverPath);
        await fs.access(configPath);
      } catch {
        throw new Error('Generated MCP server files not found. Cannot publish to npm.');
      }

      // Determine version
      let version = options.npmVersion;
      if (!version) {
        const scope = options.npmScope || '@ema.viv';
        const packageName = `${scope}/${paramCase(apiName)}`;
        version = await getNextVersion(packageName);
        if (options.verbose) {
          console.log(`🔢 Auto-determined version: ${version}`);
        }
      }

      // Publish to npm
      await publishMcpServerToNpm({
        apiName,
        mcpServerPath: serverPath,
        configPath: configPath,
        version,
        scope: options.npmScope,
        description: schema.info.description,
        author: options.npmAuthor,
        license: options.npmLicense
      });
    }

  } catch (error) {
    console.error('❌ Error generating MCP from OpenAPI:', error);
    process.exit(1);
  }
}

// CLI setup
const program = new Command();

program
  .name('openapi-to-mcp')
  .description('Convert OpenAPI specifications to MCP (Model Context Protocol) tools and resources')
  .version('1.0.0');

program
  .argument('<input>', 'Path to OpenAPI specification file (JSON or YAML)')
  .option('-o, --output <dir>', 'Output directory for generated files', './generated')
  .option('-n, --api-name <name>', 'Override API name (defaults to title from OpenAPI spec)')
  .option('--no-models', 'Skip generating TypeScript model classes')
  .option('--no-tools', 'Skip generating MCP tools')
  .option('--no-resources', 'Skip generating MCP resources')
  .option('-b, --base-url <url>', 'Override base URL for API calls')
  .option('-v, --verbose', 'Enable verbose output')
  .option('--publish', 'Publish the generated MCP server to npm')
  .option('--npm-scope <scope>', 'NPM scope for publishing', '@ema.viv')
  .option('--npm-version <version>', 'NPM version for publishing')
  .option('--npm-author <author>', 'NPM author for publishing')
  .option('--npm-license <license>', 'NPM license for publishing')
  .action(async (input: string, options: Omit<CliOptions, 'input'>) => {
    await generateMcpFromOpenApi({ input, ...options });
  });

// Add examples to help
program.addHelpText('after', `
Examples:
  $ openapi-to-mcp ./data/openapis/jsons/pokeapi.json
  $ openapi-to-mcp ./api-spec.yaml -o ./output -n my-api
  $ openapi-to-mcp ./openapi.json --no-models --base-url https://api.example.com
  $ openapi-to-mcp ./spec.yaml -v --api-name pokemon-api
  $ openapi-to-mcp ./cal.json --publish --npm-scope @my-org
  $ openapi-to-mcp ./mistral.json --publish --npm-version 2.1.0 --npm-author "My Name"
`);

// Add a separate publish command
const publishCommand = new Command('publish');

publishCommand
  .description('Publish an existing MCP server to npm')
  .argument('<api-name>', 'Name of the API (directory name in mcp/)')
  .option('-d, --mcp-dir <dir>', 'Directory containing MCP servers', './mcp')
  .option('-s, --npm-scope <scope>', 'NPM scope for publishing', '@ema.viv')
  .option('-v, --npm-version <version>', 'NPM version for publishing (auto-increments if not specified)')
  .option('-a, --npm-author <author>', 'NPM author for publishing', 'OpenAPI MCP Generator')
  .option('-l, --npm-license <license>', 'NPM license for publishing', 'MIT')
  .option('--dry-run', 'Generate package files without publishing')
  .option('--verbose', 'Enable verbose output')
  .action(async (apiName: string, options: {
    mcpDir?: string;
    npmScope?: string;
    npmVersion?: string;
    npmAuthor?: string;
    npmLicense?: string;
    dryRun?: boolean;
    verbose?: boolean;
  }) => {
    try {
      const mcpDir = options.mcpDir || './mcp';
      const serverPath = path.join(process.cwd(), mcpDir, apiName, 'server.ts');
      const configPath = path.join(process.cwd(), mcpDir, apiName, 'config.ts');

      // Check if files exist
      try {
        await fs.access(serverPath);
        await fs.access(configPath);
      } catch {
        console.error(`❌ MCP server files not found for "${apiName}" in ${mcpDir}/`);
        console.error('Available APIs:');
        try {
          const apis = await fs.readdir(path.join(process.cwd(), mcpDir));
          apis.forEach(api => console.error(`  - ${api}`));
        } catch {
          console.error('  (No MCP servers found)');
        }
        process.exit(1);
      }

      // Determine version
      let version = options.npmVersion;
      if (!version) {
        const scope = options.npmScope || '@ema.viv';
        const packageName = `${scope}/${paramCase(apiName)}`;
        version = await getNextVersion(packageName);
        if (options.verbose) {
          console.log(`🔢 Auto-determined version: ${version}`);
        }
      }

      // Publish to npm
      await publishMcpServerToNpm({
        apiName,
        mcpServerPath: serverPath,
        configPath: configPath,
        version,
        scope: options.npmScope,
        author: options.npmAuthor,
        license: options.npmLicense,
        dryRun: options.dryRun
      });

    } catch (error) {
      console.error('❌ Error publishing MCP server:', error);
      process.exit(1);
    }
  });

program.addCommand(publishCommand);

// Parse command line arguments
program.parse(); 