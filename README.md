# Easy MCP

This repository contains the code for the Easy MCP project. It includes various components and utilities related to the Model Context Platform.

The key functionalities of this project is the conversion of [OpenAPI](https://learn.openapis.org/) specifications to the [MCP](https://modelcontextprotocol.io/introduction) format.

🔥 CHECK OUT THE OFFICIAL YOUTUBE VIDEO -> [link](https://www.youtube.com/watch?v=RzIdTyg0iZo&ab_channel=Lelewithdots)

## Installation

To install the dependencies, run the following command at the root of the repository:

```bash
pnpm install
```

## Running Locally

This is a monorepo, and specific running instructions may vary depending on the package you intend to run.

To start the testing MCP server as mentioned above, use:

```bash
npx -y @modelcontext/pokeapi
```

Refer to the `README.md` files within specific project directories (e.g., `website/`, `modelcontextutils/`) for additional running instructions.

For example, to run the website locally, navigate to the `website/` directory and run:

```bash
pnpm dev
```

## Documentation
If you want to dive deeper into the project, head to:
- 🧠 [Documentation main page](https://deepwiki.com/remorses/modelcontext/1-overview)
- 🚀 [QuickStart](https://deepwiki.com/remorses/modelcontext/1.1-quick-start-guide)

## Start testing MCP server:

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

To try locally


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


