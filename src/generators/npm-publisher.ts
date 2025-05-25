import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { paramCase } from 'change-case';

const NPM_ORG_SCOPE = "@ema.viv";

export interface NpmPublishOptions {
  apiName: string;
  mcpServerPath: string;
  configPath: string;
  version?: string;
  scope?: string;
  description?: string;
  author?: string;
  license?: string;
  dryRun?: boolean;
}

export interface NpmFile {
  path: string;
  content: string;
}

/**
 * Publishes a generated MCP server as an npm package
 */
export async function publishMcpServerToNpm(options: NpmPublishOptions): Promise<void> {
  const {
    apiName,
    mcpServerPath,
    configPath,
    version = "1.0.0",
    scope = NPM_ORG_SCOPE,
    description,
    author = "OpenAPI MCP Generator",
    license = "MIT",
    dryRun = false
  } = options;

  // Prepare package name
  const packageName = paramCase(apiName);
  const fullPackageName = `${scope}/${packageName}`;

  console.log(`📦 ${dryRun ? 'Preparing' : 'Publishing'} MCP server "${apiName}" as npm package: ${fullPackageName}`);

  // 1. Prepare temp directory
  const tempDirPrefix = path.join("/tmp", `ema-viv-mcp-npm-`);
  const tempDir = await fs.mkdtemp(tempDirPrefix);

  try {
    // 2. Generate package files
    const files = await generateNpmPackageFiles({
      packageName: fullPackageName,
      apiName,
      mcpServerPath,
      configPath,
      version,
      description: description || `MCP server for ${apiName} API`,
      author,
      license
    });

    // 3. Write files to temp directory
    for (const file of files) {
      const filePath = path.join(tempDir, file.path);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.content, { encoding: "utf8" });
      
      // Make bin files executable
      if (file.path.includes('bin') || file.path.endsWith('.js')) {
        await fs.chmod(filePath, 0o755);
      }
    }

    if (dryRun) {
      console.log(`📁 Package files generated in: ${tempDir}`);
      console.log('📋 Generated files:');
      files.forEach(file => console.log(`  - ${file.path}`));
      console.log('\n🔍 To inspect the generated package:');
      console.log(`cd ${tempDir} && ls -la`);
      console.log('\n💡 To publish manually:');
      console.log(`cd ${tempDir} && npm publish --access public`);
      return;
    }

    // 4. Run npm publish
    await publishToNpm(tempDir);

    // 5. Print success message
    const scopedEncoded = fullPackageName.replace("@", "%40");
    const pkgUrl = `https://www.npmjs.com/package/${scopedEncoded}`;
    console.log(`✅ Successfully published: ${pkgUrl}`);

  } finally {
    if (!dryRun) {
      // Clean up temp directory only if not in dry-run mode
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}

/**
 * Generates npm package files for a MCP server
 */
async function generateNpmPackageFiles(options: {
  packageName: string;
  apiName: string;
  mcpServerPath: string;
  configPath: string;
  version: string;
  description: string;
  author: string;
  license: string;
}): Promise<NpmFile[]> {
  const {
    packageName,
    apiName,
    mcpServerPath,
    configPath,
    version,
    description,
    author,
    license
  } = options;

  // Read the generated MCP server and config files
  const serverContent = await fs.readFile(mcpServerPath, 'utf-8');
  const configContent = await fs.readFile(configPath, 'utf-8');

  // Generate package.json
  const packageJson = {
    name: packageName,
    version,
    description,
    main: "server.js",
    bin: {
      [paramCase(apiName)]: "./bin/cli.js"
    },
    type: "module",
    scripts: {
      start: "node server.js"
    },
    dependencies: {
      "@modelcontextprotocol/sdk": "^1.0.0",
      "zod": "^3.22.4"
    },
    keywords: ["mcp", "model-context-protocol", "openapi", apiName, "api"],
    license,
    author,
    repository: {
      type: "git",
      url: `https://github.com/ema-viv/${paramCase(apiName)}.git`
    },
    homepage: `https://github.com/ema-viv/${paramCase(apiName)}#readme`,
    bugs: {
      url: `https://github.com/ema-viv/${paramCase(apiName)}/issues`
    }
  };

  // Convert TypeScript to JavaScript (simple conversion for our generated code)
  const convertTsToJs = (content: string): string => {
    return content
      .replace(/import\s+{([^}]+)}\s+from\s+['"]([^'"]+)\.js['"];?/g, 'import { $1 } from "$2.js";')
      .replace(/export\s+interface\s+[^{]+\{[^}]*\}/gs, '') // Remove interface definitions
      .replace(/:\s*[A-Za-z<>\[\]|&\s]+(?=\s*[=,;)])/g, '') // Remove type annotations
      .replace(/\s+implements\s+[A-Za-z<>\[\]|&\s,]+/g, '') // Remove implements clauses
      .replace(/\s*as\s+[A-Za-z<>\[\]|&\s]+/g, '') // Remove type assertions
      .replace(/\s*<[^>]*>/g, '') // Remove generic type parameters
      .replace(/\?\s*:/g, ':'); // Remove optional property markers
  };

  const serverJs = convertTsToJs(serverContent);
  const configJs = convertTsToJs(configContent);

  // Generate CLI bin file
  const cliBinContent = `#!/usr/bin/env node
import { ${apiName.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')}McpServer } from './server.js';

async function main() {
  const server = new ${apiName.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')}McpServer();
  const mcpServer = await server.start();
  
  console.error(\`[${packageName}] MCP server started and listening for connections...\`);
  
  // Keep the process alive
  process.on('SIGINT', () => {
    console.error(\`[${packageName}] Shutting down...\`);
    process.exit(0);
  });
}

main().catch(console.error);
`;

  // Generate README
  const readmeContent = `# ${packageName}

${description}

## Installation

\`\`\`bash
npm install -g ${packageName}
\`\`\`

## Usage

### As a CLI tool

\`\`\`bash
${paramCase(apiName)}
\`\`\`

### As a library

\`\`\`javascript
import { ${apiName.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')}McpServer } from '${packageName}';

const server = new ${apiName.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')}McpServer();
await server.start();
\`\`\`

## Features

This MCP server provides tools and resources for the ${apiName} API, automatically generated from the OpenAPI specification.

## Generated by

[OpenAPI MCP Generator](https://github.com/ema-viv/openapi-mcp-generator) - Automatically converts OpenAPI specifications to MCP servers.

## License

${license}
`;

  return [
    {
      path: "package.json",
      content: JSON.stringify(packageJson, null, 2)
    },
    {
      path: "server.js",
      content: serverJs
    },
    {
      path: "config.js",
      content: configJs
    },
    {
      path: "bin/cli.js",
      content: cliBinContent
    },
    {
      path: "README.md",
      content: readmeContent
    },
    {
      path: ".gitignore",
      content: `node_modules/
*.log
.env
.DS_Store
`
    }
  ];
}

