import { afterEach, expect, it, vi } from 'vitest'
import { launcherUnavailable, parseLocalRuntimeStatus, requestLocalRuntime } from './local-runtime-client'

const status = {
  version: 1,
  state: 'stopped',
  canStart: true,
  message: 'Gestopt.',
  logs: [{ id: 1, time: '2026-09-15T10:00:00Z', level: 'info', message: 'Starter actief.' }],
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('validates bounded authored status and rejects malformed or contradictory data', () => {
  expect(parseLocalRuntimeStatus(status)).toEqual(status)
  for (const malformed of [
    null,
    { ...status, version: 2 },
    { ...status, state: 'running' },
    { ...status, logs: [...status.logs, ...status.logs] },
    { ...status, logs: Array(201).fill(status.logs[0]) },
    { ...status, message: 'x'.repeat(2049) },
    { ...status, message: '\u001b[31m' },
    { ...status, logs: [{ ...status.logs[0], time: 'bad date' }] },
    { ...status, logs: [{ ...status.logs[0], level: 'debug' }] },
  ])
    expect(() => parseLocalRuntimeStatus(malformed)).toThrow()
})

it('uses a readonly same-origin check and an explicit header-protected start without a body', async () => {
  const fetcher = vi.fn(
    async (_url: string, _options: RequestInit) =>
      new Response(JSON.stringify(status), { headers: { 'content-type': 'application/json' } }),
  )
  vi.stubGlobal('fetch', fetcher)
  await requestLocalRuntime(false, new AbortController().signal)
  expect(fetcher).toHaveBeenLastCalledWith(
    '/__lightlab/runtime',
    expect.objectContaining({ method: 'GET', redirect: 'error' }),
  )
  await requestLocalRuntime(true, new AbortController().signal)
  expect(fetcher).toHaveBeenLastCalledWith(
    '/__lightlab/runtime/start',
    expect.objectContaining({ method: 'POST', headers: { 'X-Lightlab-Action': 'start' } }),
  )
  expect(fetcher.mock.calls[1][1]).not.toHaveProperty('body')
  await requestLocalRuntime('stop', new AbortController().signal)
  expect(fetcher).toHaveBeenLastCalledWith(
    '/__lightlab/runtime/stop',
    expect.objectContaining({ method: 'POST', headers: { 'X-Lightlab-Action': 'stop' } }),
  )
  expect(fetcher.mock.calls[2][1]).not.toHaveProperty('body')
})

it('accepts optional lifecycle metadata and rejects contradictory stop capabilities', () => {
  const current = {
    ...status,
    canStart: false,
    state: 'running',
    canStop: true,
    stopping: false,
    startedAt: '2026-09-15T10:00:00Z',
    launchMode: 'development',
    buildMessage: 'Start bouwt broncode.',
  }
  expect(parseLocalRuntimeStatus(current)).toEqual(current)
  for (const malformed of [
    { ...current, canStop: 'true' },
    { ...current, stopping: 'false' },
    { ...current, stopping: true },
    { ...current, state: 'external' },
    { ...current, startedAt: 'bad date' },
    { ...current, launchMode: 'fresh' },
    { ...current, buildMessage: 'x'.repeat(2049) },
  ])
    expect(() => parseLocalRuntimeStatus(malformed)).toThrow()
  expect(parseLocalRuntimeStatus(status).canStop ?? false).toBe(false)
})

it('explains old/static hosts and rejects oversized streamed replies before parsing', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('<html>Vite fallback</html>', { headers: { 'content-type': 'text/html' } })),
  )
  await expect(requestLocalRuntime(false, new AbortController().signal)).rejects.toThrow(launcherUnavailable)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(' '.repeat(128 * 1024 + 1), { headers: { 'content-type': 'application/json' } })),
  )
  await expect(requestLocalRuntime(false, new AbortController().signal)).rejects.toThrow('ongeldig')
})

it('bounds status and start deadlines without retrying a start', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn(
    (_url: string, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }),
  )
  vi.stubGlobal('fetch', fetcher)
  const check = expect(requestLocalRuntime(false, new AbortController().signal)).rejects.toThrow('duurde te lang')
  await vi.advanceTimersByTimeAsync(3000)
  await check
  const start = expect(requestLocalRuntime(true, new AbortController().signal)).rejects.toThrow('kan nog starten')
  await vi.advanceTimersByTimeAsync(5000)
  await start
  const stop = expect(requestLocalRuntime('stop', new AbortController().signal)).rejects.toThrow('kan nog draaien')
  await vi.advanceTimersByTimeAsync(5000)
  await stop
  expect(fetcher).toHaveBeenCalledTimes(3)
})
