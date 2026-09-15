import { describe, expect, it } from 'vitest'
import { initialShow } from './seed'
import { fixturePatchInfo, patchInputError, routeUniverseError, universeUsage } from './patch-overview'

describe('patch overview', () => {
  it('reports both sides of a conflict, without counting the fixture itself', () => {
    const fixtures = initialShow.fixtures.slice(0, 2).map((f) => ({ ...f, patch: { universe: 1, address: 1 } }))
    const show = { ...initialShow, fixtures }
    expect(fixturePatchInfo(show, fixtures[0]).conflicts.map((f) => f.id)).toEqual([fixtures[1].id])
    expect(fixturePatchInfo(show, fixtures[1]).conflicts.map((f) => f.id)).toEqual([fixtures[0].id])
    expect(universeUsage(show, 1)).toEqual({ used: 4, free: 508, overlapping: 4 })
  })
  it('counts actual occupied channels rather than the highest patched address', () => {
    const show = { ...initialShow, fixtures: [{ ...initialShow.fixtures[0], patch: { universe: 2, address: 509 } }] }
    expect(universeUsage(show, 2)).toEqual({ used: 4, free: 508, overlapping: 0 })
    expect(universeUsage(show, 1).used).toBe(0)
  })
  it('keeps unpatched fixtures out of occupancy', () => {
    const fixture = { ...initialShow.fixtures[0], patch: undefined }
    expect(fixturePatchInfo({ ...initialShow, fixtures: [fixture] }, fixture).end).toBeUndefined()
    expect(universeUsage({ ...initialShow, fixtures: [fixture] }, 1).used).toBe(0)
  })
  it.each(['', '0', '-1', '1.5', 'NaN', '64000'])('rejects invalid universe draft %s without saving it', (value) => {
    expect(patchInputError(value, '1', 4)).not.toBe('')
  })
  it.each(['', '0', '1.2', '510', '513'])('rejects invalid or overflowing 4-channel address %s', (value) => {
    expect(patchInputError('1', value, 4)).not.toBe('')
  })
  it('allows exact universe/channel boundaries', () => {
    expect(patchInputError('63999', '509', 4)).toBe('')
  })
  it('uses the one-based Art-Net limit without restricting sACN to it', () => {
    expect(routeUniverseError('32768', 'artnet')).toBe('')
    expect(routeUniverseError('32769', 'artnet')).not.toBe('')
    expect(routeUniverseError('63999', 'sacn')).toBe('')
    expect(routeUniverseError('64000', 'sacn')).not.toBe('')
  })
})
