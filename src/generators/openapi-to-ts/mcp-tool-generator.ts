import { OpenAPIV3 } from 'openapi-types';
import { McpToolGenerator } from './types.js';
import { camelCase, paramCase } from 'change-case';

export class DefaultMcpToolGenerator implements McpToolGenerator {
  private readonly indent = '  ';

  private getIndentation(level: number = 1): string {
    return this.indent.repeat(level);
  }

  private formatToolName(path: string, method: string): string {
    // Convert path like "/users/{id}/posts" to "getUsersPosts"
    const cleanPath = path
      .replace(/\{([^}]+)\}/g, 'By$1') // Replace {id} with ById
      .replace(/[^a-zA-Z0-9]/g, ' ') // Replace non-alphanumeric with spaces
      .trim();
    
    return camelCase(`${method} ${cleanPath}`);
  }

  private generateZodSchemaFromParameters(parameters: OpenAPIV3.ParameterObject[]): string {
    if (!parameters || parameters.length === 0) {
      return '';
    }

    const schemaProperties: string[] = [];
    
    for (const param of parameters) {
      const isRequired = param.required === true;
      const zodType = this.getZodTypeFromSchema(param.schema as OpenAPIV3.SchemaObject);
      const description = param.description ? `.describe('${param.description.replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '')}')` : '';
      const optional = isRequired ? '' : '.optional()';
      
      schemaProperties.push(
        `${this.getIndentation(2)}${camelCase(param.name)}: ${zodType}${description}${optional}`
      );
    }

    return `{\n${schemaProperties.join(',\n')}\n${this.getIndentation()}}`;
  }

  private generateZodSchemaFromRequestBody(requestBody: OpenAPIV3.RequestBodyObject): string {
    const content = requestBody.content;
    
    // Look for JSON content first
    const jsonContent = content['application/json'] || content['application/vnd.api+json'];
    if (jsonContent?.schema) {
      return this.generateZodSchemaFromOpenAPISchema(jsonContent.schema as OpenAPIV3.SchemaObject);
    }

    // Fallback to form data
    const formContent = content['application/x-www-form-urlencoded'] || content['multipart/form-data'];
    if (formContent?.schema) {
      return this.generateZodSchemaFromOpenAPISchema(formContent.schema as OpenAPIV3.SchemaObject);
    }

    return 'z.any()';
  }

  private generateZodSchemaFromOpenAPISchema(schema: OpenAPIV3.SchemaObject): string {
    if (schema.type === 'object' && schema.properties) {
      const properties: string[] = [];
      const required = schema.required || [];
      
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const isRequired = required.includes(propName);
        const zodType = this.getZodTypeFromSchema(propSchema as OpenAPIV3.SchemaObject);
        const description = (propSchema as OpenAPIV3.SchemaObject).description 
          ? `.describe('${(propSchema as OpenAPIV3.SchemaObject).description?.replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '')}')` 
          : '';
        const optional = isRequired ? '' : '.optional()';
        
        properties.push(
          `${this.getIndentation(2)}${camelCase(propName)}: ${zodType}${description}${optional}`
        );
      }

      return `z.object({\n${properties.join(',\n')}\n${this.getIndentation()}})`;
    }

    return this.getZodTypeFromSchema(schema);
  }

  private getZodTypeFromSchema(schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject): string {
    if ('$ref' in schema) {
      // For references, we'll use z.any() for now
      return 'z.any()';
    }

    if (schema.type === 'array' && schema.items) {
      const itemType = this.getZodTypeFromSchema(schema.items as OpenAPIV3.SchemaObject);
      return `z.array(${itemType})`;
    }

    switch (schema.type) {
      case 'string':
        if (schema.enum) {
          const enumValues = schema.enum.map((e: string) => `'${e}'`).join(', ');
          return `z.enum([${enumValues}])`;
        }
        if (schema.format === 'email') return 'z.string().email()';
        if (schema.format === 'uri') return 'z.string().url()';
        if (schema.format === 'date') return 'z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/)';
        if (schema.format === 'date-time') return 'z.string().datetime()';
        return 'z.string()';
      case 'number':
        return 'z.number()';
      case 'integer':
        return 'z.number().int()';
      case 'boolean':
        return 'z.boolean()';
      case 'object':
        return 'z.record(z.any())';
      default:
        return 'z.any()';
    }
  }

  private generateParameterExtraction(parameters: OpenAPIV3.ParameterObject[]): string {
    if (!parameters || parameters.length === 0) {
      return '';
    }

    const extractions: string[] = [];
    
    for (const param of parameters) {
      const paramName = camelCase(param.name);
      extractions.push(`${this.getIndentation(3)}const ${paramName} = args.${paramName};`);
    }

    return extractions.join('\n') + '\n';
  }

  private generateHttpCall(path: string, method: string, hasRequestBody: boolean, parameters: OpenAPIV3.ParameterObject[]): string {
    const httpMethod = method.toUpperCase();
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

    const requestOptions: string[] = [
      `${this.getIndentation(4)}method: '${httpMethod}'`,
      `${this.getIndentation(4)}headers: { 'Content-Type': 'application/json' }`
    ];

    if (hasRequestBody) {
      requestOptions.push(`${this.getIndentation(4)}body: JSON.stringify(args.body || args)`);
    }

    return `${this.getIndentation(3)}const response = await fetch(\`\${baseUrl}${urlPath}\`${queryString}, {
${requestOptions.join(',\n')}
${this.getIndentation(3)}});

${this.getIndentation(3)}if (!response.ok) {
${this.getIndentation(4)}throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
${this.getIndentation(3)}}

${this.getIndentation(3)}const result = await response.json();`;
  }

  generateFromOperation(
    operation: OpenAPIV3.OperationObject,
    path: string,
    method: string,
    apiName: string
  ): string {
    const toolName = this.formatToolName(path, method);
    const description = operation.summary || operation.description || `${method.toUpperCase()} ${path}`;
    
    // Collect all parameters
    const parameters = (operation.parameters || []) as OpenAPIV3.ParameterObject[];
    const hasRequestBody = !!operation.requestBody;
    
    // Generate parameter schema
    let parameterSchema = '';
    if (parameters.length > 0 || hasRequestBody) {
      const paramSchema = this.generateZodSchemaFromParameters(parameters);
      
      if (hasRequestBody) {
        const bodySchema = this.generateZodSchemaFromRequestBody(operation.requestBody as OpenAPIV3.RequestBodyObject);
        if (paramSchema) {
          // Merge parameter and body schemas
          parameterSchema = `z.object({\n${paramSchema.slice(2, -2)},\n${this.getIndentation(2)}body: ${bodySchema}\n${this.getIndentation()}})`;
        } else {
          parameterSchema = bodySchema;
        }
      } else {
        parameterSchema = paramSchema;
      }
    }

    const parameterExtraction = this.generateParameterExtraction(parameters);
    const httpCall = this.generateHttpCall(path, method, hasRequestBody, parameters);

    const schemaArg = parameterSchema ? `,\n${this.getIndentation()}${parameterSchema}` : '';

    return `${this.getIndentation()}// ${description}
${this.getIndentation()}server.tool(
${this.getIndentation(2)}'${toolName}',
${this.getIndentation(2)}'${description.replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '')}'${schemaArg},
${this.getIndentation(2)}async (${parameterSchema ? 'args' : ''}) => {
${this.getIndentation(3)}try {
${parameterExtraction}${httpCall}

${this.getIndentation(3)}return {
${this.getIndentation(4)}content: [{
${this.getIndentation(5)}type: 'text',
${this.getIndentation(5)}text: JSON.stringify(result, null, 2)
${this.getIndentation(4)}}]
${this.getIndentation(3)}};
${this.getIndentation(3)}} catch (error) {
${this.getIndentation(3)}return {
${this.getIndentation(4)}content: [{
${this.getIndentation(5)}type: 'text',
${this.getIndentation(5)}text: \`Error calling ${toolName}: \${error instanceof Error ? error.message : String(error)}\`
${this.getIndentation(4)}}],
${this.getIndentation(4)}isError: true
${this.getIndentation(3)}};
${this.getIndentation(3)}}
${this.getIndentation(2)}}
${this.getIndentation()});`;
  }
} 