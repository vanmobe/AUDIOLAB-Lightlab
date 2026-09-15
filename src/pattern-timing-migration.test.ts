import { describe, expect, it } from 'vitest'
import { animationEffects, evaluateFrame, materializeGroupTiming, resolveLookLayers, type RuntimeState } from './domain'
import { fixtureProfiles } from './fixtures'
import { emptyLiveControls, livePreview, updateLiveGroups } from './live-controls'
import { initialShow } from './seed'
import { assertShowDocument } from './show-validation'
import { createShowPackage, createVersion, parseShowPackage } from './show-package'

const state: RuntimeState = { mode: 'automation', activeLookId: initialShow.looks[0].id }
const frame = (show: typeof initialShow, beat: number, runtime = state) => evaluateFrame(show, fixtureProfiles, runtime, beat)

describe('pattern-independent group timing migration', () => {
  it.each(animationEffects)('preserves legacy $id frames, IDs and metadata across all supported timing limits', effect => {
    for (const rateBeats of [.01, .12, .5, 8, 65, 1024]) {
      const original = structuredClone(initialShow)
      Object.assign(original.programs[0], { effect: effect.id, rateBeats })
      const before = structuredClone(original)
      const migrated = materializeGroupTiming(original)
      expect(() => assertShowDocument(migrated)).not.toThrow()
      expect(original).toEqual(before)
      expect(migrated.programs).toBe(original.programs)
      expect(materializeGroupTiming(migrated)).toBe(migrated)
      for (const mode of ['automation', 'static', 'safety', 'blackout'] as const) {
        for (const beat of [0, .17, 3.21]) expect(frame(migrated, beat, { ...state, mode, heldAtBeats: .31 }))
          .toEqual(frame(original, beat, { ...state, mode, heldAtBeats: .31 }))
      }
    }
  })

  it('captures layer-specific legacy duration once, without inheriting later program metadata edits', () => {
    const original = structuredClone(initialShow)
    original.looks[0].layers = [
      { groupId: 'wash', mode: 'animation', programId: 'chorus', colorProfileId: null, intensity: 1, rateBeats: null, offsetBeats: -2 },
      { groupId: 'back', mode: 'animation', programId: 'pulse', colorProfileId: null, intensity: 1, rateBeats: 8 },
    ]
    const migrated = materializeGroupTiming(original)
    expect(migrated.looks[0].layers?.find(layer => layer.groupId === 'wash')).toMatchObject({ rateBeats: .5, offsetBeats: -2 })
    const changed = structuredClone(migrated)
    changed.programs.forEach(program => { program.rateBeats = 1 })
    for (const beat of [0, .3, 1.7]) expect(frame(changed, beat)).toEqual(frame(migrated, beat))
    changed.programs[1].effect = 'wave'
    expect(resolveLookLayers(changed, changed.looks[0]).find(layer => layer.groupId === 'wash'))
      .toMatchObject({ programId: 'chorus', rateBeats: .5, offsetBeats: -2 })
    expect(changed.programs[1].id).toBe(migrated.programs[1].id)
  })

  it('preserves current group duration when switching patterns in live controls', () => {
    const show = structuredClone(initialShow)
    show.activeLookId = show.looks[1].id
    const runtime = { ...state, activeLookId: show.activeLookId }
    const controls = updateLiveGroups(show, emptyLiveControls(), 'wash', { programId: 'pulse', mode: 'animation' })
    const preview = livePreview(show, runtime, controls)
    expect(resolveLookLayers(preview.show, preview.show.looks[1]).find(layer => layer.groupId === 'wash'))
      .toMatchObject({ programId: 'pulse', rateBeats: .5 })
  })

  it('imports and restores without rewriting historical snapshots or merging duplicate IDs', () => {
    const original = structuredClone(initialShow)
    original.programs.push({ ...original.programs[1], id: 'same-pattern-different-history', rateBeats: 8 })
    const version = createVersion(original, 'Legacy backup')
    const packaged = createShowPackage(original, [version])
    const imported = parseShowPackage(JSON.stringify(packaged))
    const migrated = materializeGroupTiming(imported.show)
    const restored = materializeGroupTiming(imported.versions[0].show)
    expect(imported).toEqual(packaged)
    expect(migrated.programs.map(program => program.id)).toEqual(original.programs.map(program => program.id))
    expect(restored).toEqual(migrated)
    expect(imported.versions[0].show.looks[0].layers).toBeUndefined()
  })
})
