import { createMCPServer, StdioServerTransport } from "modelcontextutils";

function main() {
  const { server } = createMCPServer({ openapi, name });
  const transport = new StdioServerTransport();
  server.connect(transport);
}

// replaced by the function that generates the npm package
const openapi = `
  ...
`

const name = '...'

main();
