import { describe, expect, it } from 'vitest'
import { initialShow } from './seed'
import { designConfigurationError, designDefaults, fingerprint, proposalCandidate, type DesignProposal } from './design-proposal'
import { createVersion } from './show-package'
import { type ShowDocument } from './domain'
import { type Pattern } from './pattern-language'
import { defaultBandProfile } from './band-profile'
const opts = { ...designDefaults, scope: 'colorProfiles' as const, profileCount: 1 }
const layers = (programId: string) => initialShow.groups.map(group => ({ groupId: group.id, mode: 'animation' as const, programId, colorProfileId: null, intensity: 1, rateBeats: 1, offsetBeats: 0 }))
function proposal(): DesignProposal { return { provider: 'test', summary: 'nieuw', colorProfiles: [{ ...initialShow.colorProfiles[0], id: 'generated', name: 'Generated' }], programs: [], looks: [] } }
const pattern = (variant = 0): Pattern => ({ version: 1, floor: .2, steps: [{ selection: 'moving', direction: (['forward', 'reverse', 'bounce', 'inward'] as const)[Math.floor(variant / 8) % 4], envelope: 'hold', width: variant % 8 + 1, trail: .4, level: 1, weight: 1 }] })
describe('design proposal acceptance boundary', () => {
  it('allows complete-collection requests to leave individual counts at zero', () => {
    expect(designConfigurationError(initialShow, { ...designDefaults, profileCount: 0, programCount: 2, lookCount: 0 })).toBe('')
    expect(designConfigurationError(initialShow, { ...designDefaults, profileCount: 0, programCount: 0, lookCount: 0 })).toContain('minstens')
    expect(designConfigurationError(initialShow, { ...designDefaults, scope: 'programs', profileCount: 0, programCount: 0, lookCount: 0 })).toContain('1')
    const p = proposal(); p.colorProfiles = []; p.programs = [{ ...initialShow.programs[0], id: 'only-program', rateBeats: 1, pattern: pattern() }]
    const next = proposalCandidate(initialShow, p, { ...designDefaults, profileCount: 0, programCount: 1, lookCount: 0 }, fingerprint(initialShow))
    expect(next.programs.at(-1)?.id).toBe('only-program')
    expect(next.colorProfiles).toEqual(initialShow.colorProfiles)
    expect(next.looks).toEqual(initialShow.looks)
  })
  it('allows up to 32 palette suggestions even when existing slots are occupied', () => {
    const p = proposal()
    p.colorProfiles = Array.from({ length: 32 }, (_, i) => ({ ...initialShow.colorProfiles[0], id: `idea-${i}`, name: `Idea ${i}`, primary: `#${(0x100000 + i).toString(16).slice(-6)}` }))
    expect(designConfigurationError(initialShow, { ...designDefaults, scope: 'colorProfiles', profileCount: 32 })).toBe('')
    const candidate = proposalCandidate(initialShow, p, { ...designDefaults, scope: 'colorProfiles', profileCount: 32 }, fingerprint(initialShow))
    expect(candidate.colorProfiles).toHaveLength(initialShow.colorProfiles.length + 32)
  })
  it('replaces only scoped palettes and keeps existing Looks valid', () => {
    const p = proposal()
    p.colorProfiles = [
      { ...initialShow.colorProfiles[0], id: 'new-warm', name: 'New warm', primary: '#123456' },
      { ...initialShow.colorProfiles[1], id: 'new-cool', name: 'New cool', primary: '#abcdef' },
    ]
    const next = proposalCandidate(initialShow, p, { ...designDefaults, scope: 'colorProfiles', replace: true, profileCount: 2, programCount: 0, lookCount: 0 }, fingerprint(initialShow))
    expect(next.colorProfiles.map(item => item.id)).toEqual(['new-warm', 'new-cool'])
    expect(next.programs.map(item => item.defaultColorProfileId).every(id => next.colorProfiles.some(color => color.id === id))).toBe(true)
    expect(next.looks.map(item => item.colorProfileId).every(id => next.colorProfiles.some(color => color.id === id))).toBe(true)
    expect(next.programs).toHaveLength(initialShow.programs.length)
    expect(next.looks).toHaveLength(initialShow.looks.length)
  })
  it('enforces band complexity for new recipes without changing stored patterns', () => {
    const show: ShowDocument = { ...initialShow, bandProfile: { ...defaultBandProfile, complexity: 'simple' } }
    const p = proposal(); p.colorProfiles = []
    p.programs = [{ ...initialShow.programs[0], id: 'band-recipe', pattern: { ...pattern(), steps: Array.from({ length: 3 }, () => pattern().steps[0]) } }]
    const options = { ...designDefaults, scope: 'programs' as const, programCount: 1 }
    expect(() => proposalCandidate(show, p, options, fingerprint(show))).toThrow('complexer')
    p.programs[0].pattern!.steps = p.programs[0].pattern!.steps.slice(0, 2)
    const next = proposalCandidate(show, p, options, fingerprint(show))
    expect(next.programs.slice(0, initialShow.programs.length)).toEqual(initialShow.programs)
    expect(next.bandProfile).toEqual(show.bandProfile)
  })
  it('checks animated group speed for new Looks, while retaining existing Look timing', () => {
    const show: ShowDocument = { ...initialShow, bandProfile: { ...defaultBandProfile, motion: 'slow' } }
    const p = proposal(); p.colorProfiles = []
    p.looks = [{ ...initialShow.looks[0], id: 'slow-band', layers: layers(initialShow.programs[1].id) }]
    const options = { ...designDefaults, scope: 'looks' as const, lookCount: 1 }
    expect(() => proposalCandidate(show, p, options, fingerprint(show))).toThrow('groepssnelheid')
    p.looks[0].layers = p.looks[0].layers!.map(layer => ({ ...layer, rateBeats: 16 }))
    const next = proposalCandidate(show, p, options, fingerprint(show))
    expect(next.looks.slice(0, initialShow.looks.length)).toEqual(initialShow.looks)
    expect(next.looks.at(-1)?.layers?.[0].rateBeats).toBe(16)
    expect(() => proposalCandidate({ ...show, bandProfile: { ...show.bandProfile!, motion: 'fast' } }, p, options, fingerprint(show))).toThrow('gewijzigd')
  })
  it('accepts distinct recipes with the same fallback effect and preserves their data', () => {
    const p = proposal(); p.colorProfiles = []
    p.programs = [0, 8].map(index => ({ ...initialShow.programs[0], id: `moving-${index}`, name: `Venster ${index}`, pattern: pattern(index) }))
    const next = proposalCandidate(initialShow, p, { ...designDefaults, scope: 'programs', programCount: 2 }, fingerprint(initialShow))
    expect(next.programs.slice(-2)).toEqual(p.programs)
    expect(next.programs.slice(-2).every(program => program.effect === 'static')).toBe(true)
  })
  it('requires a real validated recipe for each newly generated program', () => {
    const p = proposal(); p.colorProfiles = []
    p.programs = [{ ...initialShow.programs[0], id: 'name-only-motion', name: 'Crazy multi-wave' }]
    const options = { ...designDefaults, scope: 'programs' as const, programCount: 1 }
    expect(() => proposalCandidate(initialShow, p, options, fingerprint(initialShow))).toThrow('Patroon')
    p.programs[0].pattern = pattern()
    p.programs[0].pattern.steps[0].weight = 0
    expect(() => proposalCandidate(initialShow, p, options, fingerprint(initialShow))).toThrow('patroonstap')
  })
  it('rejects recipes disguised by ignored fields or proportional weights', () => {
    const p = proposal(); p.colorProfiles = []
    const first = pattern()
    first.steps[0].selection = 'all'
    const second = structuredClone(first)
    Object.assign(second.steps[0], { direction: 'reverse', width: 8, trail: 1, weight: 8 })
    p.programs = [first, second].map((recipe, index) => ({ ...initialShow.programs[0], id: `disguised-${index}`, pattern: recipe }))
    expect(() => proposalCandidate(initialShow, p, { ...designDefaults, scope: 'programs', programCount: 2 }, fingerprint(initialShow))).toThrow('Dubbel patroon')
  })
  it('snapshots old Look timing before an AI pattern revision changes legacy metadata', () => {
    const p = proposal(); p.colorProfiles = []
    p.programs = [{ ...initialShow.programs[1], effect: 'wave', rateBeats: 1, pattern: pattern() }]
    const next = proposalCandidate(initialShow, p, { ...designDefaults, scope: 'programs', revision: true, programCount: 1 }, fingerprint(initialShow))
    expect(next.looks[1].layers?.find(layer => layer.groupId === 'wash')?.rateBeats).toBe(.5)
    expect(initialShow.looks[1].layers).toBeUndefined()
  })
  it('rejects duplicate recipes regardless of names, fallback effects, beat durations or group targets', () => {
    const options = { ...designDefaults, scope: 'programs' as const, programCount: 32 }
    const show = structuredClone(initialShow)
    show.programs[2].pattern = pattern()
    for (const rateBeats of [1, 8]) {
      const p = proposal(); p.colorProfiles = []
      p.programs = [{ ...show.programs[2], id: 'duplicate-pulse', name: 'Completely different', effect: 'wave', rateBeats, targetGroupIds: [] }]
      expect(() => proposalCandidate(show, p, options, fingerprint(show))).toThrow('Dubbel patroon')
    }
    const p = proposal(); p.colorProfiles = []
    p.programs = [0, 1].map(i => ({ ...initialShow.programs[0], id: `wave-${i}`, effect: 'wave', rateBeats: 1, pattern: pattern() }))
    expect(() => proposalCandidate(initialShow, p, options, fingerprint(initialShow))).toThrow('Dubbel patroon')
  })
  it('accepts fewer unique patterns and zero additions only when storage capacity is full', () => {
    const options = { ...designDefaults, scope: 'programs' as const, programCount: 32 }
    expect(designConfigurationError(initialShow, options)).toBe('')
    const p = proposal(); p.colorProfiles = []
    p.programs = [{ ...initialShow.programs[0], id: 'wave', effect: 'wave', rateBeats: 1, pattern: pattern() }]
    expect(proposalCandidate(initialShow, p, options, fingerprint(initialShow)).programs).toHaveLength(4)
    p.programs = []
    expect(() => proposalCandidate(initialShow, p, options, fingerprint(initialShow))).toThrow('aantal')
    const full: ShowDocument = { ...initialShow, programs: [...initialShow.programs, ...Array.from({ length: 29 }, (_, index) => ({ ...initialShow.programs[0], id: `recipe-${index}`, pattern: pattern(index) }))] }
    expect(proposalCandidate(full, p, options, fingerprint(full)).programs).toEqual(full.programs)
  })
  it('rejects new animation-owned timing and inherited timing in newly proposed Looks', () => {
    const p = proposal(); p.colorProfiles = []
    p.programs = [{ ...initialShow.programs[0], id: 'wave', effect: 'wave', rateBeats: 8, pattern: pattern() }]
    expect(() => proposalCandidate(initialShow, p, { ...opts, scope: 'programs', programCount: 1 }, fingerprint(initialShow))).toThrow('beatduur per groep')
    p.programs = []
    p.looks = [{ ...initialShow.looks[0], id: 'bad-look', layers: layers(initialShow.programs[0].id).map(layer => ({ ...layer, rateBeats: null })) }]
    expect(() => proposalCandidate(initialShow, p, { ...opts, scope: 'looks', lookCount: 1 }, fingerprint(initialShow))).toThrow('eigen beatduur')
  })
  it('replaces the entire collection at requested counts, preserving setup and removing obsolete control targets', () => {
    const p = proposal()
    p.programs = [{ ...initialShow.programs[0], id: 'replacement-program', defaultColorProfileId: 'generated', pattern: pattern() }]
    p.looks = [{ id: 'replacement-look', name: 'New look', programId: 'replacement-program', colorProfileId: 'generated', layers: layers('replacement-program') }]
    const options = { ...designDefaults, replace: true, profileCount: 1, programCount: 1, lookCount: 1 }
    const show = structuredClone(initialShow)
    show.controlSurface.bindings.push({ id: 'locked-color', label: 'Oude kleur', action: 'color-lock', targetId: show.colorProfiles[0].id }, { id: 'free-color-lock', label: 'Kleur vasthouden', action: 'color-lock' })
    const before = fingerprint(show)
    const next = proposalCandidate(show, p, options, before)
    expect([next.colorProfiles.length, next.programs.length, next.looks.length]).toEqual([1, 1, 1])
    expect(next.activeLookId).toBe('replacement-look')
    for (const key of ['fixtures', 'groups', 'routes', 'camera', 'sync', 'bandMembers'] as const) expect(next[key]).toEqual(initialShow[key])
    expect(next.controlSurface.bindings).toEqual(show.controlSurface.bindings.filter(binding => binding.action !== 'look' && binding.id !== 'locked-color'))
    expect(fingerprint(show)).toBe(before)
    p.programs[0].defaultColorProfileId = initialShow.colorProfiles[0].id
    expect(() => proposalCandidate(show, p, options, before)).toThrow('onbekende')
  })
  it('allows replacement up to 32 regardless of existing counts and supports scoped replacement', () => {
    const options = { ...designDefaults, replace: true, profileCount: 32, programCount: 32, lookCount: 32 }
    expect(designConfigurationError(initialShow, options)).toBe('')
    expect(designConfigurationError(initialShow, { ...options, scope: 'colorProfiles' })).toBe('')
    expect(designConfigurationError(initialShow, { ...options, profileCount: 33 })).not.toBe('')
    const full: DesignProposal = { provider: 'test', summary: 'replace',
      colorProfiles: Array.from({ length: 32 }, (_, i) => ({ ...initialShow.colorProfiles[0], id: `c-${i}` })),
      programs: Array.from({ length: 32 }, (_, i) => ({ ...initialShow.programs[0], name: `Patroon ${i}`, rateBeats: 1, id: `p-${i}`, defaultColorProfileId: `c-${i}`, pattern: pattern(i) })),
      looks: Array.from({ length: 32 }, (_, i) => ({ id: `l-${i}`, name: `Look ${i}`, programId: `p-${i}`, colorProfileId: `c-${i}`, layers: layers(`p-${i}`) })),
    }
    const replaced = proposalCandidate(initialShow, full, options, fingerprint(initialShow))
    expect([replaced.colorProfiles.length, replaced.programs.length, replaced.looks.length]).toEqual([32, 32, 32])
    for (const invalid of [{ ...options, revision: true }]) {
      expect(() => proposalCandidate(initialShow, proposal(), invalid, fingerprint(initialShow))).toThrow('Vervangen')
    }
  })
  it('applies actual generated data without touching fixture configuration and snapshots candidate', () => {
    const next = proposalCandidate(initialShow, proposal(), opts, fingerprint(initialShow))
    expect(next.colorProfiles).toHaveLength(initialShow.colorProfiles.length + 1)
    expect(next.fixtures).toEqual(initialShow.fixtures)
    expect(initialShow.colorProfiles.some(c => c.id === 'generated')).toBe(false)
    const saved = createVersion(next, 'accepted')
    next.colorProfiles[0].name = 'later edit'
    expect(saved.show.colorProfiles[0].name).not.toBe('later edit')
  })
  it('rejects stale proposals', () => expect(() => proposalCandidate({ ...initialShow, name: 'changed' }, proposal(), opts, fingerprint(initialShow))).toThrow('gewijzigd'))
  it('rejects wrong counts, overwrite, malformed summary and invalid colors', () => {
    expect(() => proposalCandidate(initialShow, proposal(), { ...opts, profileCount: 2 }, fingerprint(initialShow))).toThrow('aantal')
    const p = proposal(); p.colorProfiles[0].id = initialShow.colorProfiles[0].id
    expect(() => proposalCandidate(initialShow, p, opts, fingerprint(initialShow))).toThrow('overschrijft')
    expect(() => proposalCandidate(initialShow, { ...proposal(), summary: {} }, opts, fingerprint(initialShow))).toThrow('uitleg')
    const color = proposal(); color.colorProfiles[0].primary = 'red'
    expect(() => proposalCandidate(initialShow, color, opts, fingerprint(initialShow))).toThrow('kleuren')
  })
  it('rejects locked collection edits and dangling references', () => {
    const p = proposal(); p.looks = [{ id: 'newlook', name: 'x', programId: 'absent', colorProfileId: 'generated' }]
    expect(() => proposalCandidate(initialShow, p, opts, fingerprint(initialShow))).toThrow('aantal')
    expect(() => proposalCandidate(initialShow, { ...p, colorProfiles: [] }, { ...opts, scope: 'looks', lookCount: 1 }, fingerprint(initialShow))).toThrow('onbekende')
  })
  it('rejects no-op revisions and applies scoped real revisions', () => {
    const p = proposal(); p.colorProfiles = [structuredClone(initialShow.colorProfiles[0])]
    expect(() => proposalCandidate(initialShow, p, { ...opts, revision: true }, fingerprint(initialShow))).toThrow('niets')
    p.colorProfiles[0].primary = '#123456'
    const next = proposalCandidate(initialShow, p, { ...opts, revision: true }, fingerprint(initialShow))
    expect(next.colorProfiles.find(c => c.id === p.colorProfiles[0].id)?.primary).toBe('#123456')
    expect(next.programs).toEqual(initialShow.programs)
  })
  it('rejects a recipe revision that changes nothing', () => {
    const show = structuredClone(initialShow)
    show.programs[0].pattern = pattern()
    const p = proposal(); p.colorProfiles = []; p.programs = [structuredClone(show.programs[0])]
    expect(() => proposalCandidate(show, p, { ...opts, scope: 'programs', programCount: 1, revision: true }, fingerprint(show))).toThrow('niets')
  })
  it('allows oversized idea lists but selection enforces the persisted 32 item total', () => {
    const p = proposal(); p.colorProfiles = Array.from({ length: 31 }, (_, i) => ({ ...p.colorProfiles[0], id: 'new-' + i }))
    expect(proposalCandidate(initialShow, p, { ...opts, profileCount: 31 }, fingerprint(initialShow)).colorProfiles).toHaveLength(initialShow.colorProfiles.length + 31)
  })
  it('requires complete AI layers while preserving saved legacy Looks during unrelated edits', () => {
    const p = proposal(); p.colorProfiles = []
    p.looks = [{ ...initialShow.looks[0], id: 'new-look' }]
    const options = { ...opts, scope: 'looks' as const, lookCount: 1 }
    expect(() => proposalCandidate(initialShow, p, options, fingerprint(initialShow))).toThrow('alle groepen')
    p.looks[0].layers = layers(initialShow.programs[0].id)
    expect(proposalCandidate(initialShow, p, options, fingerprint(initialShow)).looks[0]).toEqual(initialShow.looks[0])
    p.looks[0].layers[0].programId = 'missing'
    expect(() => proposalCandidate(initialShow, p, options, fingerprint(initialShow))).toThrow()
  })
  it('preserves proposed per-group timing and rejects out-of-range model timing', () => {
    const p = proposal(); p.colorProfiles = []
    p.looks = [{ ...initialShow.looks[0], id: 'timed-look', layers: layers(initialShow.programs[1].id).map(layer => ({ ...layer, rateBeats: 8, offsetBeats: 2 })) }]
    const options = { ...opts, scope: 'looks' as const, lookCount: 1 }
    const next = proposalCandidate(initialShow, p, options, fingerprint(initialShow))
    expect(next.looks.at(-1)?.layers?.[0]).toMatchObject({ rateBeats: 8, offsetBeats: 2 })
    p.looks[0].layers![0].rateBeats = 0
    expect(() => proposalCandidate(initialShow, p, options, fingerprint(initialShow))).toThrow()
  })
  it('accepts distinct fixed layer palettes and persists custom recipe names', () => {
    const p = proposal(); p.colorProfiles = []
    p.programs = [{ ...initialShow.programs[0], id: 'new-program', name: 'Dubbele slinger met lichtstaart', effect: 'wave', rateBeats: 1, pattern: pattern() }]
    const next = proposalCandidate(initialShow, p, { ...opts, scope: 'programs', programCount: 1 }, fingerprint(initialShow))
    expect(next.programs.at(-1)?.name).toBe('Dubbele slinger met lichtstaart')
    p.programs = []; p.looks = [{ ...initialShow.looks[0], id: 'new-look', layers: layers(initialShow.programs[0].id) }]
    p.looks[0].layers![0].colorProfileId = initialShow.colorProfiles[1].id
    expect(proposalCandidate(initialShow, p, { ...opts, scope: 'looks', lookCount: 1 }, fingerprint(initialShow)).looks.at(-1)?.layers?.[0].colorProfileId).toBe(initialShow.colorProfiles[1].id)
  })
})
