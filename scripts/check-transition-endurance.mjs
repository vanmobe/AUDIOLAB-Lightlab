import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { initialShow } from '../src/seed.ts'

// Five-minute, memory-only acceptance. Never arm/send or replace an existing session.
const base = 'http://127.0.0.1:5188', duration = 300_000
const latencies = [], cadence = [], memory = []
let sessionId
async function request(path, body) {
  const started = performance.now()
  const response = await fetch(base + path, { signal: AbortSignal.timeout(4000), ...(body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) })
  latencies.push(performance.now() - started)
  assert.equal(response.status, 200, `Unexpected HTTP status on ${path}`)
  return response.json()
}
assert.equal((await request('/health')).armed, false)
assert.ok(['idle', 'stopped', 'faulted'].includes((await request('/playback/status')).status), 'Active session: refusing to interfere')
const show = structuredClone(initialShow)
show.regie = { minimumCoverage: { percent: 0, threshold: .1 }, colorRoles: ['primary'], safetyGroupIds: ['wash'], transition: { quantizeBeats: 1, fadeBeats: 4 } }
show.groups.forEach(group => { group.intensity = group.id === 'effects' ? 0 : 1 })
show.colorProfiles.forEach((profile, index) => { profile.primary = index ? '#ff0000' : '#0000ff'; profile.intensityLimit = 1 })
show.looks.forEach(look => { look.layers = show.groups.map(group => ({ groupId: group.id, mode: group.id === 'effects' ? 'off' : 'static', programId: null, colorProfileId: null, intensity: 1, rateBeats: 1, offsetBeats: 0 })) })
const command = body => request('/playback/command', { version: 1, sessionId, ...body })
const preview = () => request(`/playback/preview?sessionId=${encodeURIComponent(sessionId)}`)
async function until(predicate) {
  const end = performance.now() + 3500
  while (performance.now() < end) { const value = await preview(); if (predicate(value)) return value; await delay(30) }
  throw new Error('Transition phase did not arrive within the bounded wait')
}
function colorDistance(a, b) { return Math.max(...[1, 3, 5].map(index => Math.abs(parseInt(a.slice(index, index + 2), 16) - parseInt(b.slice(index, index + 2), 16)))) }
// Optional read-only process-memory sampling; never inspect command arguments or kill a process.
const listener = spawnSync('lsof', ['-tiTCP:5188', '-sTCP:LISTEN'], { encoding: 'utf8', timeout: 1000 })
const runtimePid = /^\d+\s*$/.test(listener.stdout ?? '') ? Number(listener.stdout.trim()) : undefined
function sampleMemory(elapsed) {
  if (!runtimePid) return
  const result = spawnSync('ps', ['-axo', 'pid=,ppid=,rss=,comm='], { encoding: 'utf8', timeout: 1000, maxBuffer: 2_000_000 })
  if (result.status !== 0) return
  const rows = result.stdout.split('\n').map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/)).filter(Boolean).map(match => ({ pid: Number(match[1]), parent: Number(match[2]), rssKiB: Number(match[3]) }))
  const runtime = rows.find(row => row.pid === runtimePid), workers = rows.filter(row => row.parent === runtimePid)
  if (runtime) memory.push({ elapsedSeconds: Math.round(elapsed / 1000), runtimeRssKiB: runtime.rssKiB, workerRssKiB: workers.reduce((sum, row) => sum + row.rssKiB, 0), workerCount: workers.length })
}
try {
  const started = await request('/playback/start', { version: 1, show, bpm: 120, lookId: 'warm-static' })
  sessionId = started.sessionId
  assert.equal(started.status, 'running'); assert.equal(started.outputSent, false)
  await command({ command: 'look', lookId: 'neon-chorus' })
  const queued = await preview()
  assert.equal(queued.transition?.phase, 'queued')
  assert.equal(queued.transition.startAtBeats % 1, 0)
  const fading = await until(value => value.transition?.phase === 'fading' && value.transition.progress > .1)
  assert.ok(fading.frame.fixtures[0].color !== '#ff0000' && fading.frame.fixtures[0].color !== '#0000ff')
  await command({ command: 'look', lookId: 'warm-static' })
  const interrupted = await preview()
  assert.ok(colorDistance(fading.frame.fixtures[0].color, interrupted.frame.fixtures[0].color) < 32, 'Interrupt cue should not jump to a fresh endpoint')
  await until(value => value.transition?.phase === 'fading' && value.transition.progress > .1)
  await command({ command: 'mode', mode: 'static' })
  const held = await preview(); assert.equal(held.transition, null)
  await delay(300)
  assert.deepEqual((await preview()).frame.fixtures, held.frame.fixtures, 'Static must preserve the mixed image')
  const slow = await command({ command: 'bpm', bpm: 60 })
  assert.ok(slow.atBeats >= held.status.atBeats)
  assert.deepEqual((await preview()).frame.fixtures, held.frame.fixtures)
  await command({ command: 'bpm', bpm: 120 })
  await command({ command: 'mode', mode: 'blackout' })
  const black = await preview(); assert.equal(black.transition, null)
  assert.ok(black.frame.fixtures.every(light => light.intensity === 0 && light.haze === 0))
  await command({ command: 'look', lookId: 'neon-chorus' })
  const beforeOff = await preview()
  await command({ command: 'live', expectedRevision: beforeOff.revision, controls: { overrides: { back: { mode: 'off' } }, links: [] }, groupIntensities: beforeOff.groupIntensities, colorLockId: null })
  const off = await preview(); assert.equal(off.transition, null)
  assert.ok(off.frame.fixtures.filter(light => show.fixtures.find(fixture => fixture.id === light.fixtureId).groupId === 'back').every(light => light.intensity === 0))
  await command({ command: 'look', lookId: 'warm-static' })
  const startTime = performance.now(), startFrame = (await preview()).status.frameCount
  let nextCue = 5000, nextMemory = 0, nextReport = 60_000, cueCount = 0, last = await preview(), lastSample = performance.now()
  console.log('Transition assertions passed; starting five-minute memory-only soak (concurrent AI load is external).')
  while (performance.now() - startTime < duration) {
    const elapsed = performance.now() - startTime
    if (elapsed >= nextCue) { await command({ command: 'look', lookId: ++cueCount % 2 ? 'neon-chorus' : 'warm-static' }); nextCue += 5000 }
    const value = await preview(), now = performance.now()
    assert.equal(value.sessionId, sessionId); assert.equal(value.status.outputSent, false)
    assert.ok(value.status.frameCount >= last.status.frameCount && value.status.atBeats >= last.status.atBeats)
    cadence.push((value.status.frameCount - last.status.frameCount) * 1000 / Math.max(1, now - lastSample))
    last = value; lastSample = now
    if (elapsed >= nextMemory) { sampleMemory(elapsed); nextMemory += 30_000 }
    if (elapsed >= nextReport) { console.log(`Soak ${Math.round(elapsed / 1000)}s: ${value.status.frameCount - startFrame} frames; session healthy, output disabled.`); nextReport += 60_000 }
    await delay(100)
  }
  sampleMemory(performance.now() - startTime)
  assert.ok(last.status.frameCount - startFrame > 100, 'Playback must continue without browser ticks')
  const quantile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)]
  console.log(JSON.stringify({ elapsedSeconds: (performance.now() - startTime) / 1000, frames: last.status.frameCount - startFrame, cueCount, httpRequests: latencies.length,
    httpLatencyMs: { median: quantile(latencies, .5), p95: quantile(latencies, .95), max: Math.max(...latencies) },
    observedCadenceHz: { median: quantile(cadence, .5), p05: quantile(cadence, .05) }, memory, physicalOutput: false }, null, 2))
} finally {
  if (sessionId) await command({ command: 'stop' })
  assert.equal((await request('/health')).armed, false)
  if (sessionId) assert.equal((await request('/playback/status')).status, 'stopped')
  console.log('Owned session stopped; hardware remained unarmed.')
}
