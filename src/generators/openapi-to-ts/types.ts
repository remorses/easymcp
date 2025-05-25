import { OpenAPIV3 } from 'openapi-types';

export interface GeneratorOptions {
  outputDir: string;
  apiName: string;
  modelNamePrefix?: string;
  modelNameSuffix?: string;
  generateClients?: boolean;
  generateServices?: boolean;
  generateModels?: boolean;
  generateMcpTools?: boolean;
  generateMcpResources?: boolean;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GeneratorResult {
  files: GeneratedFile[];
  errors: string[];
  warnings: string[];
}

export interface TypescriptModelGenerator {
  generateFromSchema(schema: OpenAPIV3.SchemaObject, name: string): string;
  generateFromReference(ref: OpenAPIV3.ReferenceObject): string;
}

export interface TypescriptServiceGenerator {
  generateFromOperation(
    operation: OpenAPIV3.OperationObject,
    path: string,
    method: string
  ): string;
}

export interface TypescriptClientGenerator {
  generateClient(
    operations: Map<string, OpenAPIV3.OperationObject>,
    info: OpenAPIV3.InfoObject
  ): string;
}

export interface McpToolGenerator {
  generateFromOperation(
    operation: OpenAPIV3.OperationObject,
    path: string,
    method: string,
    apiName: string
  ): string;
}

export interface McpResourceGenerator {
  generateFromOperation(
    operation: OpenAPIV3.OperationObject,
    path: string,
    method: string,
    apiName: string
  ): string;
}

export interface OpenAPIProcessor {
  process(document: OpenAPIV3.Document): Promise<GeneratorResult>;
} 