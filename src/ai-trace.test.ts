import { describe, expect, it } from 'vitest'
import { parseAiTrace, readDesignResponse } from './ai-trace'
describe('bounded AI diagnostics', () => {
  const trace = {
    version: 1,
    provider: 'ollama',
    model: null,
    truncated: false,
    attempts: [
      {
        requestBody: '<script>not HTML</script>',
        responseBody: null,
        responseStatus: null,
        requestTruncated: false,
        responseTruncated: false,
        redacted: false,
      },
    ],
  }
  it('preserves raw strings and rejects malformed or excessive captures', () => {
    expect(parseAiTrace(trace)).toEqual(trace)
    expect(
      parseAiTrace({
        ...trace,
        secret: 'discard',
        attempts: [{ ...trace.attempts[0], unchecked: 'discard', responseTruncated: true }],
      }),
    ).toEqual({ ...trace, truncated: true, attempts: [{ ...trace.attempts[0], responseTruncated: true }] })
    expect(
      parseAiTrace({ ...trace, attempts: [...trace.attempts, ...trace.attempts, ...trace.attempts] }),
    ).toBeUndefined()
    expect(
      parseAiTrace({ ...trace, attempts: [{ ...trace.attempts[0], requestBody: 'x'.repeat(131073) }] }),
    ).toBeUndefined()
  })
  it('reads bounded errors and refuses oversized bodies before parsing', async () => {
    expect(await readDesignResponse(Response.json({ error: 'No result', trace }))).toEqual({
      error: 'No result',
      trace,
    })
    await expect(readDesignResponse(new Response('x'.repeat(6 * 1024 * 1024 + 1)))).rejects.toThrow('te groot')
    await expect(readDesignResponse(Response.json(null))).rejects.toThrow('Ongeldig')
  })
})
