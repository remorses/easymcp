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

async function findReposWithMintJson() {
  const cacheFile = "mint-repos.json";

  if (existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, "utf-8"));
    return cached;
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
      });
      console.log(`Repository: ${repoUrl}`);
      console.log(`OpenAPI Path: ${openapiPaths[0]}`);
      console.log("---");
    }
  });

  // Store raw response in JSON file
  writeFileSync("mint-repos.json", JSON.stringify(res));
  console.log("Total unique repos:", arr.length);
});
