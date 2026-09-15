import { describe, expect, it } from 'vitest'
import { readAiResponse, type AiSignal } from './ai-progress'

function stream(text: string, step = 7) {
  const bytes = new TextEncoder().encode(text)
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += step) controller.enqueue(bytes.slice(i, i + step))
        controller.close()
      },
    }),
    { headers: { 'content-type': 'application/x-ndjson' } },
  )
}
const terminal = JSON.stringify({ type: 'result', result: { summary: 'klaar' } })
describe('AI progress transport', () => {
  it('accepts the actual backend nullable phase-event shape', async () => {
    const events: AiSignal[] = []
    await readAiResponse(
      stream(
        '{"type":"progress","phase":"waiting","attempt":1,"thinking":null,"content":null,"clipped":false}\n' + terminal,
      ),
      new AbortController().signal,
      (e) => events.push(e),
    )
    expect(events[0]).toMatchObject({ phase: 'waiting', thinking: undefined, content: undefined })
  })
  it('decodes split UTF-8 and delivers signals before the terminal result', async () => {
    const events: AiSignal[] = []
    const response = stream(
      JSON.stringify({ type: 'progress', phase: 'thinking', attempt: 1, thinking: 'Licht 💡' }) +
        '\n{"type":"heartbeat"}\n' +
        terminal,
      1,
    )
    expect(await readAiResponse(response, new AbortController().signal, (e) => events.push(e))).toEqual({
      summary: 'klaar',
    })
    expect(events).toEqual([
      { type: 'progress', phase: 'thinking', attempt: 1, thinking: 'Licht 💡', content: undefined, clipped: false },
      { type: 'heartbeat' },
    ])
  })
  it('supports legacy JSON responses', async () => {
    expect(await readAiResponse(new Response('{"error":"bad field"}'), new AbortController().signal, () => {})).toEqual(
      { error: 'bad field' },
    )
  })
  it('returns terminal errors even on HTTP 200', async () => {
    expect(
      await readAiResponse(stream('{"type":"error","error":"model failed"}\n'), new AbortController().signal, () => {}),
    ).toMatchObject({ error: 'model failed' })
  })
  it.each(['{"type":"heartbeat"}\n', '', '{"type":"progress","phase":"fake","attempt":1}\n', '{broken}\n'])(
    'rejects incomplete or malformed streams: %s',
    async (text) => {
      await expect(readAiResponse(stream(text), new AbortController().signal, () => {})).rejects.toThrow()
    },
  )
  it('caps preview text across messages', async () => {
    const line = JSON.stringify({ type: 'progress', phase: 'generating', attempt: 1, content: 'a'.repeat(17000) })
    await expect(
      readAiResponse(stream(line + '\n' + line + '\n' + terminal, 4096), new AbortController().signal, () => {}),
    ).rejects.toThrow('te veel tekst')
  })
  it('cancels a stalled reader without a terminal event', async () => {
    const abort = new AbortController()
    let cancelled = false
    const response = new Response(
      new ReadableStream({
        cancel() {
          cancelled = true
        },
      }),
      { headers: { 'content-type': 'application/x-ndjson' } },
    )
    const reading = readAiResponse(response, abort.signal, () => {})
    abort.abort()
    await expect(reading).rejects.toThrow()
    expect(cancelled).toBe(true)
  })
})
