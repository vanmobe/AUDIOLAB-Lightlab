import { describe, expect, it } from 'vitest'
import { evaluateFrame, type AnimationEffect, type RuntimeState } from './domain'
import { fixtureProfiles } from './fixtures'
import { initialShow } from './seed'
import { assertShowDocument, parseShowDocument } from './show-validation'
import { createShowPackage, createVersion, parseShowPackage } from './show-package'
import { applyLiveGroupLook, emptyLiveControls, linkLiveGroups, livePreview, resetLiveGroups, updateLiveGroups } from './live-controls'

function timingShow(effect: AnimationEffect = 'pulse') {
  const show = structuredClone(initialShow)
  show.programs[0].effect = effect
  show.programs[0].rateBeats = 2
  show.looks[0].layers = ['wash', 'back'].map(groupId => ({ groupId, mode: 'animation', programId: show.programs[0].id, colorProfileId: null, intensity: 1 }))
  return show
}
const state: RuntimeState = { mode: 'automation', activeLookId: initialShow.looks[0].id }
const render = (show = timingShow(), beats = 0, runtime = state) => evaluateFrame(show, fixtureProfiles, runtime, beats)

describe('per-group animation timing', () => {
  it.each(['pulse', 'chase', 'wave', 'random'] as const)('%s uses independent duration/offset while sharing spatial targets', effect => {
    const base = timingShow(effect), adjusted = structuredClone(base)
    Object.assign(adjusted.looks[0].layers![0], { rateBeats: 4, offsetBeats: 1 })
    Object.assign(adjusted.looks[0].layers![1], { rateBeats: .5, offsetBeats: -.5 })
    for (const at of [0, .37, 1.7, 5.3]) {
      const frame = render(adjusted, at)
      const slow = render(base, (at - 1) / 4 * 2)
      const fast = render(base, (at + .5) / .5 * 2)
      for (let index = 0; index < base.fixtures.length; index++) {
        if (base.fixtures[index].groupId === 'wash') expect(frame.fixtures[index]).toEqual(slow.fixtures[index])
        if (base.fixtures[index].groupId === 'back') expect(frame.fixtures[index]).toEqual(fast.fixtures[index])
      }
    }
  })
  it('positive offset delays an ongoing pattern without clamping negative phase to startup', () => {
    const show = timingShow()
    show.looks[0].layers![0].offsetBeats = .5
    expect(render(show, 0).fixtures[0].intensity).toBeLessThan(render(timingShow(), 0).fixtures[0].intensity)
    expect(render(show, 0).fixtures[0]).toEqual(render(timingShow(), -.5).fixtures[0])
  })
  it('null duration and zero offset preserve inherited behavior exactly', () => {
    const base = timingShow('random'), explicit = structuredClone(base)
    explicit.looks[0].layers!.forEach(layer => Object.assign(layer, { rateBeats: null, offsetBeats: 0 }))
    expect(render(explicit, 2.3)).toEqual(render(base, 2.3))
  })
  it('freeze applies timing to the held beat; safety and blackout bypass it', () => {
    const base = timingShow('wave'), show = structuredClone(base)
    Object.assign(show.looks[0].layers![0], { rateBeats: 8, offsetBeats: 3 })
    const frozen = { ...state, mode: 'static' as const, heldAtBeats: .75 }
    expect(render(show, 10, frozen).fixtures).toEqual(render(show, 100, frozen).fixtures)
    expect(render(show, 10, frozen).fixtures).toEqual(render(show, .75).fixtures)
    for (const mode of ['safety', 'blackout'] as const) expect(render(show, 3, { ...state, mode })).toEqual(render(base, 3, { ...state, mode }))
  })
  it.each(['static', 'off'] as const)('%s layers retain but ignore timing', mode => {
    const base = timingShow(), changed = structuredClone(base)
    base.looks[0].layers![0] = { ...base.looks[0].layers![0], mode, programId: null }
    changed.looks[0].layers![0] = { ...base.looks[0].layers![0], rateBeats: .125, offsetBeats: 64 }
    expect(render(changed, 1)).toEqual(render(base, 1))
    expect(changed.looks[0].layers![0].offsetBeats).toBe(64)
  })
})

