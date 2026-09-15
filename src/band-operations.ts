import type { BandMember, FixtureDeployment } from './domain'

export function moveBandMember(members: BandMember[], id: string, x: number, z: number) {
  return members.map(member => member.id === id ? { ...member, position: [Math.max(-6.5, Math.min(6.5, x)), member.position[1], Math.max(-4.5, Math.min(4.5, z))] as [number, number, number] } : member)
}

export function aimAtBandMember(fixtures: FixtureDeployment[], ids: string[], member: BandMember) {
  return fixtures.map(f => ids.includes(f.id) ? { ...f, aimMode: 'target' as const, aim: [member.position[0], member.position[1] + 1.3, member.position[2]] as [number, number, number] } : f)
}
