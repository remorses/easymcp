// modelcontext/src/lib/npm-publish.ts

// Remove hardcoded scope
// const NPM_ORG_SCOPE = "@modelcontext";
// const NPM_ORG_SCOPE_NO_AT = "modelcontext";

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

export interface NpmFile {
  path: string;
  content: string;
}

function safeJsonParse(str: string): any {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

/**
 * Writes generated npm package files to a temp directory under /tmp,
 * runs `npm publish` in that directory, handles failures,
 * and prints the published npm package URL.
 *
 * @param packageName The short name of the package (e.g., "my-tool").
 * @param openapiSchema The OpenAPI schema, as a string (can be a URL or a JSON/YAML string).
 * @param version The version of the package (e.g., "1.0.0").
 * @param npmUser The NPM username to use for the package scope.
 * @param npmApiKey The NPM API key for authentication.
 */
export async function publishNpmPackage({
  packageName,
  openapiSchema,
  version,
  npmUser,
  npmApiKey,
}: {
  packageName: string;
  openapiSchema: string;
  version?: string;
  npmUser?: string;
  npmApiKey?: string;
}) {
  const parsed = safeJsonParse(openapiSchema);
  if (!parsed) {
    throw new Error("Invalid JSON");
  }
  if (!parsed.servers) {
    throw new Error("No servers found in schema, add a servers array with url of the API");
  }

  // Use provided npmUser or fallback to modelcontext
  const scope = npmUser ? `@${npmUser}` : "@modelcontext";
  const scopeNoAt = npmUser || "modelcontext";

  // 0. If version isn't provided, try to fetch latest and bump patch; else throw error if none found.
  let resolvedVersion = version;
  if (!resolvedVersion) {
    resolvedVersion = await getNextNpmVersionOrThrow(
      `${scope}/${packageName}`,
    ).catch((e) => "0.0.1");
  }

  // 1. Prepare temp dir
  const tempDirPrefix = path.join("/tmp", `modelcontext-npmpub-`);
  const tempDir = await fs.promises.mkdtemp(tempDirPrefix);

  // 2. Write package files
  const files = await generateNpmPackageFiles(
    packageName,
    openapiSchema,
    resolvedVersion,
    scope,
  );
  for (const file of files) {
    const filePath = path.join(tempDir, file.path);
    await fs.promises.writeFile(filePath, file.content, {
      encoding: "utf8",
      mode: 0o644,
    });
    // For bin.js, set executable flag
    if (file.path === "bin.js") {
      await fs.promises.chmod(filePath, 0o755);
    }
  }

  // 3. Create .npmrc file with authentication if API key is provided
  if (npmApiKey) {
    const npmrcContent = `//registry.npmjs.org/:_authToken=${npmApiKey}
@${npmUser}:registry=https://registry.npmjs.org/
`;
    await fs.promises.writeFile(path.join(tempDir, ".npmrc"), npmrcContent, {
      encoding: "utf8",
      mode: 0o600, // Secure permissions for auth file
    });
  }

  // 4. npm publish
  await new Promise<void>((resolve, reject) => {
    const publish = spawn("npm", ["publish", "--access", "public"], {
      cwd: tempDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env, // Inherit env, inc. NPM auth
    });

    publish.stdout.on("data", (data) => {
      process.stdout.write(data);
    });

    let errOutput = "";
    publish.stderr.on("data", (data) => {
      process.stderr.write(data);
      errOutput += data.toString();
    });

    publish.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `npm publish failed with code ${code}\n${errOutput.trim()}`,
          ),
        );
      } else {
        resolve();
      }
    });
  });

  // 5. Print the published npm package URL
  const fullPackageName = `${scope}/${packageName}`; // must match used above
  // Encode for npm web url: scoped @ -> %40
  const scopedEncoded = fullPackageName.replace("@", "%40");
  const pkgUrl = `https://www.npmjs.com/package/${scopedEncoded}`;
  console.log(`Published npm package to: ${pkgUrl}`);
  return {packageName:fullPackageName }
}

/**
 * Generates the file definitions for an npm package.
 *
 * @param packageName The short name of the package (e.g., "my-tool").
 * @param openapiSchema The OpenAPI schema, as a string (can be a URL or a JSON/YAML string).
 * @param version The version of the package (e.g., "1.0.0").
 * @param scope The NPM scope to use (e.g., "@username").
 * @returns An array of NpmFile objects representing the files to be created.
 */
