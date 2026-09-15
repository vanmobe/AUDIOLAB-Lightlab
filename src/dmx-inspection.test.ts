import { afterEach, describe, expect, it, vi } from 'vitest'
import { inspectDmx, inspectionRequest, parseInspection } from './dmx-inspection'
import { initialShow } from './seed'
import { evaluateFrame } from './domain'
import { fixtureProfiles } from './fixtures'

const body = () => inspectionRequest(initialShow, initialShow.activeLookId, 'automation', 2, 'test')
const response = () => ({ version: 1, requestId: 'test', catalogVersion: 'test-catalog', dryRun: true, outputSent: false, issues: [], universes: [{ universe: 1, protocol: 'artnet', routeEnabled: false, channels: [0, 1, 2, 3, ...Array(508).fill(0)], fixtures: [{ fixtureId: 'adj-1', address: 1, channels: [0, 1, 2, 3], channelLabels: ['R', 'G', 'B', 'Dimmer'] }] }] })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('stateless DMX inspection contract', () => {
  it('sends only patch and actual evaluated output, not creative/context/presentation data', () => {
    const request = body()
    expect(Object.keys(request)).toEqual(['version', 'requestId', 'patch', 'frame'])
    expect(Object.keys(request.patch.fixtures[0])).toEqual(['id', 'profileId', 'modeId', 'patch'])
    expect(request.frame).toEqual(evaluateFrame(initialShow, fixtureProfiles, { mode: 'automation', activeLookId: initialShow.activeLookId }, 2))
    expect(request).not.toHaveProperty('camera')
    const show = structuredClone(initialShow); delete show.fixtures[0].patch
    expect(inspectionRequest(show, show.activeLookId, 'blackout', 0, 'test').patch.fixtures[0].patch).toBeNull()
    expect(inspectionRequest(show, show.activeLookId, 'blackout', 0, 'test').frame.fixtures.every(fixture => fixture.intensity === 0)).toBe(true)
  })
  it.each([-1, 65, NaN, Infinity])('rejects invalid beat %s before network evaluation', beat => {
    expect(() => inspectionRequest(initialShow, initialShow.activeLookId, 'automation', beat, 'test')).toThrow()
  })
  it('accepts bounded data and rejects unsafe or mismatched response fields', () => {
    expect(parseInspection(response(), 'test').universes[0].fixtures[0].channels).toEqual([0, 1, 2, 3])
    for (const change of [{ outputSent: true }, { dryRun: false }, { requestId: 'stale' }, { issues: [{ severity: 'error', code: 'patch', message: 'Fix patch' }] }, { issuesTruncated: 'yes' }]) expect(() => parseInspection({ ...response(), ...change }, 'test')).toThrow()
    for (const value of [-1, 256, .5, NaN]) {
      const bad = response(); bad.universes[0].channels[0] = value
      expect(() => parseInspection(bad, 'test')).toThrow()
    }
    const mismatched = response(); mismatched.universes[0].fixtures[0].channelLabels = []
    expect(() => parseInspection(mismatched, 'test')).toThrow()
    const byteMismatch = response(); byteMismatch.universes[0].fixtures[0].channels[1] = 99
    expect(() => parseInspection(byteMismatch, 'test')).toThrow()
    const overlap = response(); overlap.universes[0].fixtures.push({ ...overlap.universes[0].fixtures[0], fixtureId: 'another' })
    expect(() => parseInspection(overlap, 'test')).toThrow()
    expect(parseInspection({ ...response(), issues: [{ severity: 'warning', code: 'unverified-personality', message: 'Not physically checked', fixtureId: null }] }, 'test').issues[0].fixtureId).toBeUndefined()
    expect(() => parseInspection({ ...response(), universes: Array(257).fill(response().universes[0]) }, 'test')).toThrow()
  })
  it('calls only the inspect endpoint and validates success', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(response())))); vi.stubGlobal('fetch', fetch)
    expect((await inspectDmx(body(), new AbortController().signal)).outputSent).toBe(false)
    expect(fetch.mock.calls[0][0]).toBe('http://127.0.0.1:5188/output/inspect')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(body())
  })
  it('explains disconnected and old runtimes without exposing their response bodies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('private detail')))
    await expect(inspectDmx(body(), new AbortController().signal)).rejects.toThrow('Runtime niet bereikbaar')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await expect(inspectDmx(body(), new AbortController().signal)).rejects.toThrow('bijgewerkte runtime')
  })
  it('rejects excessive declared and streamed bodies before JSON parsing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { headers: { 'content-length': String(4 * 1024 * 1024) } })))
    await expect(inspectDmx(body(), new AbortController().signal)).rejects.toThrow('Ongeldig antwoord')
    const cancel = vi.fn()
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(3 * 1024 * 1024 + 1)) }, cancel })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)))
    await expect(inspectDmx(body(), new AbortController().signal)).rejects.toThrow('Ongeldig antwoord')
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('times out after ten seconds and forwards explicit cancellation', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))))))
    const timeout = expect(inspectDmx(body(), new AbortController().signal)).rejects.toThrow('10 seconden')
    await vi.advanceTimersByTimeAsync(10_000); await timeout
    const cancel = new AbortController()
    const pending = expect(inspectDmx(body(), cancel.signal)).rejects.toThrow('geannuleerd')
    cancel.abort(); await pending
  })
})
