import { describe, expect, it } from 'vitest'
import { createAudioLivePlayer, type AudioLiveSnapshot } from './audio-live'
import { initialShow } from './seed'
import { evaluateFrame, resolveLookLayers, type RuntimeState } from './domain'
import { fixtureProfiles } from './fixtures'
import { livePreview, emptyLiveControls } from './live-controls'

const show = structuredClone(initialShow)
show.regie = undefined
show.looks[0].layers = resolveLookLayers(show, show.looks[0]).map((layer) => ({ ...layer, mode: 'static' }))
const state: RuntimeState = { mode: 'automation', activeLookId: show.looks[0].id }
const audio: AudioLiveSnapshot = {
  seconds: 1,
  analysis: { duration: 3, kicks: [{ time: 1, strength: 1 }], waveform: [], bpm: 120, confidence: 1 },
  mode: 'kicks',
  bpm: 120,
  reactions: Object.fromEntries(show.groups.map((group) => [group.id, 'pulse'])),
  decayMs: 300,
  floor: 0.2,
}
describe('Live audio bridge', () => {
  it('uses media time instead of the free clock and reconstructs backward seeks', () => {
    const player = createAudioLivePlayer()
    const peak = player.evaluate(show, state, 800, audio).frame
    const tail = player.evaluate(show, state, 801, { ...audio, seconds: 1.5 }).frame
    expect(peak.fixtures[0].intensity).toBeGreaterThan(tail.fixtures[0].intensity)
    expect(player.evaluate(show, state, 900, audio).frame).toEqual(peak)
  })
  it.each(['blackout', 'safety'] as const)('%s wins over kick reactions', (mode) => {
    expect(createAudioLivePlayer().evaluate(show, { ...state, mode }, 700, audio).frame).toEqual(
      evaluateFrame(show, fixtureProfiles, { ...state, mode }, 2),
    )
  })
  it.each(['tempo', 'kicks'] as const)('holds %s despite advancing audio and BPM edits', (mode) => {
    const player = createAudioLivePlayer(),
      input = { ...audio, mode }
    player.evaluate(show, state, 700, input)
    const held = player.evaluate(show, { ...state, mode: 'static', heldAtBeats: 700 }, 701, {
      ...input,
      seconds: 1.1,
    }).frame
    expect(
      player.evaluate(show, { ...state, mode: 'static' }, 900, { ...input, seconds: 2.5, bpm: 60 }).frame.fixtures,
    ).toEqual(held.fixtures)
    expect(held.fixtures.every((item) => item.haze === 0)).toBe(true)
  })
  it('preserves color lock, zero masters and live off overrides', () => {
    const controls = emptyLiveControls()
    const id = show.groups[0].id
    controls.overrides[id] = { mode: 'off' }
    const input = livePreview(show, { ...state, colorLockId: show.colorProfiles[1].id }, controls)
    const frame = createAudioLivePlayer().evaluate(input.show, input.state, 900, audio).frame
    expect(
      frame.fixtures
        .filter((item) => show.fixtures.find((fixture) => fixture.id === item.fixtureId)?.groupId === id)
        .every((item) => item.intensity === 0),
    ).toBe(true)
    const base = evaluateFrame(input.show, fixtureProfiles, input.state, 2)
    expect(frame.fixtures.map((item) => item.color)).toEqual(base.fixtures.map((item) => item.color))
    const muted = { ...show, groups: show.groups.map((group) => ({ ...group, intensity: 0 })) }
    expect(
      createAudioLivePlayer()
        .evaluate(muted, state, 9, audio)
        .frame.fixtures.every((item) => item.intensity === 0),
    ).toBe(true)
  })
  it('uses the original engine without an active source', () => {
    expect(createAudioLivePlayer().evaluate(show, state, 7).frame).toEqual(
      evaluateFrame(show, fixtureProfiles, state, 7),
    )
  })
  it('captures the incoming media position when enabling follow while held', () => {
    const player = createAudioLivePlayer(),
      held = { ...state, mode: 'static' as const }
    const first = player.evaluate(show, held, 700, audio).frame
    expect(first.fixtures[0].intensity).toBeGreaterThan(0.2)
    player.evaluate(show, held, 800)
    const later = player.evaluate(show, held, 900, { ...audio, seconds: 2 }).frame
    expect(later.fixtures[0].intensity).toBeLessThan(first.fixtures[0].intensity)
  })
  it('retains musical Look transitions when following stable tempo', () => {
    const fixture = structuredClone(initialShow)
    fixture.regie = {
      ...fixture.regie!,
      minimumCoverage: { percent: 0, threshold: 0.1 },
      transition: { quantizeBeats: 0, fadeBeats: 2 },
    }
    const player = createAudioLivePlayer(),
      input = { ...audio, mode: 'tempo' as const }
    player.evaluate(fixture, { ...state, activeLookId: fixture.looks[0].id }, 100, input)
    const next = { ...state, activeLookId: fixture.looks[1].id }
    expect(player.evaluate(fixture, next, 200, input).transition?.phase).toBe('fading')
    expect(player.evaluate(fixture, next, 300, { ...input, seconds: 1.5 }).transition?.progress).toBeCloseTo(0.5)
  })
})
