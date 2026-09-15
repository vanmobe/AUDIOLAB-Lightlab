import { describe, expect, it } from 'vitest'
import { createAudioLivePlayer, type AudioLiveSnapshot } from './audio-live'
import { audioPreviewFrame } from './audio-reactivity'
import { mixTransitionFrames } from './look-transitions'
import { evaluateFrame, type RuntimeMode } from './domain'
import { fixtureProfiles } from './fixtures'
import { initialShow } from './seed'
import { defaultShowRegie } from './show-regie'

function rig(quantizeBeats: 0 | 2 = 0, fadeBeats = 2) {
  const show = structuredClone(initialShow)
  show.regie = { ...defaultShowRegie(show), minimumCoverage: { percent: 0, threshold: .1 }, transition: { quantizeBeats, fadeBeats } }
  show.groups.forEach(group => { group.intensity = 1 })
  show.looks.forEach((look, index) => {
    look.colorProfileId = show.colorProfiles[index % 2].id
    look.layers = show.groups.map(group => ({ groupId: group.id, mode: group.id === 'effects' ? 'off' : 'static',
      programId: null, colorProfileId: null, intensity: 1, rateBeats: 1, offsetBeats: 0 }))
  })
  show.colorProfiles.slice(0, 2).forEach((profile, index) => {
    profile.primary = profile.secondary = profile.accent = index ? '#0000ff' : '#ff0000'
    profile.intensityLimit = 1
  })
  // Uneven kick times prove pulse timing is not generated from the regular BPM grid.
  const audio: AudioLiveSnapshot = { seconds: 0, mode: 'kicks', bpm: 120, decayMs: 100, floor: .2,
    analysis: { duration: 10, kicks: [{ time: 1, strength: 1 }, { time: 1.4, strength: 1 }, { time: 2.3, strength: 1 }], waveform: [], bpm: 120, confidence: 1 },
    reactions: Object.fromEntries(show.groups.map(group => [group.id, 'pulse'])) }
  const player = createAudioLivePlayer()
  const state = (look = 1, mode: RuntimeMode = 'automation') => ({ activeLookId: show.looks[look].id, mode })
  const at = (seconds: number, look = 1, mode: RuntimeMode = 'automation') => player.evaluate(show, state(look, mode), 900, { ...audio, seconds })
  at(0, 0)
  return { show, audio, player, state, at }
}

describe('individual-kick Look transitions', () => {
  it('fades both live pulse endpoints and reacts to irregular kicks, not inferred beats', () => {
    const { show, audio, at, state } = rig()
    expect(at(1).transition).toMatchObject({ phase: 'fading', progress: 0, startAtBeats: 2, endAtBeats: 4 })
    const tail = at(1.25)
    expect(tail.frame.fixtures[0].intensity).toBeCloseTo(.2)
    const kick = at(1.4)
    expect(kick.frame.fixtures[0].intensity).toBeCloseTo(1)
    expect(kick.transition?.progress).toBeCloseTo(.4)
    const endpoints = [0, 1].map(index => audioPreviewFrame(show, state(index).activeLookId, 1.4,
      audio.analysis, audio.reactions, audio.bpm, audio.decayMs, audio.floor))
    expect(kick.frame.fixtures).toEqual(mixTransitionFrames(endpoints[0], endpoints[1], kick.transition!.progress).fixtures)
    expect(at(2).transition).toBeUndefined()
  })

  it('queues on the BPM grid while old Look reacts, and supports zero-duration cuts', () => {
    const { at } = rig(2, 0)
    expect(at(.6).transition).toMatchObject({ phase: 'queued', startAtBeats: 2 })
    expect(at(.9).frame.fixtures[0].color).toBe('#ff0000')
    const cut = at(1)
    expect(cut.transition).toBeUndefined()
    expect(cut.frame.fixtures[0].color).toBe('#0000ff')
  })

  it('pauses a fade with media time and interrupts it without a color or intensity jump', () => {
    const { at, player, show, state, audio } = rig()
    at(1)
    const midway = at(1.4)
    expect(player.evaluate(show, state(), 1000, { ...audio, seconds: 1.4, playing: false })).toEqual(midway)
    expect(at(1.4, 0).frame.fixtures).toEqual(midway.frame.fixtures)
  })

  it('holds the actual mixed frame, turns haze off and abandons the fade when resuming', () => {
    const { at, player, show, state, audio } = rig()
    at(1)
    const midway = at(1.4)
    const held = at(1.45, 1, 'static')
    expect(held.frame.fixtures).toEqual(midway.frame.fixtures.map(item => ({ ...item, haze: 0 })))
    expect(held.transition).toBeUndefined()
    expect(player.evaluate(show, state(1, 'static'), 900, { ...audio, seconds: 2.3, bpm: 60 }).frame.fixtures).toEqual(held.frame.fixtures)
    expect(at(2.4).transition).toBeUndefined()
  })

  it.each(['blackout', 'safety', 'master'] as const)('%s takes priority over both fading endpoints', action => {
    const { at, show, player, audio, state } = rig()
    at(1)
    const input = action === 'master' ? { ...show, groups: show.groups.map(group => ({ ...group, intensity: 0 })) } : show
    const next = state(1, action === 'master' ? 'automation' : action)
    const result = player.evaluate(input, next, 900, { ...audio, seconds: 1.4 })
    expect(result.transition).toBeUndefined()
    if (action === 'master') expect(result.frame.fixtures.every(item => item.intensity === 0)).toBe(true)
    else expect(result.frame).toEqual(evaluateFrame(input, fixtureProfiles, next, 2.8))
  })

  it('cancels on backward seeking, reanalysis and BPM edits rather than reinterpreting fade phase', () => {
    for (const change of ['seek', 'analysis', 'slower', 'faster'] as const) {
      const { at, player, show, state, audio } = rig()
      at(1)
      expect(at(1.4).transition).toBeDefined()
      const changed = { ...audio, seconds: change === 'seek' ? .5 : 1.5,
        bpm: change === 'slower' ? 60 : change === 'faster' ? 180 : 120,
        analysis: change === 'analysis' ? { ...audio.analysis } : audio.analysis }
      expect(player.evaluate(show, state(), 900, changed).transition).toBeUndefined()
    }
  })

  it('preserves fixed-white color throughout the fade and never edits stored Looks', () => {
    const { show, at } = rig()
    const before = structuredClone(show)
    // Locate the seed's fixed-white Varytecs without depending on fixture order.
    const whiteIds = show.fixtures.filter(fixture => fixture.profileId.includes('varytec')).map(fixture => fixture.id)
    at(1)
    const start = at(1.1).frame.fixtures.filter(item => whiteIds.includes(item.fixtureId))
    const middle = at(1.4).frame.fixtures.filter(item => whiteIds.includes(item.fixtureId))
    expect(start.length).toBeGreaterThan(0)
    expect(middle.map(item => item.color)).toEqual(start.map(item => item.color))
    expect(show).toEqual(before)
  })

  it('does not lose an exact kick through a BPM conversion roundtrip', () => {
    const { show, audio, player, state } = rig()
    const input = { ...audio, seconds: .7, bpm: 90,
      analysis: { ...audio.analysis, kicks: [{ time: .7, strength: 1 }] } }
    expect(player.evaluate(show, state(), 900, input).frame.fixtures[0].intensity).toBeCloseTo(1)
  })
})
