import { describe, expect, it } from 'vitest'
import type { BandMember, FixtureDeployment } from './domain'
import { aimAtBandMember, moveBandMember } from './band-operations'

const member: BandMember = { id: 'singer', name: 'Zang', position: [1, 0.5, 2] }
const lamp: FixtureDeployment = {
  id: 'front',
  name: 'Front',
  profileId: 'test',
  modeId: 'test',
  groupId: 'front',
  position: [0, 4, 3],
  aim: [0, 0, 0],
  aimMode: 'direction',
}
describe('band placement and fixed aiming', () => {
  it('aims selected fixtures at chest height without changing unrelated lights', () => {
    const other = { ...lamp, id: 'other' }
    const result = aimAtBandMember([lamp, other], ['front'], member)
    expect(result[0].aim).toEqual([1, 1.8, 2])
    expect(result[0].aimMode).toBe('target')
    expect(result[0].position).toEqual(lamp.position)
    expect(result[1]).toBe(other)
    expect(lamp.aim).toEqual([0, 0, 0])
  })
  it('clamps member movement and leaves existing fixture target fixed', () => {
    const result = aimAtBandMember([lamp], ['front'], member)
    const moved = moveBandMember([member], member.id, 100, -100)
    expect(moved[0].position).toEqual([6.5, 0.5, -4.5])
    expect(member.position).toEqual([1, 0.5, 2])
    expect(result[0].aim).toEqual([1, 1.8, 2])
  })
})
