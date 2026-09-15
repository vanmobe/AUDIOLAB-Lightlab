import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { initialShow } from '../src/seed.ts'

// Memory-only acceptance. Only seed data is imported; reference evaluation uses the built worker.
const base = 'http://127.0.0.1:5188'
const deadline = Date.now() + 20_000
async function request(path, body) {
  const remaining = deadline - Date.now()
  assert.ok(remaining > 0, 'Acceptance deadline exceeded')
  const response = await fetch(base + path, {
    signal: AbortSignal.timeout(Math.min(remaining, 3000)),
    ...(body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  assert.equal(response.status, 200, `Unexpected response for ${path}`)
  return response.json()
}
assert.equal((await request('/health')).armed, false, 'Do not test while hardware is armed')
assert.ok(
  ['idle', 'stopped', 'faulted'].includes((await request('/playback/status')).status),
  'Do not touch an active session',
)
const show = structuredClone(initialShow)
show.regie = {
  minimumCoverage: { percent: 80, threshold: 0.1 },
  colorRoles: ['primary', 'accent', 'secondary', 'white'],
  safetyGroupIds: ['wash'],
}
show.groups.forEach((group) => {
  group.intensity = group.id === 'effects' ? 0 : 1
})
show.colorProfiles.forEach((profile) => {
  profile.intensityLimit = 1
})
show.programs[0].pattern = {
  version: 1,
  floor: 0,
  steps: [{ selection: 'all', direction: 'forward', envelope: 'hold', width: 1, trail: 0, level: 0, weight: 1 }],
}
show.looks[0].layers = show.groups.map((group) => ({
  groupId: group.id,
  mode: group.id === 'effects' ? 'off' : 'animation',
  programId: group.id === 'effects' ? null : show.programs[0].id,
  colorProfileId: null,
  intensity: 1,
  rateBeats: 1,
  offsetBeats: 0,
}))
show.activeLookId = show.looks[0].id
let sessionId
const command = (value) => request('/playback/command', { version: 1, sessionId, ...value })
const preview = () => request(`/playback/preview?sessionId=${encodeURIComponent(sessionId)}`)
const points = (frame) =>
  frame.fixtures.filter((light) => light.fixtureId !== 'hazer-1').flatMap((light) => light.segments ?? [light])
const lit = (frame) => points(frame).filter((light) => light.intensity >= 0.1 && light.color !== '#000000').length
function reference(value) {
  const messages = [
    { version: 1, requestId: 'load', op: 'load', show },
    {
      version: 1,
      requestId: 'eval',
      op: 'evaluate',
      atBeats: value.frame.atBeats,
      state: { mode: value.frame.mode, activeLookId: value.status.lookId },
      live: { controls: value.controls, groupIntensities: value.groupIntensities, colorLockId: value.colorLockId },
    },
  ]
  const child = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../runtime-worker/dist/engine.mjs', import.meta.url))],
    {
      input: messages.map((message) => JSON.stringify(message)).join('\n') + '\n',
      encoding: 'utf8',
      timeout: 3000,
      maxBuffer: 1_000_000,
    },
  )
  assert.equal(child.status, 0, 'Built reference worker failed')
  const replies = child.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  assert.equal(replies[1].ok, true)
  const normalized = structuredClone(value.frame)
  normalized.fixtures.forEach((light) => {
    if (light.segments === null) delete light.segments
  })
  assert.deepEqual(normalized, replies[1].frame, 'Real companion frame must match the built shared worker exactly')
}
try {
  const started = await request('/playback/start', { version: 1, show, bpm: 120, lookId: show.activeLookId })
  sessionId = started.sessionId
  assert.equal(started.status, 'running')
  assert.equal(started.outputSent, false)
  const playing = await preview()
  assert.equal(points(playing.frame).length, 24)
  assert.equal(lit(playing.frame), Math.ceil(24 * 0.8), 'Dark pattern corrected to exactly twenty lit points')
  reference(playing)
  const colors = new Set(points(playing.frame).map((light) => light.color))
  for (const role of show.regie.colorRoles)
    assert.ok(
      colors.has(show.colorProfiles.find((profile) => profile.id === show.looks[0].colorProfileId)[role]),
      `Missing active color role ${role}`,
    )
  for (const light of playing.frame.fixtures.filter((light) => light.fixtureId.startsWith('front-')))
    assert.equal(light.color, '#fff1d6')
  await command({ command: 'mode', mode: 'safety' })
  const safe = await preview()
  reference(safe)
  for (const light of safe.frame.fixtures) {
    const group = show.fixtures.find((fixture) => fixture.id === light.fixtureId).groupId
    assert.equal(light.intensity, group === 'wash' ? 0.8 : 0)
  }
  await command({ command: 'mode', mode: 'blackout' })
  const black = await preview()
  reference(black)
  assert.ok(black.frame.fixtures.every((light) => light.intensity === 0 && light.haze === 0))
  await command({ command: 'mode', mode: 'automation' })
  const current = await preview()
  await command({
    command: 'live',
    expectedRevision: current.revision,
    controls: { overrides: { back: { mode: 'off' } }, links: [] },
    groupIntensities: current.groupIntensities,
    colorLockId: null,
  })
  const off = await preview()
  reference(off)
  assert.ok(lit(off.frame) < Math.ceil(24 * 0.8), 'Hard-off group makes requested coverage unattainable')
  for (const light of off.frame.fixtures.filter(
    (light) => show.fixtures.find((fixture) => fixture.id === light.fixtureId).groupId === 'back',
  ))
    assert.equal(light.intensity, 0)
  console.log(
    'Real companion regie passed: 20/24 points, four roles, fixed warm white, custom wash safety, blackout, hard-off shortfall and exact built-worker parity. Memory only.',
  )
} finally {
  if (sessionId) {
    // Cleanup has its own small deadline, even when the acceptance deadline expired.
    const response = await fetch(base + '/playback/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: 1, sessionId, command: 'stop' }),
      signal: AbortSignal.timeout(3000),
    })
    assert.equal(response.status, 200, 'Could not stop the owned test session')
  }
  const response = await fetch(base + '/health', { signal: AbortSignal.timeout(3000) })
  assert.equal((await response.json()).armed, false)
}
