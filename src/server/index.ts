import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { OpenAPIGeneratorServer } from './openapi-generator-server.js';
import * as path from 'path';

async function main() {
  const outputDir = process.env.OUTPUT_DIR || path.join(process.cwd(), 'generated');
  const server = new OpenAPIGeneratorServer(outputDir);
  
  // Start the server
  const mcpServer = await server.start();
  
  // Connect using stdio transport
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  
  console.error('OpenAPI Generator Server running on stdio');
  console.error(`Output directory: ${outputDir}`);
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
}); 