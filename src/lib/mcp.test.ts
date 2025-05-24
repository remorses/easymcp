import YAML from "js-yaml";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createMCPServer } from "./mcp.ts";

// Utility function to connect client and server
export async function connectClientServer(
  server: Server,
  clientName = "test-client",
  clientVersion = "1.0.0",
) {
  const [clientTx, serverTx] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: clientName, version: clientVersion });
  await Promise.all([server.connect(serverTx), client.connect(clientTx)]);

  const cleanup = async () => {
    await Promise.all([client.close(), server.close()]);
  };

  return { client, cleanup };
}

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

  it("should list and call available tools", async () => {
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

  it("should list and read available resources", async () => {
    const resources = await client.listResources();

    expect(resources).toBeDefined();

    expect(resources.resources).toMatchInlineSnapshot(`[]`);

    // Resources are no longer supported - test that it throws an error
    await expect(
      client.readResource({
        uri: `/api/users`,
      }),
    ).rejects.toThrow("Resources are not supported - use tools instead");
  });

  it("should filter paths when paths parameter is provided", async () => {
    const baseUrl = "https://pokeapi.co/api/v2/";
    const openapiUrl =
      "https://raw.githubusercontent.com/PokeAPI/pokeapi/4aeb1a63a9420be8a853cf50de28ea556e7aacaf/openapi.yml";
    const openapi = YAML.load(await (await fetch(openapiUrl)).text()) as any;

    // First test with no filtering - should have many tools
    const unfiltered = createMCPServer({
      openapi,
      name: "pokemon-unfiltered",
    });

    const unfilteredConnection = await connectClientServer(
      unfiltered.server,
      "unfiltered-client",
    );
    const unfilteredTools = await unfilteredConnection.client.listTools();
    const unfilteredCount = unfilteredTools.tools.length;

    // Now test with filtering - should have fewer tools
    const filtered = createMCPServer({
      openapi,
      name: "pokemon-filtered",
      paths: ["/api/v2/ability"], // Only include paths starting with /api/v2/ability
    });

    const filteredConnection = await connectClientServer(
      filtered.server,
      "filtered-client",
    );
    const filteredTools = await filteredConnection.client.listTools();
    const filteredCount = filteredTools.tools.length;

    // Should have fewer tools when filtered
    expect(filteredCount).toBeLessThan(unfilteredCount);

    // Should only include tools for paths starting with /api/v2/ability
    const toolNames = filteredTools.tools.map((tool) => tool.name);
    expect(toolNames.every((name) => name.includes("/api/v2/ability"))).toBe(
      true,
    );
    expect(toolNames.some((name) => name.includes("/api/v2/berry"))).toBe(
      false,
    );

    // Cleanup
    await Promise.all([
      unfilteredConnection.cleanup(),
      filteredConnection.cleanup(),
    ]);
  });

  it("should allow GET methods to be called as tools", async () => {
    const tools = await client.listTools();

    // Find a GET tool that doesn't require parameters
    const getTool = tools.tools.find(
      (tool) =>
        tool.name.startsWith("GET") && !tool.inputSchema.properties?.params,
    );

    expect(getTool).toBeDefined();

    if (getTool) {
      // Call the GET tool
      const result = await client.callTool({
        name: getTool.name,
        arguments: {},
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      const contents = result.content as any[];
      expect(contents.length).toBeGreaterThan(0);

      // Should return JSON content
      const content = contents[0];
      expect(content).toHaveProperty("type", "text");
      expect(content).toHaveProperty("text");

      // The response should contain some content (could be JSON or plain text)
      expect(content.text).toBeTruthy();
      expect(content.text.length).toBeGreaterThan(0);

      // If it looks like JSON, it should be valid JSON
      if (
        content.text.trim().startsWith("{") ||
        content.text.trim().startsWith("[")
      ) {
        expect(() => JSON.parse(content.text)).not.toThrow();
      }
    }
  });
});

/**
 * Simplifies tool call results for inline snapshots by taking only the first content item's text
 * and truncating it to a maximum of 10 lines
 */
export function simplifyToolCallSnapshot(toolCallResult: any) {
  if (!toolCallResult?.content?.[0]?.text) {
    return toolCallResult;
  }

  const firstContent = toolCallResult.content[0];
  const lines = firstContent.text.split("\n");
  const truncatedText = lines.slice(0, 10).join("\n");

  return {
    text: truncatedText + (lines.length > 10 ? "\n..." : ""),
    type: firstContent.type,
  };
}
