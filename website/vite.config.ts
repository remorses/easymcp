import { reactRouter } from '@react-router/dev/vite'
import { reactRouterHonoServer } from 'react-router-hono-server/dev'
import { viteExternalsPlugin } from '@xmorse/deployment-utils/dist/vite-externals-plugin'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
    plugins: [
        reactRouterHonoServer(),
        reactRouter(),
        tsconfigPaths(),
        viteExternalsPlugin({ externals: [] }),
    ],
})
