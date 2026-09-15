import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
// Shared with the standalone launcher; never included in the browser bundle.
import { createRuntimeManager } from './scripts/runtime-manager.mjs'

function localRuntimePlugin(): Plugin {
  let manager: ReturnType<typeof createRuntimeManager> | undefined
  let interrupt: (() => void) | undefined
  return {
    name: 'lightlab-local-runtime',
    configureServer(server) {
      manager = createRuntimeManager({ root: fileURLToPath(new URL('.', import.meta.url)) })
      server.middlewares.use(manager.middleware)
      // Await child cleanup before Vite exits or reloads its configuration.
      interrupt = () => { void server.close().then(() => { process.exitCode = 0 }) }
      process.once('SIGINT', interrupt)
    },
    async closeBundle() {
      if (interrupt) process.off('SIGINT', interrupt)
      await manager?.dispose()
    },
  }
}

export default defineConfig({
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  plugins: [react(), localRuntimePlugin()],
})
