import { afterEach, expect, it, vi } from 'vitest'
import { commandPlayback, getPlaybackStatus, parsePlaybackStatus, PlaybackConflict, preparePlaybackSnapshot, startPlayback } from './playback-client'
import { initialShow } from './seed'

const status = () => ({ version: 1, sessionId: 'session-1', status: 'running', mode: 'automation', lookId: initialShow.activeLookId, bpm: 120, atBeats: 3, frameCount: 10, universeCount: 1, outputSent: false, error: null })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it('strictly validates phase, counters, status enums and output flag', () => {
  expect(parsePlaybackStatus(status()).atBeats).toBe(3)
  expect(parsePlaybackStatus({ ...status(), outputSent: true }).outputSent).toBe(true)
  for (const change of [{ atBeats: -1 }, { atBeats: Infinity }, { frameCount: .5 }, { universeCount: 257 }, { outputSent: 'true' }, { mode: ['automation'] }, { status: 'unknown' }, { sessionId: null }, { error: 'x'.repeat(4097) }]) expect(() => parsePlaybackStatus({ ...status(), ...change })).toThrow()
  expect(parsePlaybackStatus({ ...status(), status: 'idle', sessionId: null, lookId: null })).toMatchObject({ status: 'idle' })
})
it('uses only explicit playback routes with bounded snapshot and session commands', async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(status()))); vi.stubGlobal('fetch', fetch)
  const signal = new AbortController().signal
  await getPlaybackStatus(signal)
  await startPlayback(initialShow, initialShow.activeLookId, 120, signal)
  await commandPlayback('session-1', { command: 'mode', mode: 'blackout' }, signal)
  expect(fetch.mock.calls.map(call => call[0])).toEqual(['http://127.0.0.1:5188/playback/status', 'http://127.0.0.1:5188/playback/start', 'http://127.0.0.1:5188/playback/command'])
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ version: 1, show: initialShow, lookId: initialShow.activeLookId, bpm: 120 })
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ version: 1, sessionId: 'session-1', command: 'mode', mode: 'blackout' })
})
it('never retries conflicting mutations and rejects mismatched session replies', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('', { status: 409 })); vi.stubGlobal('fetch', fetch)
  await expect(commandPlayback('session-1', { command: 'stop' }, new AbortController().signal)).rejects.toBeInstanceOf(PlaybackConflict)
  expect(fetch).toHaveBeenCalledOnce()
  fetch.mockResolvedValue(new Response(JSON.stringify({ ...status(), sessionId: 'new-session' })))
  await expect(commandPlayback('session-1', { command: 'stop' }, new AbortController().signal)).rejects.toBeInstanceOf(PlaybackConflict)
})
it('bounds streamed status before parsing and explains old runtime failure', async () => {
  const cancel = vi.fn()
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65_537)) }, cancel })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)))
  await expect(getPlaybackStatus(new AbortController().signal)).rejects.toThrow('Ongeldig antwoord')
  expect(cancel).toHaveBeenCalledOnce()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
  await expect(getPlaybackStatus(new AbortController().signal)).rejects.toThrow('bijgewerkte runtime')
})
it('rejects oversized snapshots and invalid tempo without network writes', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  expect(() => startPlayback(initialShow, initialShow.activeLookId, 0, new AbortController().signal)).toThrow()
  const show = { ...initialShow, diagnosticPadding: 'x'.repeat(2 * 1024 * 1024) }
  await expect(startPlayback(show, show.activeLookId, 120, new AbortController().signal)).rejects.toThrow('2 MiB')
  expect(fetch).not.toHaveBeenCalled()
})
it('bounds request duration and warns that a timed-out mutation may have executed', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('abort'))))))
  const failed = expect(commandPlayback('session-1', { command: 'stop' }, new AbortController().signal)).rejects.toThrow('opdracht kan wel ontvangen zijn')
  await vi.advanceTimersByTimeAsync(10_000); await failed
})

it('prepares a detached frozen snapshot and validates the entire start envelope before any request', () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  const original = structuredClone(initialShow)
  const prepared = preparePlaybackSnapshot(original, 120)
  expect(prepared).toEqual(original); expect(prepared).not.toBe(original)
  expect(Object.isFrozen(prepared)).toBe(true); expect(Object.isFrozen(prepared.looks[0])).toBe(true)
  original.looks[0].name = 'Later edit'
  expect(prepared.looks[0].name).not.toBe('Later edit')
  for (const bpm of [NaN, 29, 241]) expect(() => preparePlaybackSnapshot(initialShow, bpm)).toThrow()
  expect(() => preparePlaybackSnapshot({ ...initialShow, activeLookId: 'missing' }, 120)).toThrow()
  expect(() => preparePlaybackSnapshot({ ...initialShow, diagnosticPadding: 'x'.repeat(2 * 1024 * 1024) } as typeof initialShow, 120)).toThrow('2 MiB')
  expect(fetch).not.toHaveBeenCalled()
})
