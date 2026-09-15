import { afterEach, expect, it, vi } from 'vitest'
import { getOutputStatus, parseOutputStatus, setOutputState } from './playback-output-client'

const status = {
  version: 1,
  sessionId: 'session',
  state: 'disarmed',
  routes: [{ universe: 1, protocol: 'artnet', host: '127.0.0.1' }],
  framesSent: 0,
  lastError: null,
  armError: null,
}
afterEach(() => vi.unstubAllGlobals())
it('bounds output status and rejects malformed or stale state instead of showing output off', () => {
  expect(parseOutputStatus(status, 'session').state).toBe('disarmed')
  for (const change of [
    { state: 'off' },
    { framesSent: -0.1 },
    { framesSent: Infinity },
    { lastError: {} },
    { armError: 'x'.repeat(4097) },
    { routes: [...status.routes, ...status.routes] },
    { routes: [{ ...status.routes[0], universe: 32769 }] },
    { state: 'armed', routes: [] },
  ])
    expect(() => parseOutputStatus({ ...status, ...change }, 'session')).toThrow()
  expect(() => parseOutputStatus(status, 'other')).toThrow('andere runtimesessie')
})
it('never arms implicitly or without confirmation; explicit commands are session-fenced', async () => {
  const fetch = vi.fn().mockImplementation(async () => Response.json(status))
  vi.stubGlobal('fetch', fetch)
  const signal = new AbortController().signal
  await getOutputStatus('session', signal)
  expect(fetch.mock.calls[0][1].method).toBe('GET')
  await expect(setOutputState('session', 'arm', false, signal)).rejects.toThrow('Bevestig')
  expect(fetch).toHaveBeenCalledTimes(1)
  await setOutputState('session', 'arm', true, signal)
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    version: 1,
    sessionId: 'session',
    command: 'arm',
    confirmed: true,
  })
  await setOutputState('session', 'disarm', false, signal)
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ version: 1, sessionId: 'session', command: 'disarm' })
})
it('bounds responses and never retries an ambiguous physical-output request', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('', { status: 409 }))
  vi.stubGlobal('fetch', fetch)
  await expect(setOutputState('session', 'arm', true, new AbortController().signal)).rejects.toThrow('niet herhaald')
  expect(fetch).toHaveBeenCalledOnce()
  fetch.mockResolvedValue(new Response('x'.repeat(131073)))
  await expect(getOutputStatus('session', new AbortController().signal)).rejects.toThrow('Ongeldig')
})
