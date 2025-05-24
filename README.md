to start the testing MCP server:

```
npx tsx /Users/morse/Documents/GitHub/modelcontext/scripts/try-mcp-server.ts
```

Also add the env variable API_TOKEN for APIs that need one, then add it to Claude json or similar:

```json
{
  "mcpServers": {
    "trymodelcontext": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "/Users/morse/Documents/GitHub/modelcontext/scripts/try-mcp-server.ts"
      ],
      "env": {
        "API_TOKEN": ""
      }
    }
  }
}

```
