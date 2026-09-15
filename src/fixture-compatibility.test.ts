import { describe, expect, it } from 'vitest'
import { fixtureProfiles } from './fixtures'
import { initialShow } from './seed'
import { fixturePatchInfo, universeUsage } from './patch-overview'
import { assertShowDocument } from './show-validation'
import { validateShow } from './domain'

describe('manual-corrected hazer personality', () => {
  it('gives new shows the two-channel footprint without overlapping another fixture', () => {
    const hazer = initialShow.fixtures.find((fixture) => fixture.id === 'hazer-1')!
    expect(hazer.modeId).toBe('2ch')
    const info = fixturePatchInfo(initialShow, hazer)
    expect(info.mode?.channels).toBe(2)
    expect(info.end).toBe(78)
    expect(info.conflicts).toEqual([])
    expect(info.mode?.verifiedForLiveOutput).toBe(false)
  })
  it('preserves a legacy saved footprint and surfaces the correction before an explicit mode change', () => {
    const show = structuredClone(initialShow)
    const hazer = show.fixtures.find((fixture) => fixture.id === 'hazer-1')!
    hazer.modeId = '1ch'
    // Existing shows may already use the newly discovered fan channel for another fixture.
    const other = show.fixtures[0]
    other.patch = { universe: 1, address: 78 }
    assertShowDocument(show)
    expect(fixturePatchInfo(show, hazer).end).toBe(77)
    expect(fixturePatchInfo(show, hazer).mode?.configurationWarning).toContain('twee kanalen')
    expect(
      validateShow(show, fixtureProfiles).some(
        (issue) => issue.severity === 'error' && issue.path === 'fixtures.hazer-1.mode',
      ),
    ).toBe(true)
    expect(universeUsage(show, 1).overlapping).toBe(0)
    hazer.modeId = '2ch'
    expect(fixturePatchInfo(show, hazer).conflicts.map((fixture) => fixture.id)).toContain(other.id)
    expect(universeUsage(show, 1).overlapping).toBe(1)
  })
  it('does not turn documentation research into a physical verification flag', () => {
    expect(fixtureProfiles.flatMap((profile) => profile.modes).every((mode) => !mode.verifiedForLiveOutput)).toBe(true)
  })
})
