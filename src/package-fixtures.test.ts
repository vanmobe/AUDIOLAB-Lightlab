import { expect, it } from 'vitest'
import { createShowPackage, createVersion, parseShowPackage } from './show-package'
import { initialShow } from './seed'
import { fixtureProfiles } from './fixtures'
import { createPackageFixtureCatalog } from './package-fixtures'

it('exports only referenced built-in profiles including references exclusively in history', () => {
  const show = { ...initialShow, fixtures: [] }, version = createVersion(initialShow, 'Historical rig')
  const bundle = createShowPackage(show, [version])
  expect(bundle.fixtureCatalog?.profiles.map(profile => profile.id).sort()).toEqual([...new Set(initialShow.fixtures.map(fixture => fixture.profileId))].sort())
  expect(parseShowPackage(JSON.stringify(bundle))).toEqual(bundle)
  expect(createShowPackage(show, []).fixtureCatalog?.profiles).toEqual([])
  expect(createPackageFixtureCatalog([initialShow]).fingerprint).toBe(createPackageFixtureCatalog([initialShow, initialShow]).fingerprint)
})
it('keeps old format-one packages without catalog importable and enriches their next export', () => {
  const legacy = { format: 'lightflow-show', version: 1, show: initialShow, versions: [] }
  const parsed = parseShowPackage(JSON.stringify(legacy))
  expect(parsed.fixtureCatalog).toBeUndefined()
  expect(createShowPackage(parsed.show, parsed.versions).fixtureCatalog?.version).toBe(1)
})
it.each(['fingerprint', 'channel', 'color', 'extra', 'missing', 'huge'])('rejects incompatible catalog %s instead of interpreting arbitrary fixture definitions', kind => {
  const bundle = createShowPackage(initialShow, []), catalog = bundle.fixtureCatalog!
  if (kind === 'fingerprint') catalog.fingerprint = 'changed'
  if (kind === 'channel') catalog.profiles[0].modes[0].channels++
  if (kind === 'color') catalog.profiles.find(profile => profile.fixedColor)!.fixedColor = '#ffffff'
  if (kind === 'extra') Object.assign(catalog.profiles[0], { encoder: 'arbitrary-code' })
  if (kind === 'missing') catalog.profiles.pop()
  if (kind === 'huge') catalog.profiles = Array.from({ length: 65 }, () => fixtureProfiles[0])
  expect(() => parseShowPackage(JSON.stringify(bundle))).toThrow('fixturecatalogus')
})
it('does not mutate installed definitions or show/history while making a portable snapshot', () => {
  const before = JSON.stringify(fixtureProfiles), bundle = createShowPackage(initialShow, [])
  bundle.fixtureCatalog!.profiles[0].model = 'Changed export'
  expect(JSON.stringify(fixtureProfiles)).toBe(before)
})
