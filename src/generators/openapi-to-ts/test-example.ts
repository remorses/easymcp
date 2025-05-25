import { OpenAPIToTypescriptProcessor } from './processor.js';
import { OpenAPIV3 } from 'openapi-types';

/**
 * Simple test to verify OpenAPI to MCP generation
 */
async function testGeneration() {
  const simpleSpec: OpenAPIV3.Document = {
    openapi: '3.0.0',
    info: {
      title: 'Test API',
      version: '1.0.0'
    },
    servers: [{ url: 'https://api.test.com' }],
    paths: {
      '/users': {
        get: {
          summary: 'List users',
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { type: 'object' }
                  }
                }
              }
            }
          }
        },
        post: {
          summary: 'Create user',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' }
                  },
                  required: ['name', 'email']
                }
              }
            }
          },
          responses: {
            '201': { description: 'Created' }
          }
        }
      },
      '/users/{id}': {
        get: {
          summary: 'Get user',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' }
            }
          ],
          responses: {
            '200': { description: 'Success' }
          }
        }
      }
    }
  };

  const processor = new OpenAPIToTypescriptProcessor({
    outputDir: './test-output',
    apiName: 'test-api',
    generateMcpTools: true,
    generateMcpResources: true,
    generateModels: false
  });

  try {
    const result = await processor.process(simpleSpec);
    
    console.log('✅ Test passed!');
    console.log(`Generated ${result.files.length} files:`);
    
    result.files.forEach(file => {
      console.log(`\n📄 ${file.path}:`);
      console.log('---');
      console.log(file.content.substring(0, 500) + (file.content.length > 500 ? '...' : ''));
    });

    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach(error => console.log(`  - ${error}`));
    }

    if (result.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      result.warnings.forEach(warning => console.log(`  - ${warning}`));
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testGeneration();
}

export { testGeneration }; 