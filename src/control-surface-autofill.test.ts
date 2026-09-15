import { describe, expect, it } from 'vitest'
import { classifyLookCharacter, planControlSurfaceFill, type AutoFillOptions } from './control-surface-autofill'
import { initialShow } from './seed'
import { assertShowDocument } from './show-validation'
import { resolveLookLayers } from './domain'

const options: AutoFillOptions = {
  banks: [1, 2, 3, 4],
  grouping: 'order',
  mode: 'replace',
  rotaryGroupIds: ['front', 'wash', 'back', null],
}
const clean = () => ({
  ...structuredClone(initialShow),
  controlSurface: { profileId: 'wing-rack', bindings: [] as typeof initialShow.controlSurface.bindings },
})

describe('automatic logical bank planning', () => {
  it('fills all Looks once, with fixed group encoders in non-contiguous sorted banks', () => {
    const show = clean(),
      before = structuredClone(show)
    const result = planControlSurfaceFill(show, { ...options, banks: [7, 2, 7] })
    expect(result.errors).toEqual([])
    expect(result.placedLookCount).toBe(show.looks.length)
    expect(result.banks.map((bank) => bank.bank)).toEqual([2, 7])
    expect(result.banks.flatMap((bank) => bank.looks.map((look) => look.lookId))).toEqual(
      show.looks.map((look) => look.id),
    )
    expect(
      result.banks.every((bank) => bank.rotaries.map((rotary) => rotary.groupId).join() === 'front,wash,back'),
    ).toBe(true)
    expect(show).toEqual(before)
    expect(() => assertShowDocument({ ...show, controlSurface: result.surface })).not.toThrow()
  })
  it('reuses unassigned controls and repeated replacement is idempotent', () => {
    const show = clean()
    show.controlSurface.bindings.push({
      id: 'retained-look',
      action: 'look',
      targetId: show.looks[0].id,
      label: 'Eigen naam',
    })
    const first = planControlSurfaceFill(show, options)
    expect(first.surface.bindings.find((binding) => binding.id === 'retained-look')?.slot).toEqual({
      bank: 1,
      kind: 'button',
      index: 1,
    })
    const next = planControlSurfaceFill({ ...show, controlSurface: first.surface }, options)
    expect(next.surface).toEqual(first.surface)
    expect(next.displacedCount).toBe(0)
  })
  it('preserves outside assignments, unplaces displaced actions and leaves null rotaries alone', () => {
    const show = clean()
    show.controlSurface.bindings.push(
      {
        id: 'out',
        action: 'look',
        targetId: show.looks[0].id,
        label: 'Outside',
        slot: { bank: 16, kind: 'button', index: 2 },
      },
      { id: 'stop', action: 'mode', targetId: 'blackout', label: 'Stop', slot: { bank: 1, kind: 'button', index: 1 } },
      {
        id: 'keep',
        action: 'group-intensity',
        targetId: 'effects',
        label: 'Haze',
        slot: { bank: 1, kind: 'rotary', index: 4 },
      },
    )
    const result = planControlSurfaceFill(show, options)
    expect(result.surface.bindings.find((binding) => binding.id === 'out')).toEqual(show.controlSurface.bindings[0])
    expect(result.surface.bindings.find((binding) => binding.id === 'keep')).toEqual(show.controlSurface.bindings[2])
    expect(result.surface.bindings.find((binding) => binding.id === 'stop')?.slot).toBeUndefined()
    expect(result.displacedCount).toBe(1)
  })
  it('keeps occupied buttons and skips Looks already in selected banks in empty mode', () => {
    const show = clean()
    show.controlSurface.bindings.push({
      id: 'placed',
      action: 'look',
      targetId: show.looks[0].id,
      label: 'Placed',
      slot: { bank: 1, kind: 'button', index: 5 },
    })
    const result = planControlSurfaceFill(show, { ...options, mode: 'empty' })
    expect(result.errors).toEqual([])
    expect(result.surface.bindings.find((binding) => binding.id === 'placed')).toEqual(show.controlSurface.bindings[0])
    expect(
      result.surface.bindings.filter((binding) => binding.action === 'look' && binding.targetId === show.looks[0].id),
    ).toHaveLength(1)
    expect(
      planControlSurfaceFill({ ...show, controlSurface: result.surface }, { ...options, mode: 'empty' }).surface,
    ).toEqual(result.surface)
  })
  it('rejects an occupied conflicting rotary atomically', () => {
    const show = clean()
    show.controlSurface.bindings.push({
      id: 'rotary',
      action: 'group-intensity',
      targetId: 'effects',
      label: 'Haze',
      slot: { bank: 1, kind: 'rotary', index: 1 },
    })
    const result = planControlSurfaceFill(show, { ...options, mode: 'empty' })
    expect(result.errors.join()).toContain('draaiknop 1')
    expect(result.surface).toBe(show.controlSurface)
    expect(result.placedLookCount).toBe(0)
  })
  it('starts a new bank per character and reports grouping overflow without partial assignments', () => {
    const show = clean()
    show.looks = show.looks.slice(0, 3)
    const characterOverrides = Object.fromEntries(
      show.looks.map((look, index) => [look.id, (['calm', 'movement', 'energetic'] as const)[index]]),
    )
    const result = planControlSurfaceFill(show, {
      ...options,
      grouping: 'character',
      banks: [1, 3, 8],
      characterOverrides,
    })
    expect(result.errors).toEqual([])
    expect(result.banks.map((bank) => bank.label)).toEqual(['Rustig', 'In beweging', 'Energiek'])
    expect(result.banks.map((bank) => bank.looks.length)).toEqual([1, 1, 1])
    const failed = planControlSurfaceFill(show, {
      ...options,
      grouping: 'character',
      banks: [1, 3],
      characterOverrides,
    })
    expect(failed.errors.length).toBeGreaterThan(0)
    expect(failed.surface).toBe(show.controlSurface)
  })
  it('rejects invalid banks, missing groups, unsupported profiles and capacity overflow', () => {
    const show = clean()
    for (const banks of [[], [0], [17], [1.5], [NaN]])
      expect(planControlSurfaceFill(show, { ...options, banks }).errors.length).toBeGreaterThan(0)
    expect(planControlSurfaceFill(show, { ...options, rotaryGroupIds: ['missing'] }).errors.length).toBeGreaterThan(0)
    expect(
      planControlSurfaceFill({ ...show, controlSurface: { ...show.controlSurface, profileId: 'unknown' } }, options)
        .errors.length,
    ).toBeGreaterThan(0)
    show.controlSurface.bindings = Array.from({ length: 512 }, (_, index) => ({
      id: `mode-${index}`,
      label: 'Stop',
      action: 'mode',
      targetId: 'blackout',
    }))
    const failed = planControlSurfaceFill(show, options)
    expect(failed.errors.join()).toContain('512')
    expect(failed.surface).toBe(show.controlSurface)
  })
  it('fills 32 Looks exactly and never silently truncates an undersized selection', () => {
    const show = clean()
    show.looks = Array.from({ length: 32 }, (_, index) => ({
      ...show.looks[0],
      id: `look-${index}`,
      name: `Look ${index}`,
    }))
    const exact = planControlSurfaceFill(show, options)
    expect(exact.errors).toEqual([])
    expect(exact.banks.map((bank) => bank.looks.length)).toEqual([8, 8, 8, 8])
    const short = planControlSurfaceFill(show, { ...options, banks: [1, 2, 3] })
    expect(short.errors.join()).toContain('8 Looks passen niet')
    expect(short.surface).toBe(show.controlSurface)
  })
  it('does not mix a newly filled character with a preserved contrary Look', () => {
    const show = clean()
    show.looks = show.looks.slice(0, 2)
    const characterOverrides = { [show.looks[0].id]: 'energetic' as const, [show.looks[1].id]: 'calm' as const }
    show.controlSurface.bindings.push({
      id: 'kept',
      action: 'look',
      label: 'Fast',
      targetId: show.looks[0].id,
      slot: { bank: 1, kind: 'button', index: 1 },
    })
    const result = planControlSurfaceFill(show, {
      ...options,
      mode: 'empty',
      grouping: 'character',
      banks: [1, 2],
      characterOverrides,
    })
    expect(result.errors).toEqual([])
    expect(result.warnings.join()).toContain('niet opnieuw op karakter')
    expect(result.banks.map((bank) => bank.looks.map((look) => look.lookId))).toEqual([
      [show.looks[0].id],
      [show.looks[1].id],
    ])
  })
  it('keeps custom names in empty mode and unused bank names in replacement mode', () => {
    const show = {
      ...clean(),
      controlSurface: {
        ...clean().controlSurface,
        bankNames: { '1': 'Mijn bank', '4': 'Reserve', '16': 'Buiten selectie' },
      },
    }
    const empty = planControlSurfaceFill(show, { ...options, mode: 'empty' })
    expect(empty.surface.bankNames).toMatchObject(show.controlSurface.bankNames)
    const replace = planControlSurfaceFill(show, options)
    expect(replace.surface.bankNames).toMatchObject({ '1': 'Looks', '4': 'Reserve', '16': 'Buiten selectie' })
  })
  it('uses actual Compact capacity without inventing rotary slots', () => {
    const show = clean()
    show.controlSurface.profileId = 'wing-compact'
    const result = planControlSurfaceFill(show, { ...options, banks: [1], rotaryGroupIds: [] })
    expect(result.errors).toEqual([])
    expect(result.banks[0].rotaries).toEqual([])
    expect(planControlSurfaceFill(show, { ...options, banks: [1] }).errors.length).toBeGreaterThan(0)
  })
  it('preserves hidden stored slots beyond the current profile and does not count them as placed', () => {
    const show = clean()
    show.controlSurface.profileId = 'wing-compact'
    show.controlSurface.bindings.push({
      id: 'hidden',
      action: 'look',
      targetId: show.looks[0].id,
      label: 'Other profile',
      slot: { bank: 1, kind: 'button', index: 40 },
    })
    for (const mode of ['empty', 'replace'] as const) {
      const result = planControlSurfaceFill(show, { ...options, mode, banks: [1], rotaryGroupIds: [] })
      expect(result.errors).toEqual([])
      expect(result.surface.bindings.find((binding) => binding.id === 'hidden')).toEqual(
        show.controlSurface.bindings[0],
      )
      expect(result.banks[0].looks).toHaveLength(show.looks.length)
      expect(result.banks[0].looks.some((look) => look.slot === 40)).toBe(false)
    }
  })
  it('does not describe a moved Look as displaced to the unassigned list', () => {
    const show = clean()
    show.controlSurface.bindings.push({
      id: 'moved',
      action: 'look',
      targetId: show.looks[0].id,
      label: 'Move',
      slot: { bank: 1, kind: 'button', index: 8 },
    })
    const result = planControlSurfaceFill(show, options)
    expect(result.surface.bindings.find((binding) => binding.id === 'moved')?.slot?.index).toBe(1)
    expect(result.displacedCount).toBe(0)
  })
})

