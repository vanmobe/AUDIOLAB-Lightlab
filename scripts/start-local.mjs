import { spawn, spawnSync } from 'node:child_process'
import { access } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { staticApplication } from './local-launcher.mjs'
import { verifyDistribution } from './distribution.mjs'
import { createRuntimeManager } from './runtime-manager.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const worker = resolve(root, 'runtime-worker/dist/engine.mjs')
const assembly = resolve(root, 'runtime/bin/Release/net10.0/Lightflow.Runtime.dll')
let web, manager, stopping = false
async function available(port) {
  const probe = createServer()
  await new Promise((accept, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', accept) })
  await new Promise(accept => probe.close(accept))
}
async function shutdown(code = 0) {
  if (stopping) return
  stopping = true
  web?.close(); web?.closeAllConnections()
  process.exitCode = code
  await manager?.dispose()
}
try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 of hoger is vereist.')
  let packaged = false
  try { await access(resolve(root, 'lightlab-distribution.json')); packaged = true } catch (error) { if (error.code !== 'ENOENT') throw error }
  const distribution = packaged ? await verifyDistribution(root) : undefined
  if (!distribution) {
    const runtimes = spawnSync('dotnet', ['--list-runtimes'], { encoding: 'utf8', timeout: 10_000, windowsHide: true })
    if (runtimes.error || !/Microsoft\.AspNetCore\.App 10\./.test(runtimes.stdout ?? '')) throw new Error('Installeer de ASP.NET Core 10-runtime of de .NET 10 SDK.')
  }
  try { await Promise.all([access(resolve(root, 'dist/index.html')), access(worker), access(distribution?.runtime ?? assembly)]) }
  catch { throw new Error('Lokale build ontbreekt. Voer eerst npm run build:local uit.') }
  if (process.argv.includes('--check')) console.log('Lightlab klaar: Node, ASP.NET Core, webapp, patroonengine en runtime gevonden. Geen processen gestart.')
  else {
    await Promise.all([available(5173), available(5188)])
    manager = createRuntimeManager({ root, command: distribution?.runtime ?? 'dotnet', args: distribution ? [] : [assembly], cwd: resolve(root, 'runtime'), env: { ...process.env, LIGHTFLOW_AI_PROVIDER: process.env.LIGHTFLOW_AI_PROVIDER ?? 'ollama', LIGHTLAB_NODE_PATH: process.execPath, LIGHTLAB_WORKER_PATH: worker } })
    web = staticApplication(resolve(root, 'dist'), 5173, manager)
    await new Promise((accept, reject) => { web.once('error', reject); web.listen(5173, '127.0.0.1', accept) })
    // Keep the UI available after a companion failure so the operator can inspect and recover.
    await manager.start()
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => shutdown())
    console.log('Lightlab: http://127.0.0.1:5173 — Ctrl+C sluit webapp én runtime. Fysieke output start uitgeschakeld.')
    if (process.argv.includes('--browser')) {
      const deadline = Date.now() + 15_000
      let ready = false
      while (!ready && !stopping && Date.now() < deadline) {
        try { ready = (await fetch('http://127.0.0.1:5188/health', { signal: AbortSignal.timeout(1000) })).ok } catch { /* Owned child may still be starting. */ }
        if (!ready) await new Promise(resolve => setTimeout(resolve, 200))
      }
      if (!stopping && !ready) console.error('Runtime nog niet gereed. Bekijk Lokale runtime in de interface voor status en herstel.')
      if (!stopping) {
        const url = 'http://127.0.0.1:5173'
        const opener = process.platform === 'darwin' ? ['/usr/bin/open', [url]] : process.platform === 'win32' ? ['cmd.exe', ['/d', '/c', 'start', '', url]] : ['xdg-open', [url]]
        const browser = spawn(opener[0], opener[1], { stdio: 'ignore', shell: false, windowsHide: true })
        browser.on('error', () => console.log(`Open de browser zelf op ${url}`)); browser.unref()
      }
    }
  }
} catch (error) {
  console.error(error?.code === 'EADDRINUSE' ? 'Poort 5173 of 5188 is al bezet. Sluit de eerdere Lightlab/devsessie eerst; bestaande processen zijn niet gestopt.' : error instanceof Error ? error.message : 'Lightlab kon niet starten.')
  shutdown(1)
}
