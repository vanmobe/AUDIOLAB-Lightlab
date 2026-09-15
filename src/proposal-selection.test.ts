import { describe, expect, it } from 'vitest'
import { initialShow } from './seed'
import { designDefaults, fingerprint, type DesignProposal } from './design-proposal'
import { emptySelection, resolveProposalSelection, selectedProposalCandidate } from './proposal-selection'

const options = { ...designDefaults, scope: 'colorProfiles' as const, profileCount: 2 }
const proposal = (): DesignProposal => ({ provider: 'test', summary: 'ideas', colorProfiles: [1, 2].map(n => ({ ...initialShow.colorProfiles[0], id: `idea-${n}`, name: `Idea ${n}`, primary: n === 1 ? '#123456' : '#abcdef' })), programs: [], looks: [] })
describe('selective idea acceptance', () => {
  it('adds only selected palettes, preserving setup, bindings and existing collection', () => {
    const show = structuredClone(initialShow), before = fingerprint(show)
    const next = selectedProposalCandidate(show, proposal(), options, before, { ...emptySelection(), colorProfiles: ['idea-2'] })
    expect(next.colorProfiles).toEqual([...show.colorProfiles, proposal().colorProfiles[1]])
    expect(next.controlSurface).toEqual(show.controlSurface)
    expect(next.fixtures).toEqual(show.fixtures)
    expect(next.looks).toEqual(show.looks)
    expect(fingerprint(show)).toBe(before)
  })
  it('rejects empty/stale selections and still validates unselected provider data', () => {
    const p = proposal(), base = fingerprint(initialShow)
    expect(() => selectedProposalCandidate(initialShow, p, options, base, emptySelection())).toThrow('Selecteer')
    expect(() => selectedProposalCandidate({ ...initialShow, name: 'changed' }, p, options, base, { ...emptySelection(), colorProfiles: ['idea-1'] })).toThrow('gewijzigd')
    p.colorProfiles[1].primary = 'invalid'
    expect(() => selectedProposalCandidate(initialShow, p, options, base, { ...emptySelection(), colorProfiles: ['idea-1'] })).toThrow('kleuren')
  })
  it('derives transitive dependencies and releases them when the root is deselected', () => {
    const p = proposal()
    p.programs = [{ ...initialShow.programs[0], id: 'pattern', defaultColorProfileId: 'idea-2' }]
    p.looks = [{ ...initialShow.looks[0], id: 'look', programId: 'pattern', colorProfileId: 'idea-1', layers: [] }]
    expect(resolveProposalSelection(p, { ...emptySelection(), looks: ['look'] })).toEqual({ looks: ['look'], programs: ['pattern'], colorProfiles: ['idea-1', 'idea-2'] })
    expect(resolveProposalSelection(p, emptySelection())).toEqual(emptySelection())
    expect(resolveProposalSelection(p, { ...emptySelection(), programs: ['pattern'] }).colorProfiles).toEqual(['idea-2'])
  })
  it('revises only selected existing palettes', () => {
    const p = proposal()
    p.colorProfiles = initialShow.colorProfiles.slice(0, 2).map(item => ({ ...item, primary: '#123456' }))
    const next = selectedProposalCandidate(initialShow, p, { ...options, revision: true }, fingerprint(initialShow), { ...emptySelection(), colorProfiles: [p.colorProfiles[0].id] })
    expect(next.colorProfiles.find(item => item.id === p.colorProfiles[0].id)?.primary).toBe('#123456')
    expect(next.colorProfiles.find(item => item.id === p.colorProfiles[1].id)).toEqual(initialShow.colorProfiles[1])
  })
  it('does not consume a version for an unchanged revision subset', () => {
    const p = proposal()
    p.colorProfiles = initialShow.colorProfiles.slice(0, 2).map((item, index) => ({ ...item, primary: index ? '#123456' : item.primary }))
    expect(() => selectedProposalCandidate(initialShow, p, { ...options, revision: true }, fingerprint(initialShow), { ...emptySelection(), colorProfiles: [p.colorProfiles[0].id] })).toThrow('wijzigen niets')
  })
  it('can append only a palette from a replacement proposal without replacing bindings or active Look', () => {
    const p = proposal()
    p.programs = [{ ...initialShow.programs[0], id: 'replacement-pattern', rateBeats: 1, defaultColorProfileId: 'idea-1', pattern: { version: 1, floor: .2, steps: [{ selection: 'all', direction: 'forward', envelope: 'hold', width: 1, trail: 0, level: 1, weight: 1 }] } }]
    p.looks = [{ id: 'replacement-look', name: 'Idea Look', programId: 'replacement-pattern', colorProfileId: 'idea-1', layers: initialShow.groups.map(group => ({ groupId: group.id, mode: 'static', programId: null, colorProfileId: null, intensity: 1, rateBeats: 1 })) }]
    const next = selectedProposalCandidate(initialShow, p, { ...designDefaults, replace: true, profileCount: 2, programCount: 1, lookCount: 1 }, fingerprint(initialShow), { ...emptySelection(), colorProfiles: ['idea-2'] })
    expect(next.activeLookId).toBe(initialShow.activeLookId)
    expect(next.controlSurface).toEqual(initialShow.controlSurface)
    expect(next.programs).toEqual(initialShow.programs)
    expect(next.colorProfiles).toHaveLength(initialShow.colorProfiles.length + 1)
  })
  it('uses selection as the replacement set for scoped palette replacement', () => {
    const p = proposal()
    const next = selectedProposalCandidate(initialShow, p, { ...options, replace: true }, fingerprint(initialShow), { ...emptySelection(), colorProfiles: ['idea-2'] })
    expect(next.colorProfiles).toEqual([p.colorProfiles[1]])
    expect(next.programs.every(program => program.defaultColorProfileId === 'idea-2')).toBe(true)
    expect(next.looks.every(look => look.colorProfileId === 'idea-2')).toBe(true)
  })
})
