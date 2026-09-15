import { spawn as spawnProcess } from 'node:child_process'
import { get } from 'node:http'
import { connect } from 'node:net'
import { resolve } from 'node:path'
import { access } from 'node:fs/promises'

// Read only the fixed local health endpoint, with both time and byte limits.
export async function probeRuntime() {
  const occupied = await new Promise(accept => {
    const socket = connect({ host: '127.0.0.1', port: 5188 })
    const done = value => { socket.destroy(); accept(value) }
    socket.setTimeout(750, () => done(true))
    socket.once('connect', () => done(true))
    socket.once('error', error => done(error.code !== 'ECONNREFUSED'))
  })
  if (!occupied) return 'free'
  return new Promise(accept => {
    const request = get('http://127.0.0.1:5188/health', response => {
      let bytes = 0, body = ''
      response.on('data', chunk => {
        bytes += chunk.length
        if (bytes > 4096) { response.destroy(); accept('occupied') }
        else body += chunk.toString('utf8')
      })
      response.on('error', () => accept('occupied'))
      response.on('end', () => {
        try {
          const value = JSON.parse(body)
          accept(response.statusCode === 200 && value.status === 'ready' && typeof value.armed === 'boolean' && value.output === 'disabled-by-default' ? 'ready' : 'occupied')
        } catch { accept('occupied') }
      })
    })
    const timer = setTimeout(() => { request.destroy(); accept('occupied') }, 1000)
    request.once('close', () => clearTimeout(timer))
    request.once('error', () => accept('occupied'))
  })
}

