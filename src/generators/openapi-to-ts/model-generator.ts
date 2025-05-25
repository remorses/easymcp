import { OpenAPIV3 } from 'openapi-types';
import { TypescriptModelGenerator } from './types.js';
import { camelCase, pascalCase } from 'change-case';

export class DefaultTypescriptModelGenerator implements TypescriptModelGenerator {
  private indentLevel = 0;
  private readonly indent = '  ';

  constructor(private readonly options: { 
    modelNamePrefix?: string;
    modelNameSuffix?: string;
  } = {}) {}

  private getIndentation(): string {
    return this.indent.repeat(this.indentLevel);
  }

  private formatPropertyName(name: string): string {
    return camelCase(name);
  }

  private formatClassName(name: string): string {
    const baseName = pascalCase(name);
    const prefix = this.options.modelNamePrefix || '';
    const suffix = this.options.modelNameSuffix || '';
    return `${prefix}${baseName}${suffix}`;
  }

  private getTypeFromSchema(schema: OpenAPIV3.SchemaObject): string {
    if (schema.type === 'array' && schema.items) {
      if ('$ref' in schema.items) {
        return `${this.generateFromReference(schema.items)}[]`;
      }
      return `${this.getTypeFromSchema(schema.items)}[]`;
    }

    if (schema.type === 'object') {
      if (schema.properties) {
        return this.generateObjectType(schema);
      }
      return 'Record<string, any>';
    }

    switch (schema.type) {
      case 'string':
        if (schema.enum) {
          return schema.enum.map((e: string) => `'${e}'`).join(' | ');
        }
        return 'string';
      case 'number':
      case 'integer':
        return 'number';
      case 'boolean':
        return 'boolean';
      default:
        return 'any';
    }
  }

  private generateObjectType(schema: OpenAPIV3.SchemaObject): string {
    if (!schema.properties) return 'Record<string, any>';

    const properties = Object.entries(schema.properties).map(([name, prop]) => {
      const typedProp = prop as OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject;
      if ('$ref' in typedProp) {
        return `${this.formatPropertyName(name)}: ${this.generateFromReference(typedProp)}`;
      }
      return `${this.formatPropertyName(name)}: ${this.getTypeFromSchema(typedProp)}`;
    });

    return `{
${this.getIndentation()}${this.indent}${properties.join(`\n${this.getIndentation()}${this.indent}`)}
${this.getIndentation()}}`;
  }

  generateFromReference(ref: OpenAPIV3.ReferenceObject): string {
    // Extract the type name from the reference
    const parts = ref.$ref.split('/');
    return this.formatClassName(parts[parts.length - 1]);
  }

  generateFromSchema(schema: OpenAPIV3.SchemaObject, name: string): string {
    const className = this.formatClassName(name);
    
    if (schema.type === 'object' && schema.properties) {
      const properties = Object.entries(schema.properties).map(([propName, prop]) => {
        const typedProp = prop as OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject;
        const isRequired = schema.required?.includes(propName) ?? false;
        const optionalFlag = isRequired ? '' : '?';
        
        if ('$ref' in typedProp) {
          return `${this.getIndentation()}${this.formatPropertyName(propName)}${optionalFlag}: ${this.generateFromReference(typedProp)};`;
        }
        
        return `${this.getIndentation()}${this.formatPropertyName(propName)}${optionalFlag}: ${this.getTypeFromSchema(typedProp)};`;
      });

      return `export class ${className} {
${properties.join('\n')}

${this.getIndentation()}constructor(data: {
${properties.map(p => p.replace(';', ',')).join('\n')}
${this.getIndentation()}}) {
${Object.keys(schema.properties).map(prop => 
    `${this.getIndentation()}${this.indent}this.${this.formatPropertyName(prop)} = data.${this.formatPropertyName(prop)};`
).join('\n')}
${this.getIndentation()}}
}`;
    }

    if (schema.type === 'string' && schema.enum) {
      return `export enum ${className} {
${schema.enum.map((value: string) => 
    `${this.getIndentation()}${pascalCase(value.toString())} = '${value}'`
).join(',\n')}
}`;
    }

    throw new Error(`Unsupported schema type for class generation: ${schema.type}`);
  }
} 