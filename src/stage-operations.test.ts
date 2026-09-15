import { describe, expect, it } from 'vitest'
import type { FixtureDeployment } from './domain'
import { aimFixtures, aimPresets, matchesAimPreset, moveFixtures, setFixtureHeight } from './stage-operations'

const fixtures: FixtureDeployment[] = [0, 1, 2].map((i) => ({
  id: String(i),
  name: 'Spot ' + i,
  profileId: 'test',
  modeId: 'test',
  groupId: 'wash',
  position: [i * 2, 3, 0],
  aim: [0, 0, 0],
}))
describe('stage batch edits', () => {
  it('offers a backward-downward preset that survives batch movement and height changes', () => {
    const preset = aimPresets.find((item) => item.direction[1] === -1 && item.direction[2] === -1)
    expect(preset).toBeDefined()
    const aimed = aimFixtures(fixtures, ['0', '2'], preset!)
    const moved = setFixtureHeight(moveFixtures(aimed, ['0', '2'], 1, 1), ['0', '2'], 4.5)
    for (const index of [0, 2]) {
      expect(moved[index].aim[1]).toBeLessThan(moved[index].position[1])
      expect(moved[index].aim[2]).toBeLessThan(moved[index].position[2])
      expect(matchesAimPreset(moved[index], preset!)).toBe(true)
    }
    expect(moved[1]).toBe(fixtures[1])
  })
  it.each(aimPresets)('aims a batch in parallel for $label without moving fixtures', (preset) => {
    const varied = fixtures.map((f, i) => ({ ...f, position: [i * 2, i + 0.25, -i] as [number, number, number] }))
    const result = aimFixtures(varied, ['0', '2'], preset)
    for (const i of [0, 2]) {
      expect(matchesAimPreset(result[i], preset)).toBe(true)
      expect(result[i].position).toEqual(varied[i].position)
      expect(Math.hypot(...result[i].aim.map((v, axis) => v - result[i].position[axis]))).toBeCloseTo(6)
    }
    expect(result[1]).toBe(varied[1])
    expect(result[0].aim).not.toEqual(result[2].aim)
    expect(varied[0].aim).toEqual(fixtures[0].aim)
  })
  it('keeps horizontal forward at each fixture height and upward directly above it', () => {
    const forward = aimFixtures(fixtures, ['0', '1'], aimPresets[0])
    expect(forward[0].aim).toEqual([0, 3, 6])
    expect(forward[1].aim).toEqual([2, 3, 6])
    expect(aimFixtures(fixtures, ['0'], aimPresets[2])[0].aim).toEqual([0, 9, 0])
    expect(aimFixtures(fixtures, [], aimPresets[0])).toEqual(fixtures)
    expect(matchesAimPreset({ ...fixtures[0], aim: fixtures[0].position }, aimPresets[0])).toBe(false)
  })
  it('preserves preset direction through movement, height changes and saved show data', () => {
    const aimed = aimFixtures(fixtures, ['0', '1'], aimPresets[1])
    const moved = moveFixtures(aimed, ['0', '1'], 1, -2)
    const raised = setFixtureHeight(moved, ['0', '1'], 4.5)
    const restored: FixtureDeployment[] = JSON.parse(JSON.stringify(raised))
    expect(restored.slice(0, 2).every((f) => matchesAimPreset(f, aimPresets[1]))).toBe(true)
    expect(raised[2]).toBe(fixtures[2])
    const targetMode = moveFixtures(fixtures, ['0'], 1, 1)
    expect(targetMode[0].aim).toEqual(fixtures[0].aim)
  })
  it('moves selected lamps as a formation and preserves unrelated lamps and patch data', () => {
    const moved = moveFixtures(fixtures, ['0', '1'], 1, 2)
    expect(moved[0].position).toEqual([1, 3, 2])
    expect(moved[1].position).toEqual([3, 3, 2])
    expect(moved[2]).toBe(fixtures[2])
    expect(fixtures[0].position).toEqual([0, 3, 0])
  })
  it('stops the whole selection at the edge without collapsing spacing', () => {
    const moved = moveFixtures(fixtures, ['0', '1'], 100, -100)
    expect(moved[1].position[0]).toBeCloseTo(6.7)
    expect(moved[1].position[0] - moved[0].position[0]).toBeCloseTo(2)
    expect(moved[0].position[2]).toBe(-4.7)
  })
  it('sets a shared height without changing position or aim for other lamps', () => {
    const floor = setFixtureHeight(fixtures, ['0', '2'], 0.25)
    expect(floor[0].position).toEqual([0, 0.25, 0])
    expect(floor[2].position).toEqual([4, 0.25, 0])
    expect(floor[1]).toBe(fixtures[1])
    expect(floor[0].aim).toEqual(fixtures[0].aim)
  })
})
