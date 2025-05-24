to start the testing MCP server:

```
npx -y @modelcontext/pokeapi
```

Also add the env variable API_TOKEN for APIs that need one, then add it to Claude json or similar:

```json
{
  "mcpServers": {
    "trymodelcontext": {
      "command": "npx",
      "args": ["-y", "@modelcontext/pokeapi"],
      "env": {
        "API_TOKEN": ""
      }
    }
  }
}
```


to try locally


```json
{
  "mcpServers": {
    "trymodelcontext": {
      "command": "npx",
      "args": ["-y", "tsx", "/Users/morse/Documents/GitHub/modelcontext/modelcontextutils/scripts/try-mcp-server.ts"],
      "env": {
        "API_TOKEN": ""
      }
    }
  }
}
```
