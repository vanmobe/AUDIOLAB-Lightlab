import type { FixtureProfile, ShowDocument } from './domain'
import { fixtureProfiles } from './fixtures'

export interface PackageFixtureCatalog {
  version: 1
  fingerprint: string
  profiles: FixtureProfile[]
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
        .join(',') +
      '}'
    )
  return JSON.stringify(value)
}
// A deterministic change marker, not a security signature. Compatibility also compares full definitions.
function fingerprint(text: string) {
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619)
  return 'fnv1a32-' + (hash >>> 0).toString(16).padStart(8, '0')
}
export function createPackageFixtureCatalog(shows: ShowDocument[]): PackageFixtureCatalog {
  const ids = [...new Set(shows.flatMap((show) => show.fixtures.map((fixture) => fixture.profileId)))].sort()
  const profiles = ids.map((id) => {
    const profile = fixtureProfiles.find((profile) => profile.id === id)
    if (!profile) throw new Error(`Fixtureprofiel ${id} is niet ingebouwd in deze Lightlab-versie.`)
    return structuredClone(profile)
  })
  return { version: 1, fingerprint: fingerprint(canonical(profiles)), profiles }
}
export function validatePackageFixtureCatalog(value: unknown, shows: ShowDocument[]) {
  const mismatch = () =>
    new Error(
      'De fixturecatalogus van dit showbestand is ongeldig of wijkt af van deze Lightlab-versie. Open het met de oorspronkelijke compatibele versie; geïmporteerde DMX-profielen worden niet uitgevoerd.',
    )
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw mismatch()
  const data = value as Partial<PackageFixtureCatalog>
  if (
    Object.keys(data).some((key) => !['version', 'fingerprint', 'profiles'].includes(key)) ||
    data.version !== 1 ||
    typeof data.fingerprint !== 'string' ||
    data.fingerprint.length > 64 ||
    !Array.isArray(data.profiles) ||
    data.profiles.length > 64
  )
    throw mismatch()
  // Raw JSON has a package-wide bound; this tighter catalog bound also limits traversal depth/work.
  const serialized = JSON.stringify(data.profiles)
  if (serialized.length > 131072) throw mismatch()
  const expected = createPackageFixtureCatalog(shows)
  // Compare to trusted shape without recursively traversing attacker-supplied nested fields.
  function matches(actual: unknown, trusted: unknown): boolean {
    if (!trusted || typeof trusted !== 'object') return actual === trusted
    if (!actual || typeof actual !== 'object' || Array.isArray(actual) !== Array.isArray(trusted)) return false
    const expectedKeys = Object.keys(trusted),
      actualKeys = Object.keys(actual)
    return (
      expectedKeys.length === actualKeys.length &&
      expectedKeys.every(
        (key) =>
          Object.hasOwn(actual, key) &&
          matches((actual as Record<string, unknown>)[key], (trusted as Record<string, unknown>)[key]),
      )
    )
  }
  if (data.fingerprint !== expected.fingerprint || !matches(data.profiles, expected.profiles)) throw mismatch()
}
