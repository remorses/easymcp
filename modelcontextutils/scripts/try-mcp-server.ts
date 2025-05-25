import fs from 'fs'
import YAML from 'js-yaml'
import path from 'path'

import { createMCPServer, StdioServerTransport } from '../src/lib/mcp.js'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function main() {
    const name = 'mistral'

    // const openapiUrl =
    //   "https://raw.githubusercontent.com/calcom/cal.com/main/docs/api-reference/v2/openapi.json";
    // const openapi = YAML.load(await (await fetch(openapiUrl)).text()) as any;
    const openapi = JSON.parse(
        fs.readFileSync(
            path.resolve(__dirname, `../../openapis/results/${name}.json`),
            'utf8',
        ),
    ) as any
    const { server } = createMCPServer({ openapi, name })
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error(`Started MCP STDIO server for ${name}`)
}

const previousLogs = ''

process.stderr.on('data', (data) => {
    fs.writeFileSync(
        path.resolve(__dirname, 'mcplogs.log'),
        `${previousLogs}${data.toString()}\n`,
    )
})

main()
