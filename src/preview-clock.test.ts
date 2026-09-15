import { describe, expect, it } from 'vitest'
import { advancePreviewBeat, validPreviewBpm } from './preview-clock'

describe('preview musical clock', () => {
  it('advances two beats per second at 120 BPM', () => {
    expect(advancePreviewBeat(3, 1000, 120)).toBe(5)
  })
  it('changes speed without resetting or jumping the reached phase', () => {
    const first = advancePreviewBeat(0, 1500, 120)
    expect(advancePreviewBeat(first, 0, 60)).toBe(3)
    expect(advancePreviewBeat(first, 1000, 60)).toBe(4)
    expect(advancePreviewBeat(4, 500, 240)).toBe(6)
  })
  it('remains independent of frame cadence', () => {
    const manyFrames = Array.from({ length: 100 }).reduce<number>((beat) => advancePreviewBeat(beat, 10, 90), 0)
    expect(manyFrames).toBeCloseTo(advancePreviewBeat(0, 1000, 90), 10)
  })
  it('ignores invalid elapsed time and invalid tempo without losing phase', () => {
    for (const elapsed of [-1, NaN, Infinity]) expect(advancePreviewBeat(7, elapsed, 120)).toBe(7)
    for (const bpm of [0, 29, 241, NaN, Infinity]) expect(advancePreviewBeat(7, 1000, bpm)).toBe(7)
  })
  it('accepts only finite tempos in the supported inclusive range', () => {
    for (const value of ['', ' ', '0', '29', '241', 'NaN', 'Infinity', 'abc'])
      expect(validPreviewBpm(value)).toBeUndefined()
    for (const value of ['30', '240', '120', '100.5']) expect(validPreviewBpm(value)).toBe(Number(value))
  })
})
