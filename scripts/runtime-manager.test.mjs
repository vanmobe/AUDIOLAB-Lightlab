import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createRuntimeManager } from './runtime-manager.mjs'

// Fake processes and health probes ensure these tests never touch runtime hardware.
function fixture(options = {}) {
  const children = [], calls = [], signals = []
  let health = 'free'
  const manager = createRuntimeManager({ root: '/lightlab', pollInterval: 5, shutdownTimeout: 5, prepare: async () => {}, probe: async () => health,
    spawn: (...args) => {
      calls.push(args)
      const child = new EventEmitter()
      child.pid = 40000 + children.length
      child.stdout = new PassThrough(); child.stderr = new PassThrough()
      child.kill = signal => signals.push([child.pid, signal])
      children.push(child)
      return child
    }, killProcess: (...args) => signals.push(args), ...options })
  return { manager, children, calls, signals, setHealth: value => { health = value } }
}
async function request(manager, { url = '/__lightlab/runtime', method = 'GET', headers = {} } = {}) {
  let code, body, resultHeaders
  await manager.middleware({ url, method, headers: { host: '127.0.0.1:5173', ...headers } }, {
    writeHead(value, supplied) { code = value; resultHeaders = supplied },
    end(value) { body = JSON.parse(value) },
  })
  return { code, body, headers: resultHeaders }
}
const startHeaders = { origin: 'http://127.0.0.1:5173', 'x-lightlab-action': 'start' }
const tick = () => new Promise(resolve => setTimeout(resolve, 15))

test('singleflight start returns consistent status and fixed safe process configuration', async t => {
  const f = fixture({ env: { LIGHTLAB_RUNTIME_PORT: '6000' } }); t.after(f.manager.dispose)
  const results = await Promise.all([f.manager.start(), f.manager.start(), f.manager.start()])
  assert.equal(f.calls.length, 1)
  for (const result of results) { assert.equal(result.state, 'starting'); assert.equal(result.canStart, false) }
  const [command, args, config] = f.calls[0]
  assert.equal(command, 'dotnet')
  assert.deepEqual(args, ['run', '--project', '/lightlab/runtime/Lightflow.Runtime.csproj', '--launch-profile', 'Ollama'])
  assert.equal(config.shell, false)
  assert.equal(config.env.LIGHTLAB_WORKER_PATH, '/lightlab/runtime-worker/dist/engine.mjs')
  assert.equal(config.env.LIGHTLAB_NODE_PATH, process.execPath)
  assert.equal(config.env.LIGHTLAB_RUNTIME_PORT, '5188')
  f.setHealth('ready'); await tick()
  assert.equal((await f.manager.status()).state, 'running')
  await f.manager.start(); assert.equal(f.calls.length, 1)
})

test('external runtime and unrelated occupied port never spawn or terminate processes', async () => {
  for (const health of ['ready', 'occupied']) {
    const f = fixture(); f.setHealth(health)
    const result = await f.manager.start()
    assert.equal(result.state, health === 'ready' ? 'external' : 'error')
    assert.equal(result.canStart, false)
    assert.equal(f.calls.length, 0)
    f.manager.dispose(); assert.deepEqual(f.signals, [])
  }
})

test('dispose during preflight prevents spawning', async () => {
  let release
  const f = fixture({ probe: () => new Promise(resolve => { release = resolve }) })
  const pending = f.manager.start(); f.manager.dispose(); release('free')
  const result = await pending
  assert.equal(f.calls.length, 0); assert.equal(result.canStart, false)
})

test('raw output including large secret payloads is never exposed or retained', async t => {
  const f = fixture(); t.after(f.manager.dispose); await f.manager.start()
  const child = f.children[0]
  child.stdout.write(Buffer.alloc(1_000_000, 65))
  for (let i = 0; i < 1000; i++) child.stderr.write('Authorization: Bearer private-secret prompt=personal\n')
  child.stderr.write('error NETSDK1045 private-secret')
  const result = await f.manager.status()
  assert.equal(result.logs.length, 4)
  assert.ok(!JSON.stringify(result).includes('private-secret'))
  assert.ok(JSON.stringify(result).length < 3000)
  assert.ok(result.logs.some(entry => entry.message.includes('.NET-build')))
})

