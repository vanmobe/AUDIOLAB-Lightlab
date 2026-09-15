import { describe, expect, it } from 'vitest'
import { audioPreviewFrame, kickIndexAt } from './audio-reactivity'
import { initialShow } from './seed'
import { resolveLookLayers } from './domain'
import type { KickAnalysis } from './kick-analysis'

const analysis: KickAnalysis = {
  duration: 3,
  kicks: [
    { time: 1, strength: 1 },
    { time: 2, strength: 1 },
  ],
  waveform: [],
  bpm: 60,
  confidence: 1,
}
function setup() {
  const show = structuredClone(initialShow)
  show.regie = undefined
  show.looks[0].layers = resolveLookLayers(show, show.looks[0]).map((layer) => ({
    ...layer,
    mode: 'static',
    intensity: 1,
  }))
  return show
}
describe('audio preview', () => {
  it('seeks deterministically including before the first kick and backwards', () => {
    expect([0, 1, 2.2, 1.5, 0.2].map((time) => kickIndexAt(analysis, time))).toEqual([-1, 0, 1, 0, -1])
  })
  it('pulses on kick and decays without mutating saved show', () => {
    const show = setup(),
      before = structuredClone(show),
      group = show.fixtures[0].groupId
    const frame = (time: number) =>
      audioPreviewFrame(show, show.looks[0].id, time, analysis, { [group]: 'pulse' }, 120, 300, 0.25)
    expect(frame(1).fixtures[0].intensity).toBeGreaterThan(frame(1.4).fixtures[0].intensity)
    expect(frame(1.4).fixtures[0].intensity).toBeCloseTo(frame(1).fixtures[0].intensity * 0.25)
    expect(frame(1)).toEqual(frame(1))
    expect(show).toEqual(before)
  })
  it('never enables an off group or changes fixed-white colors', () => {
    const show = setup(),
      group = show.fixtures[0].groupId
    show.looks[0].layers = show.looks[0].layers!.map((layer) =>
      layer.groupId === group ? { ...layer, mode: 'off' } : layer,
    )
    const frame = audioPreviewFrame(
      show,
      show.looks[0].id,
      1,
      analysis,
      Object.fromEntries(show.groups.map((item) => [item.id, 'pulse' as const])),
      120,
      300,
      0.25,
    )
    expect(frame.fixtures[0].intensity).toBe(0)
    const baseline = audioPreviewFrame(show, show.looks[0].id, 1, analysis, {}, 120, 300, 0.25)
    expect(frame.fixtures.map((item) => item.color)).toEqual(baseline.fixtures.map((item) => item.color))
  })
  it('holds step patterns between kicks regardless of playback time', () => {
    const show = structuredClone(initialShow)
    show.regie = undefined
    const pulse = show.programs.find((program) => program.effect === 'pulse')!
    show.looks[0].layers = resolveLookLayers(show, show.looks[0]).map((layer) => ({
      ...layer,
      mode: 'animation',
      programId: pulse.id,
      rateBeats: 1,
    }))
    const reactions = Object.fromEntries(show.groups.map((group) => [group.id, 'step' as const]))
    const frame = (time: number) =>
      audioPreviewFrame(show, show.looks[0].id, time, analysis, reactions, 120, 300, 0.25).fixtures
    expect(frame(1.1)).toEqual(frame(1.4))
    expect(frame(0.5)).not.toEqual(frame(1.1))
    expect(frame(1.1)).not.toEqual(frame(2.1))
  })
})
