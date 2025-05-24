import YAML from "js-yaml";
import { beforeAll, describe, expect, it } from "vitest";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolResultSchema,
  ListResourcesResultSchema,
  ListToolsResultSchema,
  ReadResourceResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createMCPServer } from "./mcp.ts";

describe("MCP Plugin", () => {
  let server: Server;


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
    });
    server = res.server;
  });

  it("should list and call available tools", async () => {
    const resources = await server.request(
      { method: "tools/list" },
      ListToolsResultSchema,
    );

    expect(resources).toBeDefined();
    expect(resources).toHaveProperty("tools");
    expect(resources).toMatchInlineSnapshot(`
      {
        "tools": [
          {
            "description": "GET /api/goSomething",
            "inputSchema": {
              "properties": {},
              "type": "object",
            },
            "name": "GET /api/goSomething",
          },
          {
            "description": "GET /api/users",
            "inputSchema": {
              "properties": {},
              "type": "object",
            },
            "name": "GET /api/users",
          },
          {
            "description": "GET /api/somethingElse/{id}",
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
              "type": "object",
            },
            "name": "GET /api/somethingElse/{id}",
          },
          {
            "description": "GET /api/search",
            "inputSchema": {
              "properties": {
                "query": {
                  "properties": {
                    "limit": {
                      "type": "number",
                    },
                    "q": {
                      "type": "string",
                    },
                  },
                  "required": [
                    "q",
                    "limit",
                  ],
                  "type": "object",
                },
              },
              "type": "object",
            },
            "name": "GET /api/search",
          },
        ],
      }
    `);

    const resourceContent = await server.request(

      {
        method: "tools/call",
        params: {
          name: "POST /somethingElse/:id",
          arguments: {
            params: { id: "xxx" },
          },
        },
      },
      CallToolResultSchema,
    );

    expect(resourceContent).toBeDefined();
    expect(resourceContent).toHaveProperty("content");
    expect(resourceContent).toMatchInlineSnapshot(`
      {
        "content": [
          {
            "text": "Tool POST /somethingElse/:id not found",
            "type": "text",
          },
        ],
        "isError": true,
      }
    `);
  });

  it("should list and read available resources", async () => {
    const resources = await server.request(

      { method: "resources/list" },
      ListResourcesResultSchema,
    );

    expect(resources).toBeDefined();

    expect(resources.resources).toMatchInlineSnapshot(`
      [
        {
          "mimeType": "application/json",
          "name": "GET /api/goSomething",
          "uri": "http://localhost/api/goSomething",
        },
        {
          "mimeType": "application/json",
          "name": "GET /api/users",
          "uri": "http://localhost/api/users",
        },
        {
          "mimeType": "application/json",
          "name": "GET /api/mcp",
          "uri": "http://localhost/api/mcp",
        },È
        {
          "mimeType": "application/json",
          "name": "GET /api/mcp-openapi",
          "uri": "http://localhost/api/mcp-openapi",
        },
      ]
    `);

    const resourceContent = await server.request(

      {
        method: "resources/read",
        params: {
          uri: `/api/users`,
        },
      },
      ReadResourceResultSchema,
    );

    expect(resourceContent).toBeDefined();
    expect(resourceContent.contents).toMatchInlineSnapshot(`
      [
        {
          "mimeType": "application/json",
          "text": "{"users":[{"id":1,"name":"John"}]}",
          "uri": "http://localhost:4000/api/users",
        },
      ]
    `);
  });
});
