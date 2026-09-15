// Explicit real local-model acceptance. Run only when no other generation is active.
// node --experimental-strip-types scripts/check-ollama-timeout.mjs
import assert from 'node:assert/strict'
import { initialShow } from '../src/seed.ts'

const show = structuredClone(initialShow)
show.regie = {
  minimumCoverage: { percent: 80, threshold: 0.1 },
  colorRoles: ['primary', 'accent', 'secondary', 'white'],
  safetyGroupIds: ['front'],
}
const payload = {
  intent:
    'Maak precies één warm aards kleurprofiel voor een rustige akoestische folkband: koperen hoofdkleur, zachte groene accentkleur, amber subkleur en warmwit. Geen animaties of Looks. Leg de vier gekozen kleuren kort uit in het Nederlands.',
  options: { scope: 'colorProfiles', profileCount: 1, programCount: 0, lookCount: 0, revision: false, replace: false },
  show,
  model: 'gpt-oss:20b',
  includeTrace: true,
  ollamaTimeoutMinutes: 15,
}
const started = performance.now()
const progress = setInterval(
  () =>
    console.log(
      JSON.stringify({ waitingSeconds: Math.round((performance.now() - started) / 1000), model: payload.model }),
    ),
  30000,
)
try {
  const response = await fetch('http://127.0.0.1:5188/ai/propose', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(920000),
  })
  const reader = response.body.getReader(),
    chunks = []
  let length = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.length
    if (length > 6 * 1024 * 1024) {
      await reader.cancel()
      throw new Error('Response exceeded bound')
    }
    chunks.push(value)
  }
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const trace = result.trace
  const summary = {
    httpStatus: response.status,
    elapsedSeconds: Math.round((performance.now() - started) / 1000),
    model: payload.model,
    timeoutMinutes: payload.ollamaTimeoutMinutes,
    attempts: trace?.attempts?.length ?? 0,
    traceTruncated: trace?.truncated,
    requestCharacters: trace?.attempts?.[0]?.requestBody.length,
    responseCharacters: trace?.attempts?.[0]?.responseBody?.length ?? 0,
    profiles: result.colorProfiles?.length ?? 0,
    error: result.error ?? null,
  }
  console.log(JSON.stringify(summary, null, 2))
  assert.equal(response.status, 200, 'Real model must produce a valid proposal')
  assert.equal(result.colorProfiles.length, 1)
  assert.equal(result.programs.length, 0)
  assert.equal(result.looks.length, 0)
  assert.equal(trace.provider, 'ollama')
  assert.equal(trace.model, payload.model)
  assert.equal(trace.attempts.length, 1)
  const actual = JSON.parse(trace.attempts[0].requestBody)
  assert.equal(actual.model, payload.model)
  assert.equal(actual.options.num_predict, 4096)
  assert.ok(!actual.messages[0].content.includes('Schema:'))
  const context = JSON.parse(actual.messages[1].content).context
  assert.equal(context.regie.minimumCoverage.percent, 80)
  assert.equal(context.regie.colorRoles.length, 4)
  assert.ok(trace.attempts[0].responseBody)
  console.log('PASS: one real local request; no acceptance, persistence or output calls.')
} finally {
  clearInterval(progress)
}