export async function generateNpmPackageFiles(
  packageName: string,
  openapiSchema: string,
  version: string,
  scope: string,
) {
  const fullPackageName = `${scope}/${packageName}`;

  // Helper function to escape strings for use as content within JavaScript single-quoted literals
  const escapeForJsSingleQuotedStringContent = (str: string): string => {
    return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  };

  // Helper function to escape strings for use as content within JavaScript backticked template literals
  const escapeForJsTemplateLiteralContent = (str: string): string => {
    return str
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/\$\{/g, "\\${");
  };
  const modelcontextutilsVersion =
    await getLatestNpmVersionOrThrow("modelcontextutils");
  const packageJsonContent = {
    name: fullPackageName,
    version: version,
    description: `A MCP server for ${packageName}`,
    bin: "bin.js",
    type: "module",
    scripts: {
      // "start": "node bin.js"
    },
    dependencies: {
      modelcontextutils: `^${modelcontextutilsVersion}`,
    },
    keywords: ["modelcontext", packageName],
    license: "MIT", // Or your preferred license
    author: "ModelContext",
  };

  const readmeContent = `
# ${fullPackageName}

Version: ${version}


---

Generated by ModelContext tooling.
  `.trim();

  const escapedFullPackageNameForBinJs =
    escapeForJsSingleQuotedStringContent(fullPackageName);
  const escapedVersionForBinJs = escapeForJsSingleQuotedStringContent(version);

  const binJsContent = `#!/usr/bin/env node
import { createMCPServer, StdioServerTransport } from "modelcontextutils";

// These values are injected by the package generation process
const openapi = ${JSON.stringify(JSON.parse(openapiSchema), null, 2)};
const name = '${escapedFullPackageNameForBinJs}';
const version = '${escapedVersionForBinJs}';

function main() {
  // Log to stderr to avoid interfering with stdio transport used for MCP
  console.error(\`[\${name} v\${version}] Initializing MCP server...\`);

  const { server } = createMCPServer({
    openapi: openapi,
    name: name,
    version: version
  });

  const transport = new StdioServerTransport();
  server.connect(transport);

  console.error(\`[\${name} v\${version}] Server connected via StdioServerTransport. Listening for MCP messages.\`);

}


main();
  `.trim();

  return [
    {
      path: "package.json",
      content: JSON.stringify(packageJsonContent, null, 2),
    },
    {
      path: "README.md",
      content: readmeContent,
    },
    {
      path: "bin.js",
      content: binJsContent,
    },
  ];
}
/**
 * Helper to fetch latest version of @modelcontext/{packageName} from npm.
 * Throws if package not found.
 */
async function getLatestNpmVersionOrThrow(
  packageName: string,
): Promise<string> {
  const registryUrl = `https://registry.npmjs.org/${packageName}`;
  let resp: Response;
  try {
    // @ts-ignore: global fetch for node >= 18, you may polyfill if needed
    resp = await fetch(registryUrl);
  } catch (err) {
    throw new Error(
      `Could not fetch npm registry info for ${packageName}: ${(err as Error).message}`,
    );
  }
  if (!resp.ok) {
    throw new Error(
      `Could not find npm package ${packageName} in registry (status ${resp.status}) and no version specified.`,
    );
  }
  const pkgData = await resp.json();
  if (!pkgData["dist-tags"] || !pkgData["dist-tags"].latest) {
    throw new Error(
      `No latest version found for ${packageName} in registry response.`,
    );
  }
  return pkgData["dist-tags"].latest;
}

/**
 * Helper to fetch latest version of @modelcontext/{packageName} from npm and return next patch version.
 * Throws if package not found.
 */
async function getNextNpmVersionOrThrow(packageName: string): Promise<string> {
  const currentVersion = await getLatestNpmVersionOrThrow(packageName);
  // Simple semver patch bump (1.2.3 -> 1.2.4)
  const parts = currentVersion.split(".");
  if (parts.length !== 3 || parts.some((x: any) => isNaN(Number(x)))) {
    throw new Error(
      `Could not parse current package version: '${currentVersion}' from npm.`,
    );
  }
  const nextPatch = Number(parts[2]) + 1;
  return `${parts[0]}.${parts[1]}.${nextPatch}`;
}
