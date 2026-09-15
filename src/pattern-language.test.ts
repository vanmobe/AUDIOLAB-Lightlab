import { describe, expect, it } from 'vitest'
import {
  evaluatePattern,
  patternDescription,
  patternSignature,
  validatePattern,
  type Pattern,
  type PatternStep,
} from './pattern-language'
import { animationLabel, evaluateFrame, materializeGroupTiming, type RuntimeState } from './domain'
import { initialShow } from './seed'
import { fixtureProfiles } from './fixtures'
import { assertShowDocument } from './show-validation'

const step = (change: Partial<PatternStep> = {}): PatternStep => ({
  selection: 'moving',
  direction: 'forward',
  envelope: 'hold',
  width: 1,
  trail: 0,
  level: 1,
  weight: 1,
  ...change,
})
const recipe = (...steps: PatternStep[]): Pattern => ({ version: 1, floor: 0, steps: steps.length ? steps : [step()] })
const values = (pattern: Pattern, phase: number, count = 4) =>
  Array.from({ length: count }, (_, index) => evaluatePattern(pattern, phase, index, count))

describe('bounded pattern language', () => {
  it('accepts full valid bounds and every allowed enumeration', () => {
    for (const selection of ['all', 'alternate', 'random', 'moving'] as const) {
      for (const direction of ['forward', 'reverse', 'bounce', 'inward', 'outward'] as const) {
        for (const envelope of ['hold', 'fade-in', 'fade-out', 'pulse'] as const) {
          expect(() =>
            validatePattern({
              version: 1,
              floor: 1,
              steps: Array.from({ length: 16 }, () =>
                step({ selection, direction, envelope, width: 8, trail: 1, level: 0, weight: 8 }),
              ),
            }),
          ).not.toThrow()
        }
      }
    }
  })
  it.each([
    null,
    [],
    {},
    { ...recipe(), code: 'alert(1)' },
    { ...recipe(), version: 2 },
    { ...recipe(), floor: NaN },
    { ...recipe(), floor: -1 },
    { ...recipe(), floor: 1.1 },
    { ...recipe(), steps: [] },
    { ...recipe(), steps: Array.from({ length: 17 }, () => step()) },
  ])('rejects malformed recipe %j', (value) => {
    expect(() => validatePattern(value)).toThrow()
  })
  it.each([
    { selection: 'script' },
    { direction: 'sideways' },
    { envelope: 'custom' },
    { width: 0 },
    { width: 9 },
    { width: 1.5 },
    { weight: 0 },
    { weight: 9 },
    { weight: 0.5 },
    { trail: -1 },
    { trail: Infinity },
    { level: -1 },
    { level: 2 },
    { level: '1' },
    { duration: 4 },
  ])('rejects malformed step %j', (invalid) => {
    expect(() => validatePattern(recipe({ ...step(), ...invalid } as PatternStep))).toThrow()
  })
  it('rejects missing required fields and validates at import boundary', () => {
    const incomplete: Partial<PatternStep> = step()
    delete incomplete.direction
    expect(() => validatePattern(recipe(incomplete as PatternStep))).toThrow()
    const show = structuredClone(initialShow)
    show.programs[0].pattern = recipe()
    expect(() => assertShowDocument(show)).not.toThrow()
    show.programs[0].pattern.steps[0].weight = NaN
    expect(() => assertShowDocument(show)).toThrow('programs.0.pattern')
  })
})

