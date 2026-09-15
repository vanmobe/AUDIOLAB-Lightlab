import { describe, expect, it } from 'vitest'
import { evaluateFrame } from './domain'
import { fixtureProfiles } from './fixtures'
import { initialShow } from './seed'
import { assertShowDocument } from './show-validation'
import { coverageReport, defaultShowRegie } from './show-regie'

function rig() {
  const show = structuredClone(initialShow)
  show.regie = defaultShowRegie(show)
  const program = show.programs[0]
  program.pattern = {
    version: 1,
    floor: 0,
    steps: [{ selection: 'all', direction: 'forward', envelope: 'hold', width: 1, trail: 0, level: 0, weight: 1 }],
  }
  show.looks[0].layers = show.groups.map((group) => ({
    groupId: group.id,
    mode: 'animation',
    programId: program.id,
    colorProfileId: null,
    intensity: 1,
    rateBeats: 1,
    offsetBeats: 0,
  }))
  show.activeLookId = show.looks[0].id
  show.groups.forEach((group) => {
    group.intensity = 1
  })
  show.colorProfiles.forEach((profile) => {
    profile.intensityLimit = 1
    profile.primary = '#ff0000'
    profile.accent = '#00ff00'
    profile.secondary = '#0000ff'
    profile.white = '#ffffff'
  })
  return show
}
function frame(show: ReturnType<typeof rig>, mode: 'automation' | 'static' | 'safety' | 'blackout' = 'automation') {
  return evaluateFrame(show, fixtureProfiles, { activeLookId: show.activeLookId, mode, heldAtBeats: 0.5 }, 2)
}
describe('show regie', () => {
  it('preserves old output exactly when absent or explicit defaults', () => {
    const show = structuredClone(initialShow)
    const before = frame(show)
    show.regie = defaultShowRegie(show)
    expect(frame(show)).toEqual(before)
  })
  it('raises exactly the required number of dark controllable heads, excluding haze', () => {
    const show = rig()
    show.regie!.minimumCoverage = { percent: 80, threshold: 0.1 }
    const before = JSON.stringify(show),
      result = frame(show),
      report = coverageReport(show, fixtureProfiles, result)
    expect(report.total).toBe(24)
    expect(report.required).toBe(20)
    expect(report.lit).toBe(20)
    expect(result).toEqual(frame(show))
    expect(coverageReport(show, fixtureProfiles, frame(show, 'static')).lit).toBe(20)
    expect(JSON.stringify(show)).toBe(before)
  })
  it('never defeats blackout, safety, off, black colors, zero masters or palette caps', () => {
    const show = rig()
    show.regie!.minimumCoverage.percent = 100
    show.groups.find((group) => group.id === 'wash')!.intensity = 0
    show.looks[0].layers!.find((layer) => layer.groupId === 'back')!.mode = 'off'
    const result = frame(show)
    expect(coverageReport(show, fixtureProfiles, result).unmet).toBeGreaterThan(0)
    for (const fixture of show.fixtures.filter((fixture) => ['wash', 'back'].includes(fixture.groupId)))
      expect(result.fixtures.find((light) => light.fixtureId === fixture.id)!.intensity).toBe(0)
    expect(frame(show, 'blackout').fixtures.every((light) => light.intensity === 0 && light.haze === 0)).toBe(true)
    show.regie!.safetyGroupIds = ['back']
    const safety = frame(show, 'safety')
    expect(
      safety.fixtures.every(
        (light) =>
          show.fixtures.find((fixture) => fixture.id === light.fixtureId)!.groupId === 'back' || light.intensity === 0,
      ),
    ).toBe(true)
    show.groups.forEach((group) => {
      group.intensity = 1
    })
    show.colorProfiles.forEach((profile) => {
      profile.intensityLimit = 0.05
    })
    expect(coverageReport(show, fixtureProfiles, frame(show)).lit).toBe(0)
    show.colorProfiles.forEach((profile) => {
      profile.intensityLimit = 1
      profile.primary = '#000000'
      profile.accent = '#000000'
    })
    expect(coverageReport(show, fixtureProfiles, frame(show)).unmet).toBeGreaterThan(0)
  })
  it('counts and corrects independent bar heads even for legacy aggregate effects', () => {
    const show = rig()
    delete show.programs[0].pattern
    show.programs[0].effect = 'pulse'
    show.regie!.minimumCoverage = { percent: 80, threshold: 0.8 }
    const result = frame(show)
    expect(coverageReport(show, fixtureProfiles, result).lit).toBe(20)
    expect(result.fixtures.some((light) => light.segments?.length === 4)).toBe(true)
  })
  it('uses all selected RGB roles while fixed-white spots retain their physical color', () => {
    const show = rig()
    show.regie!.colorRoles = ['secondary']
    const result = frame(show)
    for (const fixture of show.fixtures) {
      const profile = fixtureProfiles.find((profile) => profile.id === fixture.profileId)!
      const light = result.fixtures.find((light) => light.fixtureId === fixture.id)!
      if (profile.kind === 'hazer') continue
      expect(light.color).toBe(profile.fixedColor ?? '#0000ff')
    }
    show.regie!.colorRoles = ['primary', 'accent', 'secondary', 'white']
    const colors = new Set(
      frame(show).fixtures.flatMap((light) => light.segments?.map((segment) => segment.color) ?? [light.color]),
    )
    for (const color of ['#ff0000', '#00ff00', '#0000ff', '#ffffff']) expect(colors.has(color)).toBe(true)
  })
  it('validates persisted settings and rejects unknown, duplicate or dangling choices', () => {
    const show = rig()
    expect(() => assertShowDocument(show)).not.toThrow()
    for (const regie of [
      { ...show.regie, colorRoles: [] },
      { ...show.regie, colorRoles: ['primary', 'primary'] },
      { ...show.regie, safetyGroupIds: ['missing'] },
      { ...show.regie, minimumCoverage: { percent: 101, threshold: 0.1 } },
      { ...show.regie, minimumCoverage: { percent: 80, threshold: 0 } },
      { ...show.regie, code: 'x' },
    ])
      expect(() => assertShowDocument({ ...show, regie })).toThrow()
  })
})
