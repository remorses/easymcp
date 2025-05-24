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
  let API_TOKEN = process.env.BEY_API_KEY;
  process.env.API_TOKEN = API_TOKEN;

  if (!API_TOKEN) {
    throw new Error("API_TOKEN is not set");
  }

  beforeAll(async () => {
    const openapi = JSON.parse(
      fs.readFileSync("./openapis/results/bey_dev.json", "utf8"),
    ) as any;
    const res = createMCPServer({
      openapi,
      name: "bye",
    });
    server = res.server;

    const connection = await connectClientServer(server);
    client = connection.client;
    cleanup = () => connection.cleanup();
  });

  afterAll(async () => {
    await cleanup?.();
  });

  it("should list available tools", async () => {
    const resources = await client.listTools();

    expect(resources).toBeDefined();
    expect(resources).toHaveProperty("tools");
    expect(resources).toMatchInlineSnapshot(`
      {
        "tools": [],
      }
    `);
  });

  it("should call list endpoint", async () => {
    const list = (await client.callTool({
      name: "GET /v1/avatar",
    })) as any;
    const first = simplifyToolCallSnapshot(list);
    expect(first).toMatchInlineSnapshot(`
      {
        "text": "Tool GET /v1/avatar not found",
        "type": "text",
      }
    `);
  });

  it("should call specific resource endpoint", async () => {
    const resourceContent = (await client.callTool({
      name: "GET /v1/session",
      arguments: {},
    })) as any;

    expect(resourceContent).toBeDefined();
    expect(resourceContent).toHaveProperty("content");
    expect(simplifyToolCallSnapshot(resourceContent)).toMatchInlineSnapshot(`
      {
        "text": "Tool GET /v1/session not found",
        "type": "text",
      }
    `);
  });
});
