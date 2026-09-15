import assert from 'node:assert/strict'
import dgram from 'node:dgram'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { resolve } from 'node:path'
import { initialShow } from '../src/seed.ts'

// Isolated owned companion + real Node evaluator + loopback receiver. Never contacts the user's runtime or node.
const reservation = net.createServer()
reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening')
const port = reservation.address().port
await new Promise(done => reservation.close(done))
const receiver = dgram.createSocket('udp4')
receiver.bind(5568, '127.0.0.1'); await once(receiver, 'listening')
const packets = []
receiver.on('message', (packet, remote) => {
  assert.equal(remote.address, '127.0.0.1')
  if (packets.length < 2000) packets.push(Buffer.from(packet))
})
const child = spawn('dotnet', [resolve('runtime/bin/Debug/net10.0/Lightflow.Runtime.dll')], {
  env: { ...process.env, LIGHTLAB_RUNTIME_PORT: String(port), LIGHTLAB_WORKER_PATH: resolve('runtime-worker/dist/engine.mjs'), LIGHTFLOW_AI_PROVIDER: 'offline-templates' },
  stdio: ['ignore', 'ignore', 'ignore'],
})
const exited = once(child, 'exit')
const base = `http://127.0.0.1:${port}`
const read = async path => { const response = await fetch(base + path); assert.equal(response.status, 200); return response.json() }
const post = (path, value, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(value) })
const wait = async predicate => {
  for (let i = 0; i < 150; i++) {
    assert.equal(child.exitCode, null, 'Owned companion must remain alive')
    if (await predicate()) return
    await delay(30)
  }
  throw new Error('Timed out waiting for local output')
}
let sessionId
const output = command => post('/playback/output', { version: 1, sessionId, command, ...(command === 'arm' ? { confirmed: true } : {}) })
try {
  await wait(async () => { try { return (await read('/health')).status === 'ready' } catch { return false } })
  const show = structuredClone(initialShow)
  for (const fixture of show.fixtures) if (fixture.groupId === 'front') fixture.patch.universe = 2
  show.routes = [1, 2].map(universe => ({ id: `test-${universe}`, universe, protocol: 'sacn', host: '127.0.0.1', enabled: true }))
  const started = await post('/playback/start', { version: 1, show, bpm: 120, lookId: 'neon-chorus' })
  assert.equal(started.status, 200, await started.clone().text())
  sessionId = (await started.json()).sessionId
  await delay(100); assert.equal(packets.length, 0, 'Even enabled show routes do not auto-arm')
  assert.equal((await post('/playback/output', { version: 1, sessionId, command: 'arm' })).status, 400)
  assert.equal((await post('/playback/output', { version: 1, sessionId: 'stale', command: 'arm', confirmed: true })).status, 409)
  assert.equal((await post('/playback/output', { version: 1, sessionId, command: 'arm', confirmed: true }, { origin: 'https://invalid.example' })).status, 403)
  assert.equal((await output('arm')).status, 200)
  await wait(() => packets.length >= 8)
  for (const universe of [1, 2]) {
    const frames = packets.filter(p => p.readUInt16BE(113) === universe)
    assert.ok(frames.length >= 3)
    assert.ok(frames.some(p => p.subarray(126).some(value => value > 0)), 'Real evaluator light reaches the wire')
    assert.ok(frames.every(p => p.length === 638 && p[125] === 0 && p[112] === 0))
    assert.equal(frames[1][111], (frames[0][111] + 1) % 256)
  }
  assert.equal((await post('/output/arm', { confirmed: true, host: '127.0.0.1', universe: 1, protocol: 'sacn' })).status, 409, 'Legacy sender cannot compete')
  assert.equal((await read('/playback/status')).outputSent, true)
  assert.equal((await read(`/playback/preview?sessionId=${sessionId}`)).status.outputSent, true)
  await post('/playback/command', { version: 1, sessionId, command: 'mode', mode: 'blackout' })
  await delay(100)
  assert.ok(packets.slice(-4).every(p => p.subarray(126).every(value => value === 0)), 'Continuous blackout covers both universes')
  assert.equal((await read(`/playback/output?sessionId=${sessionId}`)).state, 'armed')
  await post('/playback/command', { version: 1, sessionId, command: 'look', lookId: 'warm-static' })
  await delay(100)
  assert.ok(packets.slice(-4).some(p => p.subarray(126).some(value => value > 0)), 'Look change resumes actual output')
  assert.equal((await output('disarm')).status, 200)
  await delay(50)
  for (const universe of [1, 2]) assert.equal(packets.filter(p => p.readUInt16BE(113) === universe && p[112] === 0x40).length, 3)
  const count = packets.length
  await delay(120); assert.equal(packets.length, count, 'No sends after acknowledged disarm')
  assert.equal((await read('/playback/status')).status, 'running', 'Disarm keeps the memory show running')
  assert.equal((await read('/playback/status')).outputSent, false)
  // Browser sends a bounded analysis once; actual evaluator/DMX encoder still own every wire frame.
  const audioId = 'a'.repeat(32)
  const position = { seconds: 1, playing: false, mode: 'kicks', bpm: 120,
    reactions: Object.fromEntries(show.groups.map(group => [group.id, 'pulse'])), decayMs: 300, floor: .2 }
  const analysis = { duration: 3, kicks: [{ time: 1, strength: 1 }, { time: 2, strength: 1 }], bpm: 60, confidence: 1 }
  const audio = (command, extra = {}) => post('/playback/audio', { version: 1, sessionId, audioId, command, ...extra })
  assert.equal((await audio('attach', { sequence: 0, analysis, position })).status, 200)
  assert.equal((await read(`/playback/output?sessionId=${sessionId}`)).state, 'disarmed', 'Audio attach never arms DMX')
  assert.equal((await audio('sync', { sequence: 0, position })).status, 400, 'Sequence zero cannot replay a heartbeat')
  assert.equal((await output('arm')).status, 200)
  await delay(100)
  const wire = () => packets.filter(p => p.readUInt16BE(113) === 2 && p[112] === 0).at(-1).subarray(126)
  const peak = Buffer.from(wire())
  assert.ok(peak.some(value => value > 0), 'Kick peak reaches physical DMX encoder')
  assert.equal((await audio('sync', { sequence: 1, position: { ...position, seconds: 1.5 } })).status, 200)
  await delay(100)
  const trough = Buffer.from(wire())
  assert.ok(trough.some((value, i) => value < peak[i]), 'Kick tail reduces real universe channel levels')
  assert.equal((await audio('sync', { sequence: 2, position })).status, 200)
  await delay(100)
  assert.deepEqual(wire(), peak, 'Backward seek reconstructs the same DMX peak')
  assert.equal((await audio('sync', { sequence: 1, position })).status, 409, 'Old positions cannot roll back the clock')
  assert.equal((await post('/playback/command', { version: 1, sessionId, command: 'mode', mode: 'blackout' })).status, 200)
  assert.equal((await audio('sync', { sequence: 3, position })).status, 200)
  await delay(70)
  assert.ok(wire().every(value => value === 0), 'Blackout overrides audio kicks on the wire')
  await wait(async () => (await read(`/playback/audio?sessionId=${sessionId}`)).state === 'lost')
  assert.equal((await read(`/playback/output?sessionId=${sessionId}`)).state, 'disarmed', 'Missing clock disarms physical output')
  const expiredCount = packets.length
  await delay(100); assert.equal(packets.length, expiredCount, 'No indefinite output after heartbeat loss')
  assert.equal((await audio('sync', { sequence: 4, position })).status, 409, 'Lost clock cannot auto-resume')
  assert.equal((await output('arm')).status, 409, 'Lost audio requires explicit reconnect before re-arm')
  assert.equal((await audio('detach')).status, 200)
  assert.equal((await output('arm')).status, 200)
  assert.equal((await post('/playback/command', { version: 1, sessionId, command: 'stop' })).status, 200)
  assert.equal((await read(`/playback/output?sessionId=${sessionId}`)).state, 'disarmed')
  console.log('PASS: isolated HTTP + real evaluator + two sACN universes; opt-in, fencing, Look changes, WAV kick peak/tail/seek, blackout priority, audio watchdog/disarm, no automatic resume, Stop.')
} finally {
  if (child.exitCode === null) {
    if (sessionId) await post('/playback/command', { version: 1, sessionId, command: 'stop' }).catch(() => {})
    child.kill('SIGTERM')
    await Promise.race([exited, delay(4000).then(() => { if (child.exitCode === null) child.kill('SIGKILL') })])
  }
  receiver.close()
}
