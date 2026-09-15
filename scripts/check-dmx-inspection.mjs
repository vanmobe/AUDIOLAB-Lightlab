import assert from 'node:assert/strict'
import http from 'node:http'

// Golden wire-contract checks against a running local runtime. Never arm or send a DMX frame.
const base = new URL(process.argv[2] ?? 'http://127.0.0.1:5188')
assert.equal(base.protocol, 'http:')
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Use an isolated loopback runtime')
const endpoint = new URL('/output/inspect', base)
const health = async () => {
  const response = await fetch(new URL('/health', base))
  assert.equal(response.status, 200)
  return response.json()
}
const post = async (body, contentType = 'application/json') => fetch(endpoint, {
  method: 'POST', headers: { 'content-type': contentType }, body,
})
const inspect = async request => {
  const response = await post(JSON.stringify(request))
  assert.equal(response.status, 200, await response.clone().text())
  const result = await response.json()
  assert.equal(result.requestId, request.requestId)
  assert.equal(result.dryRun, true)
  assert.equal(result.outputSent, false)
  return result
}
const fixture = (id, profileId, modeId, universe, address) => ({ id, profileId, modeId, patch: { universe, address } })
const frame = (fixtureId, extra = {}) => ({ fixtureId, intensity: .5, color: '#804020', haze: 0, ...extra })
const request = {
  version: 1, requestId: 'http-golden-six-personalities',
  patch: {
    fixtures: [
      fixture('adj4', 'adj-mega-tripar-profile-plus', '4ch', 1, 1),
      fixture('adj6', 'adj-mega-tripar-profile-plus', '6ch', 1, 11),
      fixture('tri3', 'stairville-stage-tri', '3ch', 1, 21),
      fixture('tri14', 'stairville-stage-tri', '14ch', 1, 31),
      fixture('white', 'varytec-theater-spot-100', '2ch', 2, 511),
      fixture('haze', 'stairville-hz-200', '2ch', 2, 1),
    ],
    routes: [
      { id: 'configured-only', universe: 1, protocol: 'artnet', host: '127.0.0.1', enabled: true },
      { id: 'unfinished-disabled', universe: 2, protocol: 'sacn', host: '', enabled: false },
    ],
  },
  frame: { atBeats: 100.25, mode: 'automation', fixtures: [
    frame('adj4'), frame('adj6'), frame('tri3'),
    frame('tri14', { segments: [
      { intensity: 1, color: '#ff0000' }, { intensity: .5, color: '#00ff00' },
      { intensity: .25, color: '#0000ff' }, { intensity: 0, color: '#ffffff' },
    ] }),
    frame('white', { color: '#0000ff' }), frame('haze', { haze: .25 }),
  ] },
}
// Independently transcribed from docs/FIXTURE_CHANNEL_SOURCES.md, not copied from encoder output.
const golden = {
  adj4: [64, 32, 16, 0], adj6: [128, 64, 32, 0, 32, 128], tri3: [64, 32, 16],
  tri14: [255, 0, 0, 0, 128, 0, 0, 0, 64, 0, 0, 0, 0, 255],
  white: [128, 0], haze: [64, 0],
}
const reject = async (changed, code) => {
  const result = await inspect(changed)
  assert.deepEqual(result.universes, [], 'Errors must not expose a partially compiled output')
  assert.ok(result.issues.some(issue => issue.severity === 'error' && issue.code === code), JSON.stringify(result.issues))
}
const chunkedOversize = () => new Promise((resolve, rejectPromise) => {
  const pending = http.request(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' } }, response => {
    response.resume()
    response.on('end', () => resolve(response.statusCode))
  })
  pending.on('error', rejectPromise)
  for (let i = 0; i < 65; i++) pending.write(' '.repeat(16384))
  pending.end()
})

assert.equal((await health()).armed, false, 'Do not run against an armed runtime')
try {
  const initial = await inspect(request)
  assert.ok(!initial.issues.some(issue => issue.severity === 'error'), JSON.stringify(initial.issues))
  assert.equal(initial.universes.length, 2)
  for (const universe of initial.universes) {
    const expected = Array(512).fill(0)
    for (const row of universe.fixtures) {
      assert.deepEqual(row.channels, golden[row.fixtureId], row.fixtureId)
      assert.equal(row.channelLabels.length, row.channels.length)
      expected.splice(row.address - 1, row.channels.length, ...row.channels)
    }
    assert.deepEqual(universe.channels, expected, 'Unpatched channels must remain zero')
  }
  assert.deepEqual(initial.universes.map(universe => universe.routeEnabled), [true, false])
  // Recipe evaluation emits one segment even for a single-head PAR or grouped personality.
  const singleHeads = structuredClone(request)
  for (const id of ['adj4', 'adj6', 'tri3', 'white']) {
    const output = singleHeads.frame.fixtures.find(fixture => fixture.fixtureId === id)
    output.segments = [{ intensity: output.intensity, color: output.color }]
  }
  assert.deepEqual((await inspect(singleHeads)).universes, initial.universes, 'Engine single-head recipe frames must encode normally')
  const black = await inspect({ ...request, frame: { ...request.frame, mode: 'blackout' } })
  assert.ok(black.universes.every(universe => universe.channels.every(value => value === 0)))
  assert.deepEqual((await inspect(request)).universes, initial.universes, 'No retained blackout or channel drift')

  const overlap = structuredClone(request)
  overlap.patch.fixtures[1].patch.address = 4
  await reject(overlap, 'patch-overlap')
  const legacy = structuredClone(request)
  legacy.patch.fixtures[5].modeId = '1ch'
  await reject(legacy, 'unsupported-mode')
  const missing = structuredClone(request)
  delete missing.version
  for (const malformed of [JSON.stringify(missing), JSON.stringify({ ...request, unexpected: true }), 'null']) {
    assert.equal((await post(malformed)).status, 400)
  }
  assert.equal((await post(JSON.stringify(request), 'text/plain')).status, 415)
  assert.equal((await post(' '.repeat(1024 * 1024 + 1))).status, 413)
  assert.equal(await chunkedOversize(), 413)
  console.log('DMX HTTP checks passed: six golden maps, two universes, disabled empty route, atomic failures, blackout, repeatability, strict JSON, 415/413 and chunked limit; no output sent.')
} finally {
  assert.equal((await health()).armed, false, 'Inspection must never arm hardware output')
}
