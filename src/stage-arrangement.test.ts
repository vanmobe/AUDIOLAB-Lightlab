import { expect, it } from 'vitest'
import { initialShow } from './seed'
import { aimFixtures, aimPresets, alignFixtures, distributeFixtures } from './stage-operations'

it('aligns only selected fixtures and preserves beam direction, height and patch', () => {
  const ids = initialShow.fixtures.slice(0, 3).map((f) => f.id)
  const before = aimFixtures(initialShow.fixtures, ids, aimPresets[1])
  const after = alignFixtures(before, ids, 'x')
  expect(new Set(after.slice(0, 3).map((f) => f.position[0])).size).toBe(1)
  after.slice(0, 3).forEach((f, i) => {
    expect(f.position[1]).toBe(before[i].position[1])
    expect(f.patch).toEqual(before[i].patch)
    expect(f.aim.map((v, axis) => v - f.position[axis])).toEqual(
      before[i].aim.map((v, axis) => v - before[i].position[axis]),
    )
  })
  expect(after.slice(3)).toEqual(before.slice(3))
})

it('distributes unevenly spaced fixtures while keeping both endpoints and world targets', () => {
  const before = structuredClone(initialShow.fixtures.slice(0, 3))
  before.forEach((f, i) => {
    f.position[0] = [-4, -3, 4][i]
    f.aimMode = 'target'
  })
  const after = distributeFixtures(
    before,
    before.map((f) => f.id),
  )
  expect(after.map((f) => f.position[0])).toEqual([-4, 0, 4])
  expect(after.map((f) => f.aim)).toEqual(before.map((f) => f.aim))
})

it('leaves undersized and empty selections unchanged', () => {
  expect(alignFixtures(initialShow.fixtures, [], 'z')).toBe(initialShow.fixtures)
  expect(
    distributeFixtures(
      initialShow.fixtures,
      initialShow.fixtures.slice(0, 2).map((f) => f.id),
    ),
  ).toBe(initialShow.fixtures)
})

it('aligns the top-view Y position without changing X, height or world targets', () => {
  const before = structuredClone(initialShow.fixtures.slice(0, 4))
  before.forEach((f, i) => {
    f.position[2] = [-4, -2, 3, 4][i]
    f.aimMode = 'target'
  })
  const after = alignFixtures(
    before,
    before.slice(0, 3).map((f) => f.id),
    'z',
  )
  after.slice(0, 3).forEach((f, i) => {
    expect(f.position[2]).toBeCloseTo(-1)
    expect(f.position.slice(0, 2)).toEqual(before[i].position.slice(0, 2))
    expect(f.aim).toEqual(before[i].aim)
    expect(f.patch).toEqual(before[i].patch)
  })
  expect(after[3]).toBe(before[3])
})

it('distributes front to back without moving sideways or changing height and beam direction', () => {
  const before = structuredClone(initialShow.fixtures.slice(0, 4))
  before.forEach((f, i) => {
    f.position[2] = [-4, -3, 4, 2][i]
  })
  const ids = before.slice(0, 3).map((f) => f.id)
  const aimed = aimFixtures(
    before,
    ids,
    aimPresets.find((p) => p.id === 'left-up')!,
  )
  const after = distributeFixtures(aimed, ids, 'z')
  expect(after.map((f) => f.position[2])).toEqual([-4, 0, 4, 2])
  after.forEach((f, i) => {
    expect(f.position.slice(0, 2)).toEqual(aimed[i].position.slice(0, 2))
    expect(f.patch).toEqual(aimed[i].patch)
    f.aim.forEach((v, axis) => expect(v - f.position[axis]).toBeCloseTo(aimed[i].aim[axis] - aimed[i].position[axis]))
  })
  expect(after[3]).toBe(aimed[3])
})

it.each(['x', 'z'] as const)('keeps zero-span and unknown selections unchanged on %s', (axis) => {
  const before = structuredClone(initialShow.fixtures.slice(0, 3))
  before.forEach((f) => {
    f.position[axis === 'x' ? 0 : 2] = 0
  })
  expect(
    distributeFixtures(
      before,
      before.map((f) => f.id),
      axis,
    ),
  ).toEqual(before)
  expect(distributeFixtures(before, ['missing'], axis)).toBe(before)
})
