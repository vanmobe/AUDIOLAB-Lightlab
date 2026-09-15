import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    ssr: 'runtime-worker/engine.ts', target: 'node22', outDir: 'runtime-worker/dist',
    emptyOutDir: true, minify: false,
    rollupOptions: { output: { entryFileNames: 'engine.mjs' } },
  },
})