/** Own one companion process. HTTP requests can never select commands or configuration. */
export function createRuntimeManager({ root, command = 'dotnet', args = ['run', '--project', resolve(root, 'runtime/Lightflow.Runtime.csproj'), '--launch-profile', 'Ollama'], cwd = resolve(root, 'runtime'), env = {}, spawn = spawnProcess, probe = probeRuntime, prepare = () => access(resolve(root, 'runtime-worker/dist/engine.mjs')), startupTimeout = 45_000, pollInterval = 1000, shutdownTimeout = 5000, killProcess = process.kill.bind(process) }) {
  let state = 'stopped', message = 'De lokale runtime is gestopt.', child, starting, checking, timer, cleanup, disposed = false, stopping = false, id = 0
  let deadline = 0, lastProbe = 0, portBlocked = false, generation = 0, startedAt = null
  const launchMode = command === 'dotnet' && args[0] === 'run' && !args.includes('--no-build') ? 'development' : 'prebuilt'
  const buildMessage = launchMode === 'development'
    ? 'Start bouwt de .NET-runtime vanuit de broncode (Debug). De patroonengine gebruikt de laatste aparte enginebuild. Een draaiend proces neemt latere wijzigingen niet over.'
    : 'Deze starter gebruikt een vooraf gebouwde runtime. Opnieuw starten bouwt geen broncode; bouw eerst npm run build:local of open een nieuw distributiepakket.'
  const logs = []
  const loggedCategories = new Set()
  function log(level, text) {
    logs.push({ id: ++id, time: new Date().toISOString(), level, message: text })
    if (logs.length > 200) logs.shift()
  }
  function transition(next, text, level = 'info') {
    if (state !== next || message !== text) log(level, text)
    state = next; message = text
  }
  function snapshot() { return { version: 1, state, canStart: !disposed && !child && !starting && !stopping && !portBlocked && (state === 'stopped' || state === 'error'), canStop: !disposed && !stopping && Boolean(child || starting), stopping, startedAt: state === 'external' ? null : startedAt, launchMode, buildMessage, message, logs: logs.map(entry => ({ ...entry })) } }
  function stopOwned() {
    if (cleanup) return cleanup
    if (!child) return Promise.resolve()
    stopping = true
    const owned = child
    const signal = value => {
      try {
        // A separate Unix process group includes dotnet's application and Node worker.
        if (process.platform !== 'win32' && owned.pid) killProcess(-owned.pid, value)
        else {
          // Fixed executable and owned PID only; /T covers the dotnet/worker tree.
          const killer = spawnProcess('taskkill.exe', ['/PID', String(owned.pid), '/T', ...(value === 'SIGKILL' ? ['/F'] : [])], { shell: false, windowsHide: true, stdio: 'ignore' })
          killer.on('error', () => { try { owned.kill(value) } catch { /* Exited. */ } })
        }
      } catch { /* Already exited. Never target a discovered external process. */ }
    }
    signal('SIGTERM')
    // The leader may exit while a descendant ignores TERM. Retain its process
    // group until the deadline, independently of the leader's exit event.
    cleanup = new Promise(accept => {
      setTimeout(() => { signal('SIGKILL'); stopping = false; cleanup = undefined; accept() }, shutdownTimeout)
    })
    return cleanup
  }
  async function check() {
    if (checking) return checking
    checking = (async () => {
      let result
      try { result = await probe() } catch { result = 'occupied' }
      lastProbe = Date.now()
      if (disposed) return result
      portBlocked = result !== 'free'
      if (stopping) return result
      if (child) {
        if (result === 'ready' && !stopping) transition('running', 'De lokale runtime is klaar.')
        else if (state === 'starting' && Date.now() >= deadline) {
          transition('error', 'De runtime werd niet op tijd klaar. Bekijk de installatie en probeer opnieuw.', 'error')
          stopOwned()
        } else if (state === 'running' && result !== 'ready') transition('error', 'De runtime reageert niet. Sluit deze Lightlab-sessie en start opnieuw.', 'error')
      } else if (result === 'ready') transition('external', 'Een bestaande lokale runtime is verbonden. Deze sessie beheert dat proces niet.')
      else if (result === 'occupied') transition('error', 'Poort 5188 is bezet door een proces dat niet als Lightlab-runtime reageert.', 'error')
      else if (state === 'external' || message.startsWith('Poort 5188')) transition('stopped', 'De lokale runtime is gestopt.')
      return result
    })()
    try { return await checking } finally { checking = undefined }
  }
  async function status() {
    if (!disposed && !starting && Date.now() - lastProbe > pollInterval) await check()
    return snapshot()
  }
  function start() {
    if (starting) return starting
    if (disposed || child || stopping) return Promise.resolve(snapshot())
    const requestedGeneration = ++generation
    starting = (async () => {
      const existing = await check()
      if (disposed || generation !== requestedGeneration || existing !== 'free') return
      try { await prepare() } catch {
        if (disposed || generation !== requestedGeneration) return
        transition('error', 'De patroonengine ontbreekt. Voer eerst npm run build:engine uit.', 'error')
        return
      }
      if (disposed || generation !== requestedGeneration) return
      transition('starting', 'De lokale runtime wordt gestart. Fysieke uitvoer blijft uitgeschakeld.')
      deadline = Date.now() + startupTimeout
      loggedCategories.clear()
      try {
        const owned = spawn(command, args, { cwd, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, LIGHTFLOW_AI_PROVIDER: process.env.LIGHTFLOW_AI_PROVIDER ?? 'ollama', ...env, LIGHTLAB_RUNTIME_PORT: '5188', LIGHTLAB_NODE_PATH: process.execPath, LIGHTLAB_WORKER_PATH: resolve(root, 'runtime-worker/dist/engine.mjs') } })
        child = owned
        startedAt = new Date().toISOString()
        // Raw application/provider output may contain private prompts or credentials.
        // Drain without retaining lines; inspect only a bounded prefix for authored advice.
        const output = (chunk, stream) => {
          const prefix = chunk.subarray ? chunk.subarray(0, 2048).toString('utf8') : String(chunk).slice(0, 2048)
          const category = /error (CS|MSB|NETSDK)\d/.test(prefix) ? 'build' : /address already in use|EADDRINUSE/i.test(prefix) ? 'port' : stream
          if (loggedCategories.has(category)) return
          loggedCategories.add(category)
          const text = category === 'build' ? 'De .NET-build meldt een fout. Controleer de lokale build in de terminal.' : category === 'port' ? 'De runtime meldt dat de luisterpoort bezet is.' : `De runtime heeft ${stream === 'stderr' ? 'diagnostische' : 'proces'}uitvoer geschreven. Ruwe inhoud wordt om privacyredenen niet getoond.`
          log(category === 'build' || category === 'port' ? 'error' : 'info', text)
        }
        owned.stdout?.on('data', chunk => output(chunk, 'stdout'))
        owned.stderr?.on('data', chunk => output(chunk, 'stderr'))
        owned.once('error', error => {
          if (child !== owned) return
          child = undefined; clearInterval(timer)
          if (!disposed) transition('error', error.code === 'ENOENT' ? 'De runtime kon niet starten: .NET of het runtimeprogramma ontbreekt.' : 'De runtime kon niet worden gestart.', 'error')
        })
        owned.once('exit', code => {
          if (child !== owned) return
          const wasStopping = stopping
          // An exited launcher can leave its runtime or worker alive. Preserve
          // group ownership through cleanup before allowing another start.
          void stopOwned()
          child = undefined; clearInterval(timer)
          if (!disposed && state !== 'error' && !wasStopping) transition(code === 0 ? 'stopped' : 'error', code === 0 ? 'De lokale runtime is gestopt.' : 'De lokale runtime is onverwacht gestopt.', code === 0 ? 'info' : 'error')
        })
        timer = setInterval(() => { void check() }, pollInterval)
        timer.unref?.()
      } catch { transition('error', 'De runtime kon niet worden gestart.', 'error') }
    })().finally(() => { starting = undefined }).then(snapshot)
    return starting
  }
  function stop() {
    if (disposed || stopping || (!child && !starting)) return Promise.resolve(snapshot())
    ++generation // Cancel an in-flight preflight without launching a process after Stop.
    transition(state, 'De lokale runtime wordt gestopt. Afspelen en runtimeverbindingen worden beëindigd.')
    const pendingStart = starting
    const done = stopOwned()
    stopping = true
    void (async () => {
      await pendingStart
      await done
      if (disposed) return
      stopping = false
      if (child) transition('error', 'Stoppen is nog niet bevestigd. Controleer opnieuw voordat je start.', 'error')
      else transition('stopped', 'De lokale runtime is gestopt.')
      await check()
    })()
    return Promise.resolve(snapshot())
  }
  async function middleware(request, response, next = () => { response.writeHead(404); response.end() }) {
    const path = request.url ?? ''
    if (!path.startsWith('/__lightlab/runtime')) { next(); return }
    const send = (code, value) => { response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(value)) }
    const host = request.headers.host
    const origin = request.headers.origin
    if (!['127.0.0.1:5173', 'localhost:5173'].includes(host) || (origin !== undefined && origin !== `http://${host}`)) { send(403, { error: 'Alleen lokale toegang vanuit Lightlab is toegestaan.' }); return }
    const action = path === '/__lightlab/runtime/start' ? 'start' : path === '/__lightlab/runtime/stop' ? 'stop' : null
    if (path !== '/__lightlab/runtime' && !action) { send(404, { error: 'Onbekende runtimeactie.' }); return }
    if (path === '/__lightlab/runtime' && request.method === 'GET') { send(200, await status()); return }
    if (!action || request.method !== 'POST') { send(405, { error: 'Deze methode is niet toegestaan.' }); return }
    if (origin !== `http://${host}` || request.headers['x-lightlab-action'] !== action) { send(403, { error: 'De runtimeactie moet vanuit Lightlab worden aangevraagd.' }); return }
    if (request.headers['transfer-encoding'] !== undefined || (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0')) { send(400, { error: 'De runtimeactie accepteert geen inhoud.' }); return }
    send(202, await (action === 'start' ? start() : stop()))
  }
  function dispose() {
    if (disposed) return cleanup ?? Promise.resolve()
    disposed = true; clearInterval(timer)
    const done = stopOwned()
    transition('stopped', 'Deze Lightlab-sessie is afgesloten.')
    return done
  }
  return { middleware, start, stop, status, dispose }
}
