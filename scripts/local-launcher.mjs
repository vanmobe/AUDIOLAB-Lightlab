import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

/** Serve the built application only; never expose repository files or a development server. */
export function staticApplication(directory, port = 5173, runtimeManager) {
  const root = resolve(directory)
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    const boundPort = port || server.address()?.port
    if (![`localhost:${boundPort}`, `127.0.0.1:${boundPort}`].includes(request.headers.host)) {
      response.writeHead(403)
      response.end()
      return
    }
    if (runtimeManager && request.url?.startsWith('/__lightlab/runtime')) {
      await runtimeManager.middleware(request, response, () => {
        response.writeHead(404)
        response.end()
      })
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' })
      response.end()
      return
    }
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
      if (path.includes('\0') || path.includes('\\') || path.split('/').some((part) => part.startsWith('.'))) {
        response.writeHead(404)
        response.end()
        return
      }
      const file = await realpath(resolve(root, '.' + (path === '/' ? '/index.html' : path)))
      if (!file.startsWith((await realpath(root)) + sep)) {
        response.writeHead(404)
        response.end()
        return
      }
      const info = await stat(file)
      if (!info.isFile()) {
        response.writeHead(404)
        response.end()
        return
      }
      response.writeHead(200, {
        'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store',
      })
      if (request.method === 'HEAD') response.end()
      else {
        const stream = createReadStream(file)
        stream.on('error', () => response.destroy())
        response.on('close', () => stream.destroy())
        stream.pipe(response)
      }
    } catch {
      if (!response.headersSent) response.writeHead(404)
      response.end()
    }
  })
  return server
}
