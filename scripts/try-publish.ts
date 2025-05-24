import { publishNpmPackage } from "../src/lib/npm-publish";
import YAML from "js-yaml";

async function main() {
  const openapiUrl =
    "https://raw.githubusercontent.com/PokeAPI/pokeapi/4aeb1a63a9420be8a853cf50de28ea556e7aacaf/openapi.yml";
  const openapi = YAML.load(await (await fetch(openapiUrl)).text()) as any;
  await publishNpmPackage({
    openapiSchema: JSON.stringify(openapi),
    packageName: "pokeapi",
    version: "0.0.0",
  });
}

main();
