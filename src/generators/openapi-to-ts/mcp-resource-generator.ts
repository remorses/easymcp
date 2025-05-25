import { OpenAPIV3 } from 'openapi-types';
import { McpResourceGenerator } from './types.js';
import { camelCase, paramCase } from 'change-case';

export class DefaultMcpResourceGenerator implements McpResourceGenerator {
  private readonly indent = '  ';

  private getIndentation(level: number = 1): string {
    return this.indent.repeat(level);
  }

  private formatResourceName(path: string): string {
    // Convert path like "/users/{id}/posts" to "users-posts"
    return paramCase(path.replace(/\{([^}]+)\}/g, '$1').replace(/[^a-zA-Z0-9]/g, ' ').trim());
  }

  private formatResourceUri(path: string, apiName: string): string {
    // Convert to a resource URI scheme
    return `${apiName}://${path.replace(/\{([^}]+)\}/g, '{$1}')}`;
  }

  private generateParameterExtraction(parameters: OpenAPIV3.ParameterObject[]): string {
    if (!parameters || parameters.length === 0) {
      return '';
    }

    const extractions: string[] = [];
    
    for (const param of parameters) {
      if (param.in === 'path') {
        const paramName = camelCase(param.name);
        // For path parameters, we'll extract from the URI using a simple regex
        extractions.push(`${this.getIndentation(3)}// Extract ${param.name} from URI path`);
        extractions.push(`${this.getIndentation(3)}const ${paramName}Match = uri.pathname.match(/\\/${param.name}\\/([^\\/]+)/);`);
        extractions.push(`${this.getIndentation(3)}const ${paramName} = ${paramName}Match ? ${paramName}Match[1] : uri.searchParams.get('${param.name}') || '';`);
      } else if (param.in === 'query') {
        const paramName = camelCase(param.name);
        extractions.push(`${this.getIndentation(3)}const ${paramName} = uri.searchParams.get('${param.name}') || '';`);
      }
    }

    return extractions.join('\n') + '\n';
  }

  private generateHttpCall(path: string, parameters: OpenAPIV3.ParameterObject[]): string {
    let urlPath = path;
    
    // Replace path parameters
    if (parameters) {
      for (const param of parameters) {
        if (param.in === 'path') {
          const paramName = camelCase(param.name);
          urlPath = urlPath.replace(`{${param.name}}`, `\${${paramName}}`);
        }
      }
    }

    // Build query parameters
    const queryParams = parameters?.filter(p => p.in === 'query') || [];
    let queryString = '';
    if (queryParams.length > 0) {
      const queryParts = queryParams.map(p => {
        const paramName = camelCase(p.name);
        return `${p.name}=\${encodeURIComponent(${paramName})}`;
      });
      queryString = ` + '?' + [${queryParts.map(p => `'${p}'`).join(', ')}].filter(Boolean).join('&')`;
    }

    return `${this.getIndentation(3)}const response = await fetch(\`\${baseUrl}${urlPath}\`${queryString}, {
${this.getIndentation(4)}method: 'GET',
${this.getIndentation(4)}headers: { 'Accept': 'application/json' }
${this.getIndentation(3)}});

${this.getIndentation(3)}if (!response.ok) {
${this.getIndentation(4)}throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
${this.getIndentation(3)}}

${this.getIndentation(3)}const result = await response.json();`;
  }

  private getResponseMimeType(operation: OpenAPIV3.OperationObject): string {
    // Check the responses for content types
    const responses = operation.responses;
    if (!responses) return 'application/json';

    // Look for successful responses (2xx)
    for (const [statusCode, response] of Object.entries(responses)) {
      if (statusCode.startsWith('2') && 'content' in response && response.content) {
        // Prefer JSON, but accept other types
        if (response.content['application/json']) return 'application/json';
        if (response.content['text/plain']) return 'text/plain';
        if (response.content['text/html']) return 'text/html';
        // Return the first available content type
        return Object.keys(response.content)[0] || 'application/json';
      }
    }

    return 'application/json';
  }

  generateFromOperation(
    operation: OpenAPIV3.OperationObject,
    path: string,
    method: string,
    apiName: string
  ): string {
    // Only generate resources for GET operations
    if (method.toLowerCase() !== 'get') {
      return '';
    }

    const resourceName = this.formatResourceName(path);
    const resourceUri = this.formatResourceUri(path, apiName);
    const description = operation.summary || operation.description || `GET ${path}`;
    const mimeType = this.getResponseMimeType(operation);
    
    // Collect parameters
    const parameters = (operation.parameters || []) as OpenAPIV3.ParameterObject[];
    const hasParameters = parameters.length > 0;
    
    const parameterExtraction = this.generateParameterExtraction(parameters);
    const httpCall = this.generateHttpCall(path, parameters);

    // Clean description for use in comments and strings
    const cleanDescription = description.replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '');

    if (hasParameters) {
      // Generate as resource template for parameterized paths
      return `${this.getIndentation()}// ${cleanDescription}
${this.getIndentation()}server.resource(
${this.getIndentation(2)}'${resourceName}',
${this.getIndentation(2)}'${resourceUri}',
${this.getIndentation(2)}{ mimeType: '${mimeType}' },
${this.getIndentation(2)}async (uri) => {
${this.getIndentation(3)}try {
${parameterExtraction}${httpCall}

${this.getIndentation(3)}return {
${this.getIndentation(4)}contents: [{
${this.getIndentation(5)}uri: uri.toString(),
${this.getIndentation(5)}${mimeType === 'application/json' ? 'text: JSON.stringify(result, null, 2)' : 'text: String(result)'},
${this.getIndentation(5)}mimeType: '${mimeType}'
${this.getIndentation(4)}}]
${this.getIndentation(3)}};
${this.getIndentation(3)}} catch (error) {
${this.getIndentation(3)}return {
${this.getIndentation(4)}contents: [{
${this.getIndentation(5)}uri: uri.toString(),
${this.getIndentation(5)}text: \`Error fetching resource: \${error instanceof Error ? error.message : String(error)}\`,
${this.getIndentation(5)}mimeType: 'text/plain'
${this.getIndentation(4)}}]
${this.getIndentation(3)}};
${this.getIndentation(3)}}
${this.getIndentation(2)}}
${this.getIndentation()});`;
    } else {
      // Generate as simple resource for non-parameterized paths
      return `${this.getIndentation()}// ${cleanDescription}
${this.getIndentation()}server.resource(
${this.getIndentation(2)}'${resourceName}',
${this.getIndentation(2)}'${resourceUri}',
${this.getIndentation(2)}{ mimeType: '${mimeType}' },
${this.getIndentation(2)}async () => {
${this.getIndentation(3)}try {
${this.getIndentation(3)}const response = await fetch(\`\${baseUrl}${path}\`, {
${this.getIndentation(4)}method: 'GET',
${this.getIndentation(4)}headers: { 'Accept': 'application/json' }
${this.getIndentation(3)}});

${this.getIndentation(3)}if (!response.ok) {
${this.getIndentation(4)}throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
${this.getIndentation(3)}}

${this.getIndentation(3)}const result = await response.json();

${this.getIndentation(3)}return {
${this.getIndentation(4)}contents: [{
${this.getIndentation(5)}uri: '${resourceUri}',
${this.getIndentation(5)}${mimeType === 'application/json' ? 'text: JSON.stringify(result, null, 2)' : 'text: String(result)'},
${this.getIndentation(5)}mimeType: '${mimeType}'
${this.getIndentation(4)}}]
${this.getIndentation(3)}};
${this.getIndentation(3)}} catch (error) {
${this.getIndentation(3)}return {
${this.getIndentation(4)}contents: [{
${this.getIndentation(5)}uri: '${resourceUri}',
${this.getIndentation(5)}text: \`Error fetching resource: \${error instanceof Error ? error.message : String(error)}\`,
${this.getIndentation(5)}mimeType: 'text/plain'
${this.getIndentation(4)}}]
${this.getIndentation(3)}};
${this.getIndentation(3)}}
${this.getIndentation(2)}}
${this.getIndentation()});`;
    }
  }
} 