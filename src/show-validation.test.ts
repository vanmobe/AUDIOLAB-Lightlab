import { describe, expect, it } from 'vitest'
import { initialShow } from './seed'
import { assertShowDocument, MAX_SHOW_JSON_LENGTH, parseShowDocument } from './show-validation'
import { createShowPackage, createVersion, parseShowPackage } from './show-package'
import { defaultBandProfile } from './band-profile'

describe('show persistence validation', () => {
  it('preserves optional band profiles in packages and snapshots, with old shows unchanged', () => {
    const show = {
      ...initialShow,
      bandProfile: { ...defaultBandProfile, name: 'Band', genres: 'Soul', preferredColors: ['#ff6600'] },
    }
    const bundle = createShowPackage(show, [createVersion(show, 'Bandprofiel')])
    expect(parseShowPackage(JSON.stringify(bundle))).toEqual(bundle)
    expect(parseShowDocument(JSON.stringify(show))).toEqual(show)
    expect(parseShowDocument(JSON.stringify(initialShow)).bandProfile).toBeUndefined()
  })
  it.each([
    null,
    {},
    { ...defaultBandProfile, bpm: 120 },
    { ...defaultBandProfile, preferredColors: ['red'] },
    { ...defaultBandProfile, energy: 'extreme' },
  ])('rejects invalid persisted band profile %j', (bandProfile) => {
    expect(() => assertShowDocument({ ...initialShow, bandProfile })).toThrow('bandProfile')
  })
  it('roundtrips named control banks and slot assignments without assigning legacy controls', () => {
    const show = structuredClone(initialShow)
    show.controlSurface.bankNames = { '1': 'Couplet', '16': 'Finale' }
    show.controlSurface.bindings[0].slot = { bank: 16, kind: 'button', index: 8 }
    show.controlSurface.bindings[3].slot = { bank: 1, kind: 'rotary', index: 4 }
    const bundle = createShowPackage(show, [createVersion(show, 'Wing layout')])
    expect(parseShowPackage(JSON.stringify(bundle))).toEqual(bundle)
    expect(parseShowDocument(JSON.stringify(show))).toEqual(show)
    expect(show.controlSurface.bindings[1].slot).toBeUndefined()
    // Unsupported hardware placements survive a profile switch rather than losing user assignments.
    show.controlSurface.profileId = 'wing-compact'
    expect(() => assertShowDocument(show)).not.toThrow()
    show.controlSurface.profileId = 'future-surface'
    expect(() => assertShowDocument(show)).not.toThrow()
  })
  it.each([
    null,
    {},
    { bank: 0, kind: 'button', index: 1 },
    { bank: 65, kind: 'button', index: 1 },
    { bank: 1.5, kind: 'button', index: 1 },
    { bank: 1, kind: 'button', index: 0 },
    { bank: 1, kind: 'button', index: 65 },
    { bank: 1, kind: 'button', index: '1' },
    { bank: 1, kind: 'fader', index: 1 },
    { bank: 1, kind: 'rotary', index: 1 },
    { bank: 1, kind: 'button', index: 1, cc: 42 },
  ])('rejects malformed or incompatible persisted control slots %j', (slot) => {
    const show = structuredClone(initialShow)
    Object.assign(show.controlSurface.bindings[0], { slot })
    expect(() => assertShowDocument(show)).toThrow('slot')
  })
  it('rejects duplicate slots and keeps unsupported legacy actions unassigned', () => {
    const show = structuredClone(initialShow)
    show.controlSurface.bindings[0].slot = { bank: 1, kind: 'button', index: 1 }
    show.controlSurface.bindings[1].slot = { bank: 1, kind: 'button', index: 1 }
    expect(() => assertShowDocument(show)).toThrow('dubbel')
    delete show.controlSurface.bindings[1].slot
    show.controlSurface.bindings.push({ id: 'legacy-tap', label: 'Tap', action: 'tap-tempo' })
    expect(() => assertShowDocument(show)).not.toThrow()
    show.controlSurface.bindings.at(-1)!.slot = { bank: 1, kind: 'button', index: 2 }
    expect(() => assertShowDocument(show)).toThrow('slot')
  })
  it.each([
    null,
    [],
    { '0': 'Test' },
    { '65': 'Test' },
    { '01': 'Test' },
    { '1.5': 'Test' },
    { '1': '' },
    { '1': ' ' },
    { '1': 3 },
    { '1': 'x'.repeat(81) },
  ])('rejects malformed control bank names %j', (bankNames) => {
    const show = structuredClone(initialShow)
    Object.assign(show.controlSurface, { bankNames })
    expect(() => assertShowDocument(show)).toThrow('bankNames')
  })
  it('preserves optional band members through export, import and version snapshots', () => {
    const show = structuredClone(initialShow)
    show.bandMembers = [{ id: 'singer', name: 'Zang', position: [1, 0, 2] }]
    const bundle = createShowPackage(show, [createVersion(show, 'Band op podium')])
    expect(parseShowPackage(JSON.stringify(bundle))).toEqual(bundle)
    expect(() => assertShowDocument(initialShow)).not.toThrow()
  })
  it.each([
    null,
    [{ id: 'singer', name: 'Zang', position: [0, Infinity, 0] }],
    [{ id: 'singer', name: '', position: [0, 0, 0] }],
    Array.from({ length: 17 }, (_, i) => ({ id: String(i), name: 'Bandlid', position: [0, 0, 0] })),
    Array.from({ length: 2 }, () => ({ id: 'duplicate', name: 'Bandlid', position: [0, 0, 0] })),
  ])('rejects invalid band member data %j', (bandMembers) => {
    expect(() => assertShowDocument({ ...initialShow, bandMembers })).toThrow('bandMembers')
  })
  it('roundtrips schema 1 shows and version snapshots without changing authoring data', () => {
    const version = createVersion(initialShow, 'Eerste versie')
    const bundle = createShowPackage(initialShow, [version])
    expect(parseShowPackage(JSON.stringify(bundle))).toEqual(bundle)
    expect(parseShowDocument(JSON.stringify(initialShow))).toEqual(initialShow)
  })

  it.each([
    [
      'missing groups',
      (show: any) => {
        delete show.groups
      },
    ],
    [
      'malformed fixture',
      (show: any) => {
        show.fixtures[0] = null
      },
    ],
    [
      'invalid position',
      (show: any) => {
        show.fixtures[0].position = [0, '1', 2]
      },
    ],
    [
      'nonfinite aim',
      (show: any) => {
        show.fixtures[0].aim[0] = Infinity
      },
    ],
    [
      'invalid camera',
      (show: any) => {
        show.camera.position = {}
      },
    ],
    [
      'invalid fov',
      (show: any) => {
        show.camera.fov = 180
      },
    ],
    [
      'unknown group',
      (show: any) => {
        show.fixtures[0].groupId = 'missing'
      },
    ],
    [
      'duplicate group',
      (show: any) => {
        show.groups.push(show.groups[0])
      },
    ],
    [
      'unknown palette',
      (show: any) => {
        show.programs[0].defaultColorProfileId = 'missing'
      },
    ],
    [
      'unknown program',
      (show: any) => {
        show.looks[0].programId = 'missing'
      },
    ],
    [
      'unknown active look',
      (show: any) => {
        show.activeLookId = 'missing'
      },
    ],
    [
      'unknown control target',
      (show: any) => {
        show.controlSurface.bindings[0].targetId = 'missing'
      },
    ],
    [
      'invalid color',
      (show: any) => {
        show.colorProfiles[0].primary = 'red'
      },
    ],
    [
      'fractional patch',
      (show: any) => {
        show.fixtures[0].patch.address = 1.5
      },
    ],
    [
      'oversized name',
      (show: any) => {
        show.name = 'x'.repeat(1025)
      },
    ],
    [
      'too many palettes',
      (show: any) => {
        show.colorProfiles = Array.from({ length: 33 }, (_, i) => ({ ...show.colorProfiles[0], id: String(i) }))
      },
    ],
  ])('rejects %s before it reaches rendering', (_, mutate) => {
    const show = structuredClone(initialShow)
    mutate(show)
    expect(() => assertShowDocument(show)).toThrow('Ongeldig showbestand')
  })

  it('allows unpatched fixtures and unknown catalog profiles for later library resolution', () => {
    const show = structuredClone(initialShow)
    delete show.fixtures[0].patch
    show.fixtures[0].profileId = 'future-fixture'
    expect(() => assertShowDocument(show)).not.toThrow()
  })

  it('accepts the supported 32-item boundary and does not mutate snapshots', () => {
    const show = structuredClone(initialShow)
    while (show.colorProfiles.length < 32)
      show.colorProfiles.push({ ...show.colorProfiles[0], id: `extra-${show.colorProfiles.length}` })
    expect(() => assertShowDocument(show)).not.toThrow()
    const version = createVersion(show, 'Onafhankelijke snapshot')
    show.fixtures[0].position[1] = 3
    expect(version.show.fixtures[0].position[1]).toBe(initialShow.fixtures[0].position[1])
  })

  it('rejects malformed snapshots, even when the active show is valid', () => {
    const bundle = createShowPackage(initialShow, [createVersion(initialShow, 'Versie')])
    bundle.versions[0].show.fixtures[0].position = [0, NaN, 0]
    expect(() => parseShowPackage(JSON.stringify(bundle))).toThrow('fixtures.0.position')
  })

  it('rejects malformed, duplicate, and excessive version metadata', () => {
    const bundle = createShowPackage(initialShow, [createVersion(initialShow, 'Versie')])
    bundle.versions[0].createdAt = 'geen datum'
    expect(() => parseShowPackage(JSON.stringify(bundle))).toThrow('ongeldige versie')
    bundle.versions[0].createdAt = new Date().toISOString()
    bundle.versions.push(bundle.versions[0])
    expect(() => parseShowPackage(JSON.stringify(bundle))).toThrow('ongeldige versie')
    bundle.versions = Array(101).fill(bundle.versions[0])
    expect(() => parseShowPackage(JSON.stringify(bundle))).toThrow()
  })

  it('bounds parsing and reports malformed JSON or root values cleanly', () => {
    expect(() => parseShowDocument(' '.repeat(MAX_SHOW_JSON_LENGTH + 1))).toThrow('bestandsgrootte')
    for (const raw of ['null', '[]', '{', 'false']) {
      expect(() => parseShowPackage(raw)).toThrow()
      expect(() => parseShowDocument(raw)).toThrow()
    }
  })
})
