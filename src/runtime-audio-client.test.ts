import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeAudioLink, parseRuntimeAudioStatus, sendRuntimeAudio } from './runtime-audio-client'
import type { AudioLiveSnapshot } from './audio-live'

const audio: AudioLiveSnapshot = {
  seconds: 1,
  playing: true,
  analysis: { duration: 3, kicks: [{ time: 1, strength: 1 }], waveform: [0.2], bpm: 120, confidence: 1 },
  mode: 'kicks',
  bpm: 120,
  reactions: { wash: 'pulse' },
  decayMs: 300,
  floor: 0.2,
}
const status = (audioId: string | null, sequence = 0, state = 'following') => ({
  version: 1,
  sessionId: 'session',
  audioId,
  state,
  sequence,
  error: null,
})
afterEach(() => vi.unstubAllGlobals())
it('sends only analysis once and small media state thereafter; never sends DMX or audio bytes', async () => {
  const fetch = vi.fn().mockImplementation(async (_url, init) => {
    const body = JSON.parse(init.body)
    return Response.json(status(body.audioId, body.sequence ?? 0, body.command === 'detach' ? 'detached' : 'following'))
  })
  vi.stubGlobal('fetch', fetch)
  const id = 'a'.repeat(32),
    signal = new AbortController().signal
  await sendRuntimeAudio('session', id, 'attach', signal, audio)
  await sendRuntimeAudio('session', id, 'sync', signal, { ...audio, seconds: 1.1 }, 1)
  await sendRuntimeAudio('session', id, 'detach', signal)
  const bodies = fetch.mock.calls.map((call) => JSON.parse(call[1].body))
  expect(bodies[0].analysis.kicks).toEqual(audio.analysis.kicks)
  expect(bodies[0].analysis).not.toHaveProperty('waveform')
  expect(bodies[1]).not.toHaveProperty('analysis')
  expect(bodies[1].position.seconds).toBe(1.1)
  expect(bodies[2]).toEqual({ version: 1, sessionId: 'session', audioId: id, command: 'detach' })
  expect(fetch.mock.calls.every((call) => call[0].endsWith('/playback/audio'))).toBe(true)
})
it('rejects malformed status and stale session responses', () => {
  for (const value of [
    null,
    status(null),
    { ...status('a'.repeat(32)), sequence: -1 },
    { ...status('a'.repeat(32)), sessionId: 'other' },
    status('bad'),
  ]) {
    expect(() => parseRuntimeAudioStatus(value, 'session')).toThrow()
  }
})
it('does not connect automatically and disconnects when the loaded analysis changes', async () => {
  const send = vi
    .fn<typeof sendRuntimeAudio>()
    .mockImplementation(async (_session, id, command, _signal, _input, sequence) =>
      parseRuntimeAudioStatus(status(id, sequence ?? 0, command === 'detach' ? 'detached' : 'following'), 'session'),
    )
  const link = new RuntimeAudioLink('session', send)
  await link.sync(audio)
  expect(send).not.toHaveBeenCalled()
  await link.connect(audio)
  await link.sync({ ...audio, seconds: 1.1 })
  expect(send.mock.calls.map((call) => call[2])).toEqual(['attach', 'sync'])
  await expect(link.sync({ ...audio, analysis: { ...audio.analysis } })).rejects.toThrow('gewijzigd')
  expect(send.mock.calls.at(-1)?.[2]).toBe('detach')
  expect(link.connected).toBe(false)
})
it('never queues overlapping ticks or retries after a failed heartbeat', async () => {
  let fail!: (error: Error) => void
  const send = vi.fn<typeof sendRuntimeAudio>().mockImplementation(async (_s, id, command) => {
    if (command === 'sync')
      return new Promise((_resolve, reject) => {
        fail = reject
      })
    return parseRuntimeAudioStatus(status(id, 0, command === 'detach' ? 'detached' : 'following'), 'session')
  })
  const link = new RuntimeAudioLink('session', send)
  await link.connect(audio)
  const pending = link.sync(audio)
  await link.sync(audio)
  await link.sync(audio)
  expect(send.mock.calls.filter((call) => call[2] === 'sync')).toHaveLength(1)
  fail(new Error('Disconnected'))
  await expect(pending).rejects.toThrow()
  await link.sync(audio)
  expect(send.mock.calls.filter((call) => call[2] === 'attach')).toHaveLength(1)
  expect(link.connected).toBe(false)
})
