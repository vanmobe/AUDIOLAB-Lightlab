import { describe, expect, it } from 'vitest'
import { animationEffects, animationLabel, evaluateFrame, resolveLookLayers, type LookLayer, type RuntimeState } from './domain'
import { initialShow } from './seed'
import { fixtureProfiles } from './fixtures'
import { assertShowDocument } from './show-validation'

const layer = (groupId: string, mode: LookLayer['mode'], programId: string | null = null, colorProfileId: string | null = null, intensity = 1): LookLayer => ({ groupId, mode, programId, colorProfileId, intensity })
function layeredShow() {
  const show = structuredClone(initialShow)
  show.looks[0].layers = [layer('front', 'static'), layer('wash', 'animation', 'pulse')]
  return show
}
const state: RuntimeState = { mode: 'automation', activeLookId: initialShow.looks[0].id }
const frame = (show = layeredShow(), at = 0, runtime = state) => evaluateFrame(show, fixtureProfiles, runtime, at)

describe('group layers in Looks', () => {
  it('keeps fronts steady while wash pulses, without using legacy program targets', () => {
    const show = layeredShow()
    show.programs.find(p => p.id === 'pulse')!.targetGroupIds = ['back']
    const first = frame(show, 0), later = frame(show, .25)
    const front = first.fixtures.find(f => f.fixtureId === 'front-1')!
    expect(front.intensity).toBeCloseTo(.8 * .85)
    expect(later.fixtures.find(f => f.fixtureId === 'front-1')).toEqual(front)
    expect(front.color).toBe('#fff1d6')
    expect(later.fixtures[0].intensity).toBeGreaterThan(first.fixtures[0].intensity)
    expect(first.fixtures.find(f => f.fixtureId === 'adj-5')!.intensity).toBe(0)
  })
  it('fixed palettes bypass color lock; following layers inherit it', () => {
    const show = layeredShow()
    show.looks[0].layers = [layer('wash', 'static', null, 'warm'), layer('back', 'static')]
    const locked = frame(show, 0, { ...state, colorLockId: 'neon' })
    expect(locked.fixtures[0].color).toBe(show.colorProfiles[1].accent)
    expect(locked.fixtures[4].color).toBe(show.colorProfiles[0].primary)
    expect(locked.fixtures[0].intensity).toBeCloseTo(.75 * .85)
    expect(locked.fixtures[4].intensity).toBeCloseTo(.8 * .9)
  })
  it('multiplies layer intensity, group master and profile limit, including zero masters', () => {
    const show = layeredShow()
    show.looks[0].layers = [layer('wash', 'static', null, null, .5)]
    expect(frame(show).fixtures[0].intensity).toBeCloseTo(.5 * .75 * .85)
    show.groups.find(g => g.id === 'wash')!.intensity = 0
    expect(frame(show).fixtures[0].intensity).toBe(0)
  })
  it('safety and blackout override off layers, palettes and layer intensity', () => {
    const show = layeredShow()
    show.looks[0].layers = [layer('front', 'off', null, 'neon', 0), layer('wash', 'static')]
    const safety = frame(show, 0, { ...state, mode: 'safety' })
    expect(safety.fixtures.find(f => f.fixtureId === 'front-1')!.intensity).toBeCloseTo(.8 * .8)
    expect(safety.fixtures[0].intensity).toBe(0)
    expect(frame(show, 0, { ...state, mode: 'blackout' }).fixtures.every(f => f.intensity === 0 && f.haze === 0)).toBe(true)
  })
  it('freezes all animation layers on the same held beat', () => {
    const show = layeredShow()
    show.looks[0].layers!.push(layer('back', 'animation', 'chorus'))
    const frozen = { ...state, mode: 'static' as const, heldAtBeats: .37 }
    expect(frame(show, 10, frozen).fixtures).toEqual(frame(show, 100, frozen).fixtures)
  })
  it('runs one sequence across shared animation groups, ignoring legacy targets', () => {
    const show = layeredShow()
    show.programs.find(p => p.id === 'pulse')!.effect = 'sequence'
    show.programs.find(p => p.id === 'pulse')!.targetGroupIds = ['effects']
    show.looks[0].layers = [layer('wash', 'animation', 'pulse'), layer('front', 'animation', 'pulse')]
    // A separate sequence per group would incorrectly light two points at once.
    for (const at of [0, .25, .5, .75]) {
      expect(frame(show, at).fixtures.filter(f => f.intensity > 0)).toHaveLength(1)
    }
  })
  it.each(animationEffects)('converting legacy $id retains frames, ordering and per-head behavior', effect => {
    const show = structuredClone(initialShow)
    show.programs[0].effect = effect.id
    const converted = structuredClone(show)
    converted.looks[0].layers = resolveLookLayers(converted, converted.looks[0])
    for (const at of [0, .17, .51, 2.35]) {
      expect(frame(converted, at).fixtures).toEqual(frame(show, at).fixtures)
    }
  })
  it('empty layers and groups added after conversion default to off', () => {
    const show = layeredShow()
    show.looks[0].layers = []
    expect(frame(show).fixtures.every(f => f.intensity === 0)).toBe(true)
    show.groups.push({ id: 'new', name: 'New', intensity: 1 })
    show.fixtures[0].groupId = 'new'
    expect(resolveLookLayers(show, show.looks[0]).find(l => l.groupId === 'new')?.mode).toBe('off')
    expect(() => assertShowDocument(show)).not.toThrow()
  })
  it('canonical animation labels do not include AI names or irrelevant static rates', () => {
    expect(animationLabel({ ...initialShow.programs[0], name: 'Misleading red chase', rateBeats: 100 })).toBe('Stabiel')
    expect(animationLabel({ ...initialShow.programs[1], rateBeats: 8 })).toBe('Afwisselend')
  })
})

describe('persisted Look layer validation', () => {
  it.each([
    { groupId: 'missing' }, { mode: 'unknown' }, { intensity: -1 }, { intensity: 1.1 }, { intensity: NaN },
    { programId: 'missing' }, { programId: null }, { colorProfileId: 'missing' }, { colorProfileId: undefined },
    { mode: 'static', programId: 'pulse' }, { mode: 'off', programId: 'pulse' },
  ])('rejects malformed layer %j', invalid => {
    const show = layeredShow()
    Object.assign(show.looks[0].layers![1], invalid)
    expect(() => assertShowDocument(show)).toThrow(/layers/)
  })
  it('rejects duplicate group layers and oversized layer lists', () => {
    const show = layeredShow()
    show.looks[0].layers!.push({ ...show.looks[0].layers![0] })
    expect(() => assertShowDocument(show)).toThrow(/dubbel/)
    show.looks[0].layers = Array.from({ length: 257 }, () => layer('front', 'off'))
    expect(() => assertShowDocument(show)).toThrow(/layers/)
  })
  it('accepts nullable palette and absent legacy layers across serialization', () => {
    expect(() => assertShowDocument(JSON.parse(JSON.stringify(layeredShow())))).not.toThrow()
    expect(() => assertShowDocument(initialShow)).not.toThrow()
  })
})
