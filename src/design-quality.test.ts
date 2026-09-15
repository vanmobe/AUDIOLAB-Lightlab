import { describe, expect, it } from 'vitest'
import { designQualityWarnings } from './design-quality'
import { initialShow } from './seed'
import type { DesignProposal } from './design-proposal'

const proposal = (): DesignProposal => ({ provider: 'test', summary: '', colorProfiles: [], programs: [], looks: [] })
describe('advisory design quality checks', () => {
  it('flags movement names in palettes without banning valid mood names', () => {
    const p = proposal()
    p.colorProfiles = [{ ...initialShow.colorProfiles[0], name: 'Purple Chase' }, { ...initialShow.colorProfiles[1], name: 'Warm amber' }]
    expect(designQualityWarnings(p, initialShow)).toHaveLength(1)
  })
  it('finds identical patterns even if group ordering and names differ', () => {
    const p = proposal()
    p.programs = [initialShow.programs[0], { ...initialShow.programs[0], id: 'copy', name: 'Anders', targetGroupIds: [...initialShow.programs[0].targetGroupIds].reverse() }]
    expect(designQualityWarnings(p, initialShow)[0]).toContain('herhaalt')
  })
  it('warns on low diversity in a collection, not a single requested pattern', () => {
    const p = proposal()
    p.programs = [initialShow.programs[0]]
    expect(designQualityWarnings(p, initialShow)).toEqual([])
    p.programs = Array.from({ length: 4 }, (_, i) => ({ ...initialShow.programs[0], effect: 'pulse', id: String(i), rateBeats: i + 1 }))
    expect(designQualityWarnings(p, initialShow)).toEqual([expect.stringContaining('herhaalt'), expect.stringContaining('herhaalt'), expect.stringContaining('herhaalt'), expect.stringContaining('Weinig patroonvariatie')])
  })
  it('detects duplicate Look combinations while ignoring legacy animation target selections', () => {
    const p = proposal()
    p.looks = [initialShow.looks[0], { ...initialShow.looks[0], id: 'copy' }]
    p.programs = [{ ...initialShow.programs[0], targetGroupIds: [] }]
    expect(designQualityWarnings(p, initialShow)).toHaveLength(1)
  })
  it('does not count ignored recipe directions as creative diversity', () => {
    const p = proposal()
    p.programs = (['forward', 'reverse', 'bounce', 'inward'] as const).map((direction, i) => ({
      ...initialShow.programs[0], id: String(i), pattern: { version: 1, floor: .2, steps: [
        { selection: 'random', direction, envelope: 'fade-out', width: 1, trail: 0, level: 1, weight: 1 },
      ] },
    }))
    expect(designQualityWarnings(p, initialShow)).toContainEqual(expect.stringContaining('Weinig patroonvariatie'))
  })
  it('does not collapse different layered Looks sharing the same legacy pair', () => {
    const p = proposal()
    const layer = { groupId: 'front', mode: 'static' as const, programId: null, colorProfileId: null, intensity: 1 }
    p.looks = [{ ...initialShow.looks[0], layers: [layer] }, { ...initialShow.looks[0], id: 'other', layers: [{ ...layer, intensity: .5 }] }]
    expect(designQualityWarnings(p, initialShow)).toEqual([])
  })
  it('warns about stage-lighting palette and Look balance risks', () => {
    const p = proposal()
    p.colorProfiles = [{ ...initialShow.colorProfiles[0], name: 'Rood groen', primary: '#ff0000', accent: '#00ff00' }]
    p.looks = [{
      ...initialShow.looks[0], id: 'flat', name: 'Alles gelijk', layers: initialShow.groups.map(group => ({
        groupId: group.id, mode: group.id === 'effects' ? 'static' as const : 'animation' as const,
        programId: group.id === 'effects' ? null : initialShow.programs[1].id, colorProfileId: null, intensity: group.id === 'front' ? .2 : group.id === 'effects' ? .7 : 1, rateBeats: 1, offsetBeats: 0,
      })),
    }]
    expect(designQualityWarnings(p, initialShow)).toEqual([
      expect.stringContaining('rood en groen'),
      expect.stringContaining('frontlicht'),
      expect.stringContaining('haze'),
      expect.stringContaining('hetzelfde patroon'),
    ])
  })
})