test('exit and missing executable permit retry; retention caps at 200 authored entries', async t => {
  const f = fixture(); t.after(f.manager.dispose)
  for (let i = 0; i < 120; i++) {
    await f.manager.start()
    f.children.at(-1).emit('error', { code: 'ENOENT', message: 'private-secret' })
  }
  const result = await f.manager.status()
  assert.equal(result.state, 'error'); assert.equal(result.canStart, true)
  assert.equal(result.logs.length, 200); assert.ok(result.logs[0].id > 1)
  assert.ok(!JSON.stringify(result).includes('private-secret'))
  await f.manager.start(); f.children.at(-1).emit('exit', 0)
  assert.equal((await f.manager.status()).state, 'stopped')
})

test('startup timeout signals owned process and keeps failure visible until exit', async () => {
  const f = fixture({ startupTimeout: 1 })
  await f.manager.start(); await tick()
  const result = await f.manager.status()
  assert.equal(result.state, 'error'); assert.equal(result.canStart, false)
  assert.equal(f.signals[0][1], 'SIGTERM')
  f.children[0].emit('exit', 1)
  await tick()
  assert.equal((await f.manager.status()).canStart, true)
  f.manager.dispose()
})

test('dispose terminates only owned process and blocks later starts', async () => {
  const f = fixture(); await f.manager.start(); f.manager.dispose(); f.manager.dispose()
  assert.equal(f.signals.length, 1); assert.equal(f.signals[0][1], 'SIGTERM')
  assert.equal((await f.manager.start()).canStart, false)
  f.children[0].emit('exit', 0)
  await f.manager.dispose()
  assert.equal(f.signals.length, 2)
  assert.equal(f.signals[1][1], 'SIGKILL', 'Leader exit must not cancel descendant cleanup')
})

test('missing engine gives actionable advice without spawning', async () => {
  const f = fixture({ prepare: async () => { throw new Error('ENOENT private-path') } })
  const result = await f.manager.start()
  assert.equal(result.state, 'error'); assert.equal(f.calls.length, 0)
  assert.match(result.message, /npm run build:engine/)
  assert.ok(!JSON.stringify(result).includes('private-path'))
  await f.manager.dispose()
})

test('unexpected leader exit cleans descendants and blocks restart until cleanup completes', async () => {
  const f = fixture({ shutdownTimeout: 20 })
  await f.manager.start()
  f.children[0].emit('exit', 1)
  assert.equal((await f.manager.status()).state, 'error')
  assert.equal((await f.manager.status()).canStart, false)
  await f.manager.start()
  assert.equal(f.calls.length, 1)
  assert.equal(f.signals[0][1], 'SIGTERM')
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(f.signals[1][1], 'SIGKILL')
  assert.equal((await f.manager.status()).canStart, true)
  await f.manager.start()
  assert.equal(f.calls.length, 2)
  await f.manager.dispose()
})

test('owned runtime recovers after a transient health failure', async t => {
  const f = fixture(); t.after(f.manager.dispose); await f.manager.start()
  f.setHealth('ready'); await tick()
  f.setHealth('occupied'); await tick()
  assert.equal((await f.manager.status()).state, 'error')
  f.setHealth('ready'); await tick()
  assert.equal((await f.manager.status()).state, 'running')
  assert.equal(f.calls.length, 1)
})

test('explicit stop is singleflight, blocks starts during cleanup and permits subsequent start', async t => {
  const f = fixture({ shutdownTimeout: 20 }); t.after(f.manager.dispose)
  await f.manager.start()
  assert.equal((await f.manager.status()).canStop, true)
  const result = await f.manager.stop()
  assert.equal(result.stopping, true); assert.equal(result.canStop, false); assert.equal(result.canStart, false)
  await f.manager.stop(); await f.manager.start()
  assert.equal(f.signals.length, 1); assert.equal(f.calls.length, 1)
  f.children[0].emit('exit', 0)
  await new Promise(resolve => setTimeout(resolve, 30))
  const stopped = await f.manager.status()
  assert.equal(stopped.state, 'stopped'); assert.equal(stopped.stopping, false); assert.equal(stopped.canStart, true)
  await f.manager.start(); assert.equal(f.calls.length, 2)
})

