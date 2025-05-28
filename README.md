# Easy MCP

This repository contains the code for the Easy MCP project. It includes various components and utilities related to the Model Context Platform.

The key functionalities of this project is the conversion of [OpenAPI](https://learn.openapis.org/) specifications to the [MCP](https://modelcontextprotocol.io/introduction) format.

🏆 This project won the 3rd place at the [AI Hackaton Paris](https://blog.techeurope.io/p/hackathon-paris-1)

## Documentation
Want to know about all the details about the project? Head to:
- 🧠 [Documentation main page](https://deepwiki.com/remorses/modelcontext/1-overview)
- 🚀 [QuickStart](https://deepwiki.com/remorses/modelcontext/1.1-quick-start-guide)
  
Want to dive deeper?
- 🔥 Check out the [official youtube video](https://www.youtube.com/watch?v=RzIdTyg0iZo&ab_channel=Lelewithdots) or the [detailed one](https://youtu.be/iLl6emn14bY)
- 📚 Read our [blog post](https://www.andreagemelli.me/posts/mcp/)

## Installation

Download the repo:
```bash
git clone https://github.com/remorses/easymcp.git
```

To install the dependencies, run the following command at the root of the repository:
```bash
cd easymcp && pnpm install
```

Run the application locally:
```bash
cd website && pnpm dev
```

### Self-hosting with Custom NPM Credentials

If you are self-hosting the Easy MCP service and want to publish packages under your own NPM username, follow these steps:

1.  **Open Account Settings:** Once the application is running, open the sidebar menu on the top left corner and click on the "Account" item.
2.  **Enter NPM Credentials:** In the pop up, enter your NPM username and NPM API key.
3.  **Save Credentials:** Click "Save". These credentials will be stored locally in your browser and used when generating `npm install` commands and for future NPM publishing features.

## Usecase example: Poke-api with Claude

If you want to integrate one of our published MCP on NPM on Claude:
1. Copy the following dictionary
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
2. Paste it on Claude: `Claude` -> `Settings` -> `Developer` -> `Edit Config`
3. If everything went well, you should see `pokeapi` listed among your MCP servers
4. Ask claude about how many pokemon exists!
