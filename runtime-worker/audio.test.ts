import { describe, expect, it } from 'vitest'
import { createEngineProtocol } from './protocol'
import { initialShow } from '../src/seed'
import { materializeGroupTiming, type RuntimeState } from '../src/domain'
import { createAudioLivePlayer, type AudioLiveSnapshot } from '../src/audio-live'
import { defaultShowRegie } from '../src/show-regie'

const analysis = { duration: 10, kicks: [{ time: 1, strength: 1 }, { time: 2, strength: .7 }], bpm: 60, confidence: 1 }
const audio = { seconds: 1.1, playing: true, mode: 'kicks' as const, bpm: 60, reactions: { [initialShow.groups[0].id]: 'pulse' as const }, decayMs: 300, floor: .1 }
const configure = { version: 1, requestId: 'audio', op: 'audio', analysis }
describe('runtime media follower', () => {
  it('returns the same queued, fading, interrupted and held kick transitions as the browser', () => {
    const input = structuredClone(initialShow)
    input.regie = { ...defaultShowRegie(input), transition: { quantizeBeats: 2, fadeBeats: 2 } }
    const show = materializeGroupTiming(structuredClone(input))
    const handle = createEngineProtocol(), player = createAudioLivePlayer()
    expect(handle({ version: 1, requestId: 'load', op: 'load', show: input }).ok).toBe(true)
    expect(handle(configure).ok).toBe(true)
    const sharedAnalysis = { ...analysis, waveform: [] }
    for (const [seconds, lookIndex, mode, phase] of [
      [0, 0, 'automation', undefined], [1.1, 1, 'automation', 'queued'],
      [2, 1, 'automation', 'fading'], [3, 1, 'automation', 'fading'],
      [3, 0, 'automation', 'queued'], [4.5, 0, 'automation', 'fading'],
      [4.6, 0, 'static', undefined], [5, 0, 'blackout', undefined], [.5, 1, 'automation', 'queued'],
    ] as const) {
      const state: RuntimeState = { mode, activeLookId: show.looks[lookIndex].id }
      const position = { ...audio, seconds }
      const expected = player.evaluate(show, state, seconds, { ...position, analysis: sharedAnalysis })
      expected.frame.atBeats = seconds
      // Backward seeking discards history, including queued cues.
      expect(expected.transition?.phase).toBe(seconds === .5 ? undefined : phase)
      expect(handle({ version: 1, requestId: 'frame', op: 'evaluate', atBeats: seconds, state, audio: position }))
        .toEqual({ version: 1, requestId: 'frame', ok: true, ...expected })
    }
  })
  it('matches shared browser audio frames including hold, color lock, safety, blackout, seek and tempo', () => {
    const handle = createEngineProtocol(); const player = createAudioLivePlayer()
    expect(handle({ version: 1, requestId: 'load', op: 'load', show: initialShow }).ok).toBe(true)
    expect(handle(configure).ok).toBe(true)
    const show = materializeGroupTiming(structuredClone(initialShow))
    for (const [mode, seconds, follow] of [
      ['automation', 1.1, 'kicks'], ['static', 1.5, 'kicks'], ['static', 1.8, 'kicks'],
      ['automation', .5, 'kicks'], ['safety', 2.1, 'kicks'], ['blackout', 2.3, 'kicks'],
      ['automation', 3, 'tempo'], ['static', 3.2, 'tempo'], ['automation', .2, 'tempo'],
    ] as const) {
      const position = { ...audio, seconds, mode: follow }
      const state: RuntimeState = { mode, activeLookId: show.activeLookId, colorLockId: show.colorProfiles[0].id }
      const expected = player.evaluate(show, state, seconds, { ...position, analysis: { ...analysis, waveform: [] } } as AudioLiveSnapshot)
      expected.frame.atBeats = seconds
      expect(handle({ version: 1, requestId: 'evaluate', op: 'evaluate', atBeats: seconds, state, audio: position })).toEqual({ version: 1, requestId: 'evaluate', ok: true, ...expected })
    }
  })
  it('rejects invalid analysis and clocks without discarding valid audio, then clears on detach', () => {
    const handle = createEngineProtocol()
    handle({ version: 1, requestId: 'load', op: 'load', show: initialShow })
    const frame = { version: 1, requestId: 'evaluate', op: 'evaluate', atBeats: 1.1, state: { mode: 'automation', activeLookId: initialShow.activeLookId }, audio }
    expect(handle(frame).ok).toBe(false)
    handle(configure)
    for (const invalid of [{ ...analysis, duration: 601 }, { ...analysis, kicks: [{ time: 2, strength: 1 }, { time: 1, strength: 1 }] },
      { ...analysis, confidence: NaN }, { ...analysis, waveform: [] }]) expect(handle({ ...configure, analysis: invalid }).ok).toBe(false)
    expect(handle(frame).ok).toBe(true)
    for (const invalid of [{ ...audio, seconds: 11 }, { ...audio, bpm: 0 }, { ...audio, reactions: { missing: 'pulse' } }, { ...audio, floor: -1 }, { ...audio, script: true }])
      expect(handle({ ...frame, audio: invalid }).ok).toBe(false)
    expect(handle({ ...frame, atBeats: 5 }).ok).toBe(false)
    expect(handle({ ...configure, analysis: null }).ok).toBe(true)
    expect(handle(frame).ok).toBe(false)
    const { audio: omitted, ...free } = frame
    void omitted
    expect(handle(free).ok).toBe(true)
  })
})
