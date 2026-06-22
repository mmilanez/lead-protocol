import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createProtocolData } from './api/protocol.mjs'

const protocolApi = () => ({
  name: 'protocol-api',
  configureServer(server: { middlewares: { use: (path: string, handler: (_request: unknown, response: import('node:http').ServerResponse) => void) => void } }) {
    server.middlewares.use('/api/protocol', (_request, response) => {
      try {
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        response.end(JSON.stringify(createProtocolData()))
      } catch (error) {
        response.statusCode = 500
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno.' }))
      }
    })
  },
})

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [react(), tailwindcss(), protocolApi()],
  build: {
    outDir: '..',
    emptyOutDir: false,
    assetsDir: 'assets',
    rollupOptions: { input: { index: fileURLToPath(new URL('./src/live-index.html', import.meta.url)) } },
  },
})