describe('relative pattern evaluation', () => {
  it('partitions a cycle using relative step weights and repeats including negative phases', () => {
    const pattern = recipe(step({ selection: 'all', level: 0.25 }), step({ selection: 'all', level: 0.75, weight: 3 }))
    expect(values(pattern, 0.249)).toEqual([0.25, 0.25, 0.25, 0.25])
    expect(values(pattern, 0.25)).toEqual([0.75, 0.75, 0.75, 0.75])
    expect(values(pattern, -0.5)).toEqual(values(pattern, 0.5))
    expect(values(pattern, 1)).toEqual(values(pattern, 0))
  })
  it('moves forwards, backwards and bounces over group-local points', () => {
    expect(values(recipe(), 0)).toEqual([1, 0, 0, 0])
    expect(values(recipe(), 0.99)).toEqual([0, 0, 0, 1])
    expect(values(recipe(step({ direction: 'reverse' })), 0)).toEqual([0, 0, 0, 1])
    const bounce = recipe(step({ direction: 'bounce' }))
    expect(values(bounce, 0.5)).toEqual([0, 0, 0, 1])
    expect(values(bounce, 0.99)).toEqual([1, 0, 0, 0])
  })
  it('mirrors inward/outward heads for even and odd counts', () => {
    const inward = recipe(step({ direction: 'inward' })),
      outward = recipe(step({ direction: 'outward' }))
    expect(values(inward, 0)).toEqual([1, 0, 0, 1])
    expect(values(inward, 0.9)).toEqual([0, 1, 1, 0])
    expect(values(outward, 0, 5)).toEqual([0, 0, 1, 0, 0])
    expect(values(outward, 0.9, 5)).toEqual([1, 0, 0, 0, 1])
  })
  it('uses width for moving windows and keeps a fading tail behind travel only', () => {
    expect(values(recipe(step({ width: 2 })), 0.5, 6)).toEqual([0, 0, 1, 1, 0, 0])
    const forward = values(recipe(step({ trail: 1 })), 0.5, 6)
    expect(forward[3]).toBe(1)
    expect(forward[2]).toBeGreaterThan(forward[1])
    expect(forward[1]).toBeGreaterThan(forward[0])
    expect(forward[4]).toBe(0)
    expect(values(recipe(step({ direction: 'reverse', trail: 1 })), 0.5, 6)).toEqual([...forward].reverse())
  })
  it('applies envelopes and a nonzero baseline without exceeding 1', () => {
    expect(values(recipe(step({ selection: 'all', envelope: 'fade-in' })), 0.25)).toEqual([0.25, 0.25, 0.25, 0.25])
    expect(values(recipe(step({ selection: 'all', envelope: 'fade-out' })), 0.25)).toEqual([0.75, 0.75, 0.75, 0.75])
    expect(values(recipe(step({ selection: 'all', envelope: 'pulse' })), 0.5)).toEqual([1, 1, 1, 1])
    expect(values({ ...recipe(step({ level: 0.8 })), floor: 0.4 }, 0.1)).toEqual([0.8, 0.4, 0.4, 0.4])
  })
  it('alternates sets each cycle independently of ignored fields', () => {
    const pattern = recipe(step({ selection: 'alternate' }))
    expect(values(pattern, 0)).toEqual([1, 0, 1, 0])
    expect(values(pattern, 1)).toEqual([0, 1, 0, 1])
    expect(values(pattern, -1)).toEqual([0, 1, 0, 1])
    expect(values(recipe(step({ selection: 'alternate', width: 8, trail: 1, direction: 'reverse' })), 0)).toEqual(
      values(pattern, 0),
    )
  })
  it('random selects exact bounded width reproducibly and changes with cycles', () => {
    const pattern = recipe(step({ selection: 'random', width: 3 }))
    for (const count of [1, 2, 5, 11, 32]) {
      for (const phase of [-3.2, 0, 0.7, 1, 19]) {
        const result = values(pattern, phase, count)
        expect(result.filter(Boolean)).toHaveLength(Math.min(3, count))
        expect(values(structuredClone(pattern), phase, count)).toEqual(result)
      }
    }
    expect(values(pattern, 0, 11)).not.toEqual(values(pattern, 1, 11))
  })
})

