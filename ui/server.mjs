import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createProtocolData } from './api/protocol.mjs'

const root = fileURLToPath(new URL('.', import.meta.url))
const port = Number(process.env.PORT || 3000)
const contentTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' }

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body, null, 2))
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  if (url.pathname === '/api/protocol') {
    try { sendJson(response, 200, createProtocolData()) }
    catch (error) { sendJson(response, 500, { error: error instanceof Error ? error.message : 'Erro interno.' }) }
    return
  }

  const requested = url.pathname === '/' ? 'live-index.html' : decodeURIComponent(url.pathname.slice(1))
  const safePath = normalize(requested)
  if (safePath.startsWith('..') || safePath.includes(':')) { response.writeHead(403).end('Forbidden'); return }
  const path = join(root, safePath)
  try {
    if (!statSync(path).isFile()) throw new Error('Not found')
    response.writeHead(200, { 'Content-Type': contentTypes[extname(path)] ?? 'application/octet-stream', 'Cache-Control': extname(path) === '.html' ? 'no-store' : 'public, max-age=31536000, immutable' })
    createReadStream(path).pipe(response)
  } catch { response.writeHead(404).end('Not found') }
}).listen(port, () => console.log(`Lead Protocol Console: http://localhost:${port}`))
