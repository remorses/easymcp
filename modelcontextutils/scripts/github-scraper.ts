import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";

type Repository = {
  id: string;
  isFork: boolean;
  isPrivate: boolean;
  nameWithOwner: string;
  url: string;
};

type SearchResult = {
  path?: string;
  repository?: Repository;
  sha?: string;
  textMatches?: any[];
  url?: string;
};

type StoredResult = {
  repoUrl: string;
  openapiPath: string;
  mintJsonPath: string;
};

function extractOpenapiValues(textMatches: any[]): string[] {
  const regex = /"openapi"\s*:\s*["']([^"']+)["']/g;
  const matches = [] as string[];

  // Only process the first text match
  if (textMatches?.[0]?.fragment) {
    let match;
    while ((match = regex.exec(textMatches[0].fragment)) !== null) {
      matches.push(match[1]);
    }
  }
  return matches;
}

function convertToFullUrl(repoUrl: string, openapiPath: string, mintJsonPath: string): string {
  // If already a full URL, return as is
  if (openapiPath.startsWith('http://') || openapiPath.startsWith('https://')) {
    return openapiPath;
  }
  
  // If starts with /, convert to raw GitHub URL using mint.json location as base
  if (openapiPath.startsWith('/')) {
    // Convert https://github.com/owner/repo to https://raw.githubusercontent.com/owner/repo/main
    const repoMatch = repoUrl.match(/https:\/\/github\.com\/([^\/]+)\/([^\/]+)/);
    if (repoMatch) {
      const [, owner, repo] = repoMatch;
      // Get the directory where mint.json is located
      const mintJsonDir = mintJsonPath.substring(0, mintJsonPath.lastIndexOf('/'));
      const basePath = mintJsonDir ? `/${mintJsonDir}` : '';
      return `https://raw.githubusercontent.com/${owner}/${repo}/main${basePath}${openapiPath}`;
    }
  }
  
  return openapiPath;
}

async function findReposWithMintJson() {
  const cacheFile = "scripts/mint-repos.json";

  if (existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, "utf-8"));
    // Handle new structure with rawResults, fallback to old structure
    return cached.rawResults || cached;
  }

  const command = `gh search code --json repository,path,textMatches --limit 1000 --filename mint.json '"openapi":'`;
  const output = execSync(command).toString();
  const results = JSON.parse(output) as SearchResult[];

  return results;
}

findReposWithMintJson().then((res) => {
  const arr = [...new Set(res.map((x) => x.repository.url))];
  const storedResults: StoredResult[] = [];

  // Extract and store openapi values with their repo URLs
  res.forEach((result) => {
    const repoUrl = result.repository?.url;
    const openapiPaths = extractOpenapiValues(result.textMatches || []);
    if (openapiPaths.length > 0) {
      storedResults.push({
        repoUrl,
        openapiPath: openapiPaths[0],
        mintJsonPath: result.path || '',
      });
      console.log(`Repository: ${repoUrl}`);
      console.log(`OpenAPI Path: ${openapiPaths[0]}`);
      console.log("---");
    }
  });

  // Store raw response and processed results in JSON file
  writeFileSync("scripts/mint-repos.json", JSON.stringify({
    rawResults: res,
    processedResults: storedResults
  }, null, 2));
  
  // Transform storedResults to array of objects with repo and openApiValue fields
  const urlsWithOpenApi = storedResults.map(result => ({
    repo: result.repoUrl,
    openApiValue: convertToFullUrl(result.repoUrl, result.openapiPath, result.mintJsonPath)
  }));
  
  writeFileSync(
    "scripts/mint-repos-urls.json",
    JSON.stringify(urlsWithOpenApi, null, 2)
  );
  console.log("Total unique repos:", arr.length);
});
