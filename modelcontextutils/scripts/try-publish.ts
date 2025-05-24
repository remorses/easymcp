import { publishNpmPackage } from "../src/lib/npm-publish.js";
import YAML from "js-yaml";

async function main() {
  const openapiUrl =
    "https://raw.githubusercontent.com/PokeAPI/pokeapi/4aeb1a63a9420be8a853cf50de28ea556e7aacaf/openapi.yml";
  const openapi = YAML.load(await (await fetch(openapiUrl)).text()) as any;
  await publishNpmPackage({
    openapiSchema: JSON.stringify(openapi),
    packageName: "pokeapi"
    // version omitted on purpose, will auto-bump or throw if not found
  });
}

main();