test('stop cancels pending preflight and never touches external runtime', async () => {
  let release
  const f = fixture({ prepare: () => new Promise(resolve => { release = resolve }) })
  const pending = f.manager.start()
  await new Promise(resolve => setImmediate(resolve))
  const result = await f.manager.stop()
  assert.equal(result.stopping, true)
  release(); await pending; await tick()
  assert.equal(f.calls.length, 0); assert.equal(f.signals.length, 0)
  await f.manager.dispose()
  const external = fixture(); external.setHealth('ready')
  await external.manager.status()
  assert.equal((await external.manager.stop()).canStop, false)
  assert.equal(external.signals.length, 0)
  await external.manager.dispose()
})

test('stop route rejects unsafe requests and accepts only the explicit same-origin stop header', async t => {
  const f = fixture(); t.after(f.manager.dispose); await f.manager.start()
  for (const [headers, code] of [
    [startHeaders, 403], [{ origin: 'http://evil.example', 'x-lightlab-action': 'stop' }, 403],
    [{ origin: 'http://127.0.0.1:5173', 'x-lightlab-action': 'stop', 'content-length': '2' }, 400],
  ]) assert.equal((await request(f.manager, { url: '/__lightlab/runtime/stop', method: 'POST', headers })).code, code)
  assert.equal(f.signals.length, 0)
  const result = await request(f.manager, { url: '/__lightlab/runtime/stop', method: 'POST', headers: { ...startHeaders, 'x-lightlab-action': 'stop' } })
  assert.equal(result.code, 202); assert.equal(result.body.stopping, true)
  assert.equal(f.signals.length, 1)
  f.children[0].emit('exit', 0)
})

test('start time and build mode distinguish source build from prebuilt Release without freshness claims', async t => {
  const dev = fixture(), release = fixture({ args: ['/lightlab/runtime/bin/Release/net10.0/Lightflow.Runtime.dll'] })
  t.after(dev.manager.dispose); t.after(release.manager.dispose)
  const initial = await dev.manager.status()
  assert.equal(initial.startedAt, null); assert.equal(initial.launchMode, 'development')
  const running = await dev.manager.start()
  assert.ok(Number.isFinite(Date.parse(running.startedAt)))
  assert.match(running.buildMessage, /latere wijzigingen niet/)
  const prebuilt = await release.manager.status()
  assert.equal(prebuilt.launchMode, 'prebuilt'); assert.match(prebuilt.buildMessage, /bouwt geen broncode/)
})

test('HTTP start requires exact local Host, matching Origin, explicit header and empty body', async t => {
  const f = fixture(); t.after(f.manager.dispose)
  for (const headers of [
    { ...startHeaders, host: 'attacker.example:5173' },
    { ...startHeaders, origin: 'https://attacker.example' },
    { ...startHeaders, origin: 'http://localhost:5173' },
    { 'x-lightlab-action': 'start' },
    { origin: 'http://127.0.0.1:5173' },
  ]) assert.equal((await request(f.manager, { url: '/__lightlab/runtime/start', method: 'POST', headers })).code, 403)
  for (const extra of [{ 'content-length': '1' }, { 'transfer-encoding': 'chunked' }]) {
    assert.equal((await request(f.manager, { url: '/__lightlab/runtime/start', method: 'POST', headers: { ...startHeaders, ...extra } })).code, 400)
  }
  assert.equal(f.calls.length, 0)
  const result = await request(f.manager, { url: '/__lightlab/runtime/start', method: 'POST', headers: startHeaders })
  assert.equal(result.code, 202); assert.equal(result.body.state, 'starting')
  assert.equal(result.headers['Cache-Control'], 'no-store')
})

test('HTTP reads reject foreign origins and API never accepts arguments, queries or other methods', async t => {
  const f = fixture(); t.after(f.manager.dispose)
  assert.equal((await request(f.manager, { headers: { origin: 'http://evil.example' } })).code, 403)
  assert.equal((await request(f.manager, { url: '/__lightlab/runtime?command=evil' })).code, 404)
  assert.equal((await request(f.manager, { url: '/__lightlab/runtime/start?args=evil', method: 'POST', headers: startHeaders })).code, 404)
  assert.equal((await request(f.manager, { method: 'DELETE' })).code, 405)
  assert.equal((await request(f.manager, { method: 'OPTIONS' })).code, 405)
  const result = await request(f.manager)
  assert.equal(result.code, 200); assert.equal(result.body.version, 1)
  assert.equal(result.body.state, 'stopped'); assert.equal(result.body.canStart, true)
  assert.equal(f.calls.length, 0)
})