/**
 * Runs npm publish in the given directory
 */
async function publishToNpm(directory: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const publish = spawn("npm", ["publish", "--access", "public"], {
      cwd: directory,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });

    let output = "";
    let errorOutput = "";

    publish.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    publish.stderr.on("data", (data) => {
      const text = data.toString();
      errorOutput += text;
      process.stderr.write(text);
    });

    publish.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`npm publish failed with code ${code}\n${errorOutput.trim()}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Gets the next version for a package (auto-increment patch version)
 */
export async function getNextVersion(packageName: string): Promise<string> {
  try {
    const registryUrl = `https://registry.npmjs.org/${packageName}`;
    const response = await fetch(registryUrl);
    
    if (!response.ok) {
      // Package doesn't exist, start with 1.0.0
      return "1.0.0";
    }
    
    const data = await response.json();
    const currentVersion = data["dist-tags"]?.latest;
    
    if (!currentVersion) {
      return "1.0.0";
    }
    
    // Increment patch version
    const parts = currentVersion.split(".");
    if (parts.length !== 3) {
      return "1.0.0";
    }
    
    const nextPatch = parseInt(parts[2]) + 1;
    return `${parts[0]}.${parts[1]}.${nextPatch}`;
    
  } catch (error) {
    console.warn(`Could not fetch version for ${packageName}, using 1.0.0`);
    return "1.0.0";
  }
}