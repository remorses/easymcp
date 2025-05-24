import YAML from "js-yaml";
import fs from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { connectClientServer, simplifyToolCallSnapshot } from "./mcp.test.ts";
import { createMCPServer } from "./mcp.ts";

describe("MCP Plugin", () => {
  let server: Server;
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const openapi = JSON.parse(
      fs.readFileSync("../openapis/bye.json", "utf8"),
    ) as any;
    const res = createMCPServer({
      openapi,
      name: "bye",
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
        "text": "fetch is not a function",
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
        "text": "fetch is not a function",
        "type": "text",
      }
    `);
  });
});