describe('live timing edits', () => {
  it('updates linked timing fields independently and resets only their overrides', () => {
    const show = timingShow(), original = structuredClone(show)
    let controls = updateLiveGroups(show, emptyLiveControls(), 'wash', { colorProfileId: 'neon', intensity: .4, rateBeats: 8 })
    controls = linkLiveGroups(show, controls, ['wash', 'back'])
    controls = updateLiveGroups(show, controls, 'back', { offsetBeats: 2 })
    expect(controls.overrides.wash).toEqual({ colorProfileId: 'neon', intensity: .4, rateBeats: 8, offsetBeats: 2 })
    expect(controls.overrides.back).toEqual({ offsetBeats: 2 })
    expect(resetLiveGroups(show, controls, 'wash').overrides).toEqual({})
    expect(show).toEqual(original)
  })
  it('legacy null live reset uses neutral one-beat duration', () => {
    const show = timingShow()
    show.looks[0].layers![0].rateBeats = 8
    const controls = updateLiveGroups(show, emptyLiveControls(), 'wash', { rateBeats: null })
    const preview = livePreview(show, state, controls)
    expect(preview.show.looks[0].layers!.find(layer => layer.groupId === 'wash')!.rateBeats).toBe(1)
    const expected = timingShow()
    expected.looks[0].layers![0].rateBeats = 1
    expect(render(preview.show, .3)).toEqual(render(expected, .3))
  })
  it('copying a source Look without timing clears both live and base timing', () => {
    const show = timingShow()
    show.looks[1].layers = structuredClone(show.looks[0].layers)
    Object.assign(show.looks[0].layers![0], { rateBeats: 8, offsetBeats: 2 })
    let controls = updateLiveGroups(show, emptyLiveControls(), 'wash', { rateBeats: 16, offsetBeats: 4 })
    controls = applyLiveGroupLook(show, controls, 'wash', show.looks[1].id)
    const copied = livePreview(show, state, controls).show.looks[0].layers!.find(layer => layer.groupId === 'wash')!
    expect(copied.rateBeats).toBe(2)
    expect(copied.offsetBeats).toBe(0)
  })
  it.each([{ rateBeats: 0 }, { rateBeats: 1025 }, { rateBeats: Infinity }, { offsetBeats: NaN }, { offsetBeats: -65 }, { offsetBeats: 65 }])('ignores invalid live timing %j', invalid => {
    const show = timingShow()
    Object.assign(show.looks[0].layers![0], { rateBeats: 4, offsetBeats: 2 })
    const controls = updateLiveGroups(show, emptyLiveControls(), 'wash', invalid)
    expect(livePreview(show, state, controls).show).toBe(show)
  })
})

describe('persisted timing validation', () => {
  it('preserves current and historical timing through show packages without modifying snapshots', () => {
    const show = timingShow()
    Object.assign(show.looks[0].layers![0], { rateBeats: 4, offsetBeats: -2 })
    const version = createVersion(show, 'Timing before change')
    Object.assign(show.looks[0].layers![0], { rateBeats: null, offsetBeats: 1 })
    const unpacked = parseShowPackage(JSON.stringify(createShowPackage(show, [version])))
    expect(unpacked.show.looks[0].layers![0]).toMatchObject({ rateBeats: null, offsetBeats: 1 })
    expect(unpacked.versions[0].show.looks[0].layers![0]).toMatchObject({ rateBeats: 4, offsetBeats: -2 })
    expect(version.show.looks[0].layers![0]).toMatchObject({ rateBeats: 4, offsetBeats: -2 })
  })
  it.each([{}, { rateBeats: null }, { rateBeats: .125, offsetBeats: -64 }, { rateBeats: 64, offsetBeats: 64 }])('round trips supported timing %j', timing => {
    const show = timingShow()
    Object.assign(show.looks[0].layers![0], timing)
    expect(parseShowDocument(JSON.stringify(show))).toEqual(show)
  })
  it.each([{ rateBeats: 0 }, { rateBeats: .009 }, { rateBeats: 1025 }, { rateBeats: Infinity }, { rateBeats: '4' }, { offsetBeats: -65 }, { offsetBeats: 65 }, { offsetBeats: NaN }, { offsetBeats: null }, { offsetBeats: '2' }])('rejects invalid saved timing %j', timing => {
    const show = timingShow()
    Object.assign(show.looks[0].layers![0], timing)
    expect(() => assertShowDocument(show)).toThrow(/Beats/)
  })
})