describe('recipe identity and labels', () => {
  it('deduplicates provably constant recipes without collapsing genuine changes', () => {
    for (const level of [0, 0.4, 1]) {
      const steady = { ...recipe(step({ selection: 'all', level })), floor: 0 }
      const hiddenMotion = {
        ...recipe(
          step({ selection: 'moving', direction: 'inward', envelope: 'pulse', level, weight: 3 }),
          step({ selection: 'random', level: level / 2, weight: 7 }),
        ),
        floor: level,
      }
      const signature = patternSignature({ effect: 'static', pattern: steady })
      expect(patternSignature({ effect: 'chase', pattern: hiddenMotion })).toBe(signature)
      for (const phase of [-1.8, 0, 0.2, 0.8, 7.1])
        for (const count of [1, 4, 9]) expect(values(hiddenMotion, phase, count)).toEqual(values(steady, phase, count))
    }
    const constant = recipe(step({ selection: 'all', level: 0.4 }), step({ selection: 'all', level: 0.4, weight: 8 }))
    expect(patternSignature({ effect: 'pulse', pattern: constant })).toBe(
      patternSignature({ effect: 'pulse', pattern: recipe(step({ selection: 'all', level: 0.4 })) }),
    )
    const varying = recipe(step({ selection: 'all', level: 0.4 }), step({ selection: 'all', level: 0.5 }))
    expect(patternSignature({ effect: 'pulse', pattern: varying })).not.toBe(
      patternSignature({ effect: 'pulse', pattern: constant }),
    )
  })
  it('ignores name, IDs, fallback effect, ignored fields and proportional step weights', () => {
    const original = {
      effect: 'pulse',
      pattern: recipe(step({ selection: 'all', weight: 2 }), step({ selection: 'random', width: 2, weight: 4 })),
    }
    const equal = {
      effect: 'static',
      pattern: recipe(
        step({ selection: 'all', width: 8, trail: 1, direction: 'reverse' }),
        step({ selection: 'random', direction: 'bounce', trail: 0.5, width: 2, weight: 2 }),
      ),
    }
    expect(patternSignature(original)).toBe(patternSignature(equal))
    for (const phase of [0, 0.2, 0.5, 1.7])
      expect(values(original.pattern, phase)).toEqual(values(equal.pattern, phase))
    expect(patternSignature({ effect: 'pulse' })).toBe('effect:pulse')
  })
  it('keeps genuine motion, envelope and step-order differences', () => {
    const base = patternSignature({ effect: 'pulse', pattern: recipe() })
    for (const change of [
      { direction: 'reverse' },
      { envelope: 'pulse' },
      { width: 2 },
      { trail: 0.5 },
      { level: 0.5 },
    ] as Partial<PatternStep>[]) {
      expect(patternSignature({ effect: 'pulse', pattern: recipe(step(change)) })).not.toBe(base)
    }
    expect(patternSignature({ effect: 'pulse', pattern: recipe(step({ selection: 'all' }), step()) })).not.toBe(
      patternSignature({ effect: 'pulse', pattern: recipe(step(), step({ selection: 'all' })) }),
    )
  })
  it('describes movement without timing and preserves custom recipe names', () => {
    const program = {
      ...initialShow.programs[0],
      name: 'Dubbele golvende staart',
      pattern: recipe(step({ direction: 'bounce', trail: 0.5 })),
    }
    expect(animationLabel(program)).toBe(program.name)
    expect(patternDescription(program.pattern)).toContain('heen en weer')
    expect(patternDescription(program.pattern)).not.toContain('beats')
  })
})

