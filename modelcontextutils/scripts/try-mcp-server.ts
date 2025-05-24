import fs from "fs";
import YAML from "js-yaml";
import path from "path";

import { createMCPServer, StdioServerTransport } from "../src/lib/mcp.js";

async function main() {
  const name = "pokeapi";
  // const openapi = JSON.parse(
  //   fs.readFileSync(
  //     path.resolve(__dirname, "../openapis/results/bey_dev.json"),
  //     "utf8",
  //   ),
  // ) as any;
  // const openapiUrl =
  const openapiUrl =
    "https://raw.githubusercontent.com/PokeAPI/pokeapi/4aeb1a63a9420be8a853cf50de28ea556e7aacaf/openapi.yml";
  const openapi = YAML.load(await (await fetch(openapiUrl)).text()) as any;

  const { server } = createMCPServer({ openapi, name });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Started MCP STDIO server for ${name}`);
}

main();
