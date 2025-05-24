import YAML from "js-yaml";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createMCPServer } from "./mcp.ts";
import { connectClientServer, simplifyToolCallSnapshot } from "./mcp.test.ts";

describe("MCP Plugin", () => {
  let server: Server;
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const baseUrl = "https://pokeapi.co/api/v2/";
    const openapiUrl =
      "https://raw.githubusercontent.com/PokeAPI/pokeapi/4aeb1a63a9420be8a853cf50de28ea556e7aacaf/openapi.yml";
    const openapi = YAML.load(await (await fetch(openapiUrl)).text()) as any;
    const res = createMCPServer({
      fetch(path, options) {
        return fetch(new URL(path, baseUrl), options);
      },
      openapi,
      name: "pokemon",
      paths: ["/api/v2/ability/"], // Filter to only include /api/v2 paths
    });
    server = res.server;

    const connection = await connectClientServer(server);
    client = connection.client;
    cleanup = connection.cleanup;
  });

  afterAll(async () => {
    await cleanup();
  });

  it("should list available tools", async () => {
    const resources = await client.listTools();

    expect(resources).toBeDefined();
    expect(resources).toHaveProperty("tools");
    expect(resources).toMatchInlineSnapshot(`
      {
        "tools": [
          {
            "description": "Abilities provide passive effects for Pokémon in battle or in the overworld. Pokémon have multiple possible abilities but can have only one ability at a time. Check out [Bulbapedia](http://bulbapedia.bulbagarden.net/wiki/Ability) for greater detail.",
            "inputSchema": {
              "properties": {
                "query": {
                  "properties": {
                    "limit": {
                      "type": "integer",
                    },
                    "offset": {
                      "type": "integer",
                    },
                    "q": {
                      "type": "string",
                    },
                  },
                  "required": undefined,
                  "type": "object",
                },
              },
              "required": undefined,
              "type": "object",
            },
            "name": "GET /api/v2/ability/",
          },
          {
            "description": "Abilities provide passive effects for Pokémon in battle or in the overworld. Pokémon have multiple possible abilities but can have only one ability at a time. Check out [Bulbapedia](http://bulbapedia.bulbagarden.net/wiki/Ability) for greater detail.",
            "inputSchema": {
              "properties": {
                "params": {
                  "properties": {
                    "id": {
                      "type": "string",
                    },
                  },
                  "required": [
                    "id",
                  ],
                  "type": "object",
                },
              },
              "required": undefined,
              "type": "object",
            },
            "name": "GET /api/v2/ability/{id}/",
          },
        ],
      }
    `);
  });

  it("should call list endpoint", async () => {
    const list = (await client.callTool({
      name: "GET /api/v2/ability/",
    })) as any;
    const first = simplifyToolCallSnapshot(list);
    expect(first).toMatchInlineSnapshot(`
      {
        "text": "{
        "count": 367,
        "next": "https://pokeapi.co/api/v2/ability/?offset=20&limit=20",
        "previous": null,
        "results": [
          {
            "name": "stench",
            "url": "https://pokeapi.co/api/v2/ability/1/"
          },
          {
      ...",
        "type": "text",
      }
    `);
  });

  it("should call specific resource endpoint", async () => {
    const resourceContent = (await client.callTool({
      name: "GET /api/v2/ability/{id}/",
      arguments: {
        params: { id: "own-tempo" },
      },
    })) as any;

    expect(resourceContent).toBeDefined();
    expect(resourceContent).toHaveProperty("content");
    expect(simplifyToolCallSnapshot(resourceContent)).toMatchInlineSnapshot(`
      {
        "text": "{
        "effect_changes": [],
        "effect_entries": [
          {
            "effect": "Ein Pokémon mit dieser Fähigkeit kann nicht verwirrt werden.\\n\\nWenn ein Pokémon verwirrt ist und diese Fähigkeit erhält, wird es von der confusion geheilt.",
            "language": {
              "name": "de",
              "url": "https://pokeapi.co/api/v2/language/6/"
            },
            "short_effect": "Verhindert confusion."
      ...",
        "type": "text",
      }
    `);
  });
});