describe('Look character suggestions', () => {
  it('classifies the actual layers and group durations, never the Look or animation name', () => {
    const show = clean(),
      look = show.looks[0]
    const program = {
      ...show.programs[0],
      id: 'test',
      name: 'Very calm',
      effect: 'pulse' as const,
      rateBeats: 1,
      pattern: undefined,
    }
    show.programs.push(program)
    look.layers = resolveLookLayers(show, look).map((layer) => ({
      ...layer,
      mode: 'animation',
      programId: program.id,
      rateBeats: 1,
    }))
    look.name = 'Quiet'
    expect(classifyLookCharacter(show, look)).toBe('energetic')
    look.layers = look.layers.map((layer) => ({ ...layer, rateBeats: 2 }))
    expect(classifyLookCharacter(show, look)).toBe('movement')
    look.layers = look.layers.map((layer) => ({ ...layer, rateBeats: 8 }))
    expect(classifyLookCharacter(show, look)).toBe('calm')
    look.layers = look.layers.map((layer) => ({
      ...layer,
      mode: layer.groupId === 'effects' ? 'animation' : 'off',
      rateBeats: 0.25,
    }))
    expect(classifyLookCharacter(show, look)).toBe('calm')
  })
  it('ignores muted group masters', () => {
    const show = clean(),
      look = show.looks[0]
    show.groups = show.groups.map((group) => ({ ...group, intensity: 0 }))
    look.layers = resolveLookLayers(show, look).map((layer) => ({
      ...layer,
      mode: 'animation',
      programId: show.programs.find((program) => program.effect === 'pulse')?.id ?? show.programs[1].id,
      rateBeats: 0.125,
    }))
    expect(classifyLookCharacter(show, look)).toBe('calm')
  })
  it('recognizes constant composed patterns despite animated fallback names', () => {
    const show = clean(),
      look = show.looks[0],
      program = show.programs[0]
    program.effect = 'sparkle'
    program.pattern = {
      version: 1,
      floor: 0.3,
      steps: [{ selection: 'all', direction: 'forward', envelope: 'hold', width: 1, trail: 0, level: 1, weight: 1 }],
    }
    look.layers = resolveLookLayers(show, look).map((layer) => ({
      ...layer,
      mode: 'animation',
      programId: program.id,
      rateBeats: 0.125,
    }))
    expect(classifyLookCharacter(show, look)).toBe('calm')
  })
})
