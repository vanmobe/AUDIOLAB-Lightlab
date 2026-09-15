import { afterEach, expect, it, vi } from 'vitest'
import { evaluateFrame } from './domain'
import { fixtureProfiles } from './fixtures'
import { initialShow } from './seed'
import {
  getRuntimePreview,
  getRuntimeShow,
  parseRuntimePreview,
  parseRuntimeShow,
  setRuntimeLive,
} from './runtime-live-client'
import { PlaybackConflict } from './playback-client'

function response() {
  const frame = evaluateFrame(
    initialShow,
    fixtureProfiles,
    { mode: 'automation', activeLookId: initialShow.activeLookId },
    2,
  )
  return {
    version: 1,
    sessionId: 'session',
    status: {
      version: 1,
      sessionId: 'session',
      status: 'running',
      mode: 'automation',
      lookId: initialShow.activeLookId,
      bpm: 120,
      atBeats: 2,
      frameCount: 50,
      universeCount: 1,
      outputSent: false,
      error: null,
    },
    frame,
    controls: { overrides: {}, links: [] },
    groupIntensities: Object.fromEntries(initialShow.groups.map((group) => [group.id, group.intensity])),
    colorLockId: null,
    revision: 3,
  }
}
afterEach(() => vi.unstubAllGlobals())
it('accepts optional transition diagnostics and rejects stale or malformed targets', () => {
  const value = response()
  const transition = {
    phase: 'queued',
    fromLookId: initialShow.looks[1].id,
    toLookId: value.status.lookId,
    startAtBeats: 4,
    endAtBeats: 8,
    progress: 0,
  }
  expect(parseRuntimePreview({ ...value, transition }, 'session', initialShow).transition).toEqual(transition)
  expect(parseRuntimePreview({ ...value, transition: null }, 'session', initialShow).transition).toBeUndefined()
  for (const delta of [{ progress: 2 }, { endAtBeats: 3 }, { toLookId: 'missing' }, { phase: 'complete' }])
    expect(() =>
      parseRuntimePreview({ ...value, transition: { ...transition, ...delta } }, 'session', initialShow),
    ).toThrow()
})
it('accepts DTO null segments and validates exact frame coverage/atomic metadata', () => {
  const value = response()
  const dto = {
    ...value,
    frame: { ...value.frame, fixtures: value.frame.fixtures.map((fixture) => ({ ...fixture, segments: null })) },
  }
  expect(parseRuntimePreview(dto, 'session', initialShow).frame).toEqual(value.frame)
  for (const frame of [
    { ...value.frame, atBeats: 1 },
    { ...value.frame, mode: 'blackout' },
    { ...value.frame, fixtures: value.frame.fixtures.slice(1) },
    { ...value.frame, fixtures: [value.frame.fixtures[0], ...value.frame.fixtures.slice(0, -1)] },
  ])
    expect(() => parseRuntimePreview({ ...value, frame }, 'session', initialShow)).toThrow()
})
it('rejects invalid references, masters, segments and revision before display', () => {
  for (const delta of [
    { revision: -1 },
    { revision: 0.5 },
    { colorLockId: 'missing' },
    { groupIntensities: {} },
    { controls: { overrides: { wash: { intensity: 2 } }, links: [] } },
    {
      controls: {
        overrides: {},
        links: [
          ['wash', 'back'],
          ['back', 'front'],
        ],
      },
    },
  ])
    expect(() => parseRuntimePreview({ ...response(), ...delta }, 'session', initialShow)).toThrow()
  const value = response()
  value.frame.fixtures[0].segments = [
    { intensity: 1, color: '#ffffff' },
    { intensity: 1, color: '#ffffff' },
  ]
  expect(() => parseRuntimePreview(value, 'session', initialShow)).toThrow()
  value.frame.fixtures[0].segments = [{ intensity: NaN, color: '#ffffff' }]
  expect(() => parseRuntimePreview(value, 'session', initialShow)).toThrow()
  expect(() => parseRuntimeShow({ version: 1, sessionId: 'different', show: initialShow }, 'session')).toThrow(
    PlaybackConflict,
  )
})
it('uses only session-fenced live endpoints and exact expected revision', async () => {
  const value = response()
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ version: 1, sessionId: 'session', show: initialShow })))
    .mockResolvedValueOnce(new Response(JSON.stringify(value)))
    .mockResolvedValueOnce(new Response(JSON.stringify(value.status)))
  vi.stubGlobal('fetch', fetch)
  const signal = new AbortController().signal
  expect(await getRuntimeShow('session', signal)).toEqual(initialShow)
  expect((await getRuntimePreview('session', initialShow, signal)).revision).toBe(3)
  await setRuntimeLive('session', 3, value, initialShow, signal)
  expect(fetch.mock.calls.map((call) => call[0])).toEqual([
    'http://127.0.0.1:5188/playback/show?sessionId=session',
    'http://127.0.0.1:5188/playback/preview?sessionId=session',
    'http://127.0.0.1:5188/playback/command',
  ])
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({
    version: 1,
    sessionId: 'session',
    command: 'live',
    expectedRevision: 3,
    controls: value.controls,
    groupIntensities: value.groupIntensities,
    colorLockId: null,
  })
})
it('bounds streaming preview data and rejects conflict without retry', async () => {
  const cancel = vi.fn(),
    stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024 + 1))
      },
      cancel,
    })
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(stream))
    .mockResolvedValueOnce(new Response('', { status: 409 }))
  vi.stubGlobal('fetch', fetch)
  await expect(getRuntimePreview('session', initialShow, new AbortController().signal)).rejects.toThrow('Ongeldig')
  expect(cancel).toHaveBeenCalledOnce()
  await expect(getRuntimePreview('session', initialShow, new AbortController().signal)).rejects.toBeInstanceOf(
    PlaybackConflict,
  )
  expect(fetch).toHaveBeenCalledTimes(2)
})
