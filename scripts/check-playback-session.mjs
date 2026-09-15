import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { initialShow } from '../src/seed.ts'

// Node22 type stripping loads only the source seed. All playback runs through the real companion/worker.
const base = 'http://127.0.0.1:5188'
const read = async path => { const response = await fetch(base + path); assert.equal(response.status, 200); return response.json() }
const post = (path, value) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })
const waitFor = async (path, predicate) => {
  const deadline = performance.now() + 4000
  while (performance.now() < deadline) {
    const value = await read(path)
    if (predicate(value)) return value
    await delay(30)
  }
  throw new Error(`Timed out waiting for ${path}`)
}
const before = await read('/playback/status')
assert.ok(!['running', 'starting'].includes(before.status), 'Do not replace someone else’s active session')
assert.equal((await read('/health')).armed, false, 'Hardware stays unarmed')
const show = structuredClone(initialShow)
// Two distinct universes prove that autonomous output is not the legacy single-route raw sender.
for (const fixture of show.fixtures) if (fixture.groupId === 'front') fixture.patch.universe = 2
show.routes.push({ id: 'second', universe: 2, protocol: 'sacn', host: '', enabled: false })
let sessionId
const command = async value => {
  const response = await post('/playback/command', { version: 1, sessionId, ...value })
  assert.equal(response.status, 200, await response.clone().text())
  const status = await response.json()
  assert.equal(status.sessionId, sessionId)
  assert.equal(status.outputSent, false)
  return status
}
try {
  const started = await post('/playback/start', { version: 1, show, bpm: 120, lookId: 'neon-chorus' })
  assert.equal(started.status, 200, await started.clone().text())
  const status = await started.json(); sessionId = status.sessionId
  assert.equal(status.status, 'running'); assert.equal(status.outputSent, false)
  const framePath = () => `/playback/frame?sessionId=${encodeURIComponent(sessionId)}`
  const first = await read(framePath())
  assert.equal(first.inspection.universes.length, 2)
  const progressing = await waitFor('/playback/status', next => next.frameCount > status.frameCount + 3)
  assert.ok(progressing.atBeats > status.atBeats, 'Clock advances without any browser or incoming frames')
  const conflict = await post('/playback/start', { version: 1, show, bpm: 120, lookId: 'warm-static' })
  assert.equal(conflict.status, 409, 'Active session cannot be implicitly replaced')
  const slow = await command({ command: 'bpm', bpm: 60 })
  assert.equal(slow.bpm, 60)
  assert.ok(slow.atBeats >= progressing.atBeats, 'BPM change preserves elapsed phase')
  await command({ command: 'mode', mode: 'static' })
  const held = await waitFor(framePath(), value => value.frame.mode === 'static')
  await delay(160)
  const heldLater = await read(framePath())
  assert.deepEqual(heldLater.inspection.universes.map(u => u.channels), held.inspection.universes.map(u => u.channels), 'Static holds emitted values')
  await command({ command: 'mode', mode: 'blackout' })
  const black = await waitFor(framePath(), value => value.frame.mode === 'blackout')
  assert.ok(black.inspection.universes.every(u => u.channels.every(value => value === 0)), 'Blackout zeros every universe')
  const badLook = await post('/playback/command', { version: 1, sessionId, command: 'look', lookId: 'missing' })
  assert.equal(badLook.status, 400)
  assert.equal((await read('/playback/status')).mode, 'blackout', 'Rejected command cannot change current mode')
  await command({ command: 'look', lookId: 'warm-static' })
  await command({ command: 'mode', mode: 'automation' })
  const warm = await waitFor(framePath(), value => value.frame.mode === 'automation' && value.inspection.universes.some(u => u.channels.some(value => value > 0)))
  assert.equal(warm.inspection.outputSent, false)
  assert.equal((await command({ command: 'stop' })).status, 'stopped')
  assert.equal((await fetch(base + framePath())).status, 409, 'Stopped session has no stale frame')
  assert.equal((await command({ command: 'stop' })).status, 'stopped', 'Stop is idempotent for the same session')
  const oldId = sessionId
  const restart = await post('/playback/start', { version: 1, show, bpm: 90, lookId: 'warm-static' })
  assert.equal(restart.status, 200)
  sessionId = (await restart.json()).sessionId
  assert.notEqual(sessionId, oldId)
  assert.equal((await post('/playback/command', { version: 1, sessionId: oldId, command: 'stop' })).status, 409, 'Old tab cannot stop replacement session')
  assert.equal((await read('/playback/status')).status, 'running')
  console.log('Autonomous real-process playback passed: two universes, browser-independent clock, BPM continuity, static, blackout, invalid command, explicit stop and session fencing. No physical output.')
} finally {
  if (sessionId) await post('/playback/command', { version: 1, sessionId, command: 'stop' })
  assert.equal((await read('/health')).armed, false)
}
