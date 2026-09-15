import { getFixtureMode, type FixtureDeployment, type ShowDocument } from './domain'
import { fixtureProfiles } from './fixtures'

export function fixturePatchInfo(show: ShowDocument, fixture: FixtureDeployment) {
  const profile = fixtureProfiles.find(item => item.id === fixture.profileId)
  const mode = profile && getFixtureMode(profile, fixture.modeId)
  const end = fixture.patch && mode ? fixture.patch.address + mode.channels - 1 : undefined
  const conflicts = !fixture.patch || !end ? [] : show.fixtures.filter(other => {
    if (other.id === fixture.id || other.patch?.universe !== fixture.patch!.universe) return false
    const otherProfile = fixtureProfiles.find(item => item.id === other.profileId)
    const otherMode = otherProfile && getFixtureMode(otherProfile, other.modeId)
    return otherMode && other.patch.address <= end && other.patch.address + otherMode.channels - 1 >= fixture.patch!.address
  })
  return { profile, mode, end, conflicts }
}

export function universeUsage(show: ShowDocument, universe: number) {
  const occupied = new Set<number>()
  const overlapping = new Set<number>()
  for (const fixture of show.fixtures.filter(item => item.patch?.universe === universe)) {
    const { end } = fixturePatchInfo(show, fixture)
    if (end === undefined) continue
    for (let address = Math.max(1, fixture.patch!.address); address <= Math.min(512, end); address++) {
      if (occupied.has(address)) overlapping.add(address)
      occupied.add(address)
    }
  }
  return { used: occupied.size, free: 512 - occupied.size, overlapping: overlapping.size }
}

export function patchInputError(universe: string, address: string, channels: number) {
  if (!/^\d+$/.test(universe) || Number(universe) < 1 || Number(universe) > 63999) return 'Kies een universe van 1 tot en met 63999.'
  if (!/^\d+$/.test(address) || Number(address) < 1 || Number(address) + channels - 1 > 512) return `Kies een startadres van 1 tot en met ${513 - channels}; deze modus gebruikt ${channels} kanalen.`
  return ''
}

export function routeUniverseError(universe: string, protocol: string) {
  // Lightlab is 1-based; Art-Net encodes a 15-bit Port-Address (universe minus one).
  return patchInputError(universe, '1', 1) || (protocol === 'artnet' && Number(universe) > 32768 ? 'Art-Net ondersteunt in Lightlab universe 1 tot en met 32768.' : '')
}