describe('recipe frame integration', () => {
  function showWithPattern() {
    const show = materializeGroupTiming(structuredClone(initialShow))
    show.programs[0].pattern = recipe()
    show.looks[0].layers = ['front', 'wash', 'back'].map((groupId) => ({
      groupId,
      mode: 'animation',
      programId: show.programs[0].id,
      colorProfileId: null,
      intensity: 1,
      rateBeats: 4,
      offsetBeats: 0,
    }))
    return show
  }
  const state: RuntimeState = { mode: 'automation', activeLookId: initialShow.looks[0].id }
  it('animates every group independently, overrides static fallback and preserves warm-white fixtures', () => {
    const show = showWithPattern()
    const frame = evaluateFrame(show, fixtureProfiles, state, 0)
    for (const group of ['front', 'wash', 'back']) {
      const ids = new Set(show.fixtures.filter((fixture) => fixture.groupId === group).map((fixture) => fixture.id))
      const points = frame.fixtures
        .filter((fixture) => ids.has(fixture.fixtureId))
        .flatMap((fixture) => fixture.segments ?? [fixture])
      expect(points.filter((point) => point.intensity > 0)).toHaveLength(1)
    }
    expect(frame.fixtures.find((fixture) => fixture.fixtureId === 'front-1')?.color).toBe('#fff1d6')
    expect(frame.fixtures.find((fixture) => fixture.fixtureId === 'hazer-1')?.segments).toBeUndefined()
  })
  it('is independent of program IDs and supports group timing, freeze, blackout and safety', () => {
    const show = showWithPattern()
    show.programs[0].pattern = recipe(step({ selection: 'random', width: 2 }))
    const renamed = structuredClone(show)
    renamed.programs[0].id = 'new-id'
    renamed.looks[0].programId = 'new-id'
    renamed.looks[0].layers!.forEach((layer) => {
      layer.programId = 'new-id'
    })
    expect(evaluateFrame(renamed, fixtureProfiles, state, 1.3)).toEqual(
      evaluateFrame(show, fixtureProfiles, state, 1.3),
    )
    const frozen = { ...state, mode: 'static' as const, heldAtBeats: 1 }
    expect(evaluateFrame(show, fixtureProfiles, frozen, 5).fixtures).toEqual(
      evaluateFrame(show, fixtureProfiles, frozen, 10).fixtures,
    )
    expect(
      evaluateFrame(show, fixtureProfiles, { ...state, mode: 'blackout' }, 1).fixtures.every(
        (fixture) => fixture.intensity === 0,
      ),
    ).toBe(true)
    const withoutRecipe = structuredClone(show)
    delete withoutRecipe.programs[0].pattern
    expect(evaluateFrame(show, fixtureProfiles, { ...state, mode: 'safety' }, 1)).toEqual(
      evaluateFrame(withoutRecipe, fixtureProfiles, { ...state, mode: 'safety' }, 1),
    )
  })
  it('uses four independent bar heads only when the fixture mode supports them', () => {
    const show = showWithPattern()
    show.fixtures = show.fixtures.filter((fixture) => fixture.id === 'tri-bar-1')
    const frame = evaluateFrame(show, fixtureProfiles, state, 1)
    expect(frame.fixtures[0].segments).toHaveLength(4)
    expect(frame.fixtures[0].segments!.map((segment) => segment.intensity > 0)).toEqual([false, true, false, false])
    show.fixtures[0].modeId = '7ch'
    expect(evaluateFrame(show, fixtureProfiles, state, 1).fixtures[0].segments).toHaveLength(1)
  })
  it('applies independent group duration and signed offset to relative step progress', () => {
    const base = showWithPattern(),
      changed = structuredClone(base)
    changed.looks[0].layers!.find((layer) => layer.groupId === 'wash')!.rateBeats = 8
    changed.looks[0].layers!.find((layer) => layer.groupId === 'wash')!.offsetBeats = -2
    for (const beat of [0, 1.5, 5, 9]) {
      const expected = evaluateFrame(base, fixtureProfiles, state, (beat + 2) / 2)
      const actual = evaluateFrame(changed, fixtureProfiles, state, beat)
      for (const fixture of changed.fixtures.filter((fixture) => fixture.groupId === 'wash')) {
        expect(actual.fixtures.find((item) => item.fixtureId === fixture.id)).toEqual(
          expected.fixtures.find((item) => item.fixtureId === fixture.id),
        )
      }
    }
  })
})
