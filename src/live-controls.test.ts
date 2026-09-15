import { describe, expect, it } from 'vitest'
import { evaluateFrame, type RuntimeState } from './domain'
import { fixtureProfiles } from './fixtures'
import { initialShow } from './seed'
import { assertShowDocument } from './show-validation'
import { applyLiveGroupLook, emptyLiveControls, linkedGroupIds, linkLiveGroups, livePreview, resetLiveGroups, unlinkLiveGroup, updateLiveGroups } from './live-controls'

const state: RuntimeState = { mode: 'automation', activeLookId: initialShow.looks[0].id }
const render = (controls = emptyLiveControls(), runtime = state, show = initialShow, at = .25) => {
  const preview = livePreview(show, runtime, controls)
  return evaluateFrame(preview.show, fixtureProfiles, preview.state, at)
}

describe('live group links', () => {
  it('merges intersecting link sets and resolves a transitive connected set in show order', () => {
    let controls = linkLiveGroups(initialShow, emptyLiveControls(), ['front', 'wash'])
    controls = linkLiveGroups(initialShow, controls, ['back', 'effects'])
    controls = linkLiveGroups(initialShow, controls, ['wash', 'back'])
    expect(controls.links).toEqual([initialShow.groups.map(g => g.id)])
    expect(linkedGroupIds(initialShow, { overrides: {}, links: [['wash', 'back'], ['front', 'wash']] }, 'front')).toEqual(['front', 'wash', 'back'])
    expect(linkedGroupIds(initialShow, controls, 'deleted')).toEqual([])
  })
  it('linking and unlinking never copy settings or change current output', () => {
    const original = updateLiveGroups(initialShow, emptyLiveControls(), 'wash', { colorProfileId: 'neon', intensity: .4 })
    const linked = linkLiveGroups(initialShow, original, ['wash', 'back'])
    expect(linked.overrides).toBe(original.overrides)
    expect(render(linked)).toEqual(render(original))
    const unlinked = unlinkLiveGroup(linked, 'wash')
    expect(unlinked.links).toEqual([])
    expect(render(unlinked)).toEqual(render(original))
  })
  it('drops deleted groups from connected targets and ignores singleton link attempts', () => {
    const controls = { overrides: {}, links: [['wash', 'gone', 'front']] }
    expect(linkedGroupIds(initialShow, controls, 'wash')).toEqual(['front', 'wash'])
    expect(linkLiveGroups(initialShow, controls, ['wash', 'gone'])).toBe(controls)
  })
})

describe('live group overrides', () => {
  it('changes only the requested fields of linked targets and resets only those targets', () => {
    let controls = updateLiveGroups(initialShow, emptyLiveControls(), 'back', { colorProfileId: 'warm', intensity: .3 })
    controls = updateLiveGroups(initialShow, controls, 'front', { intensity: .8 })
    controls = linkLiveGroups(initialShow, controls, ['wash', 'back'])
    controls = updateLiveGroups(initialShow, controls, 'wash', { mode: 'animation', programId: 'pulse' })
    expect(controls.overrides.back).toEqual({ colorProfileId: 'warm', intensity: .3, mode: 'animation', programId: 'pulse' })
    expect(controls.overrides.wash).toEqual({ mode: 'animation', programId: 'pulse' })
    expect(resetLiveGroups(initialShow, controls, 'back').overrides).toEqual({ front: { intensity: .8 } })
  })
  it('copies each linked group’s own source Look layer and captures following palettes', () => {
    const show = structuredClone(initialShow)
    show.looks[1].layers = [
      { groupId: 'front', mode: 'static', programId: null, colorProfileId: 'warm', intensity: .6 },
      { groupId: 'wash', mode: 'animation', programId: 'pulse', colorProfileId: null, intensity: .9 },
    ]
    let controls = linkLiveGroups(show, emptyLiveControls(), ['front', 'wash', 'back'])
    controls = applyLiveGroupLook(show, controls, 'front', show.looks[1].id)
    expect(controls.overrides.front).toEqual({ mode: 'static', programId: null, colorProfileId: 'warm', intensity: .6, rateBeats: 1, offsetBeats: 0 })
    expect(controls.overrides.wash).toEqual({ mode: 'animation', programId: 'pulse', colorProfileId: 'neon', intensity: .9, rateBeats: 1, offsetBeats: 0 })
    expect(controls.overrides.back.mode).toBe('off')
    const result = render(controls, { ...state, colorLockId: 'warm' }, show)
    expect(result.fixtures[0].color).toBe(show.colorProfiles[0].accent)
    expect(result.fixtures.find(f => f.fixtureId === 'front-1')!.color).toBe('#fff1d6')
  })
  it('preserves original references without effective overrides, even with links or stale entries', () => {
    for (const controls of [emptyLiveControls(), { overrides: {}, links: [['wash', 'back']] }, { overrides: { gone: { intensity: .2 } }, links: [] }]) {
      const preview = livePreview(initialShow, state, controls)
      expect(preview.show).toBe(initialShow)
      expect(preview.state).toBe(state)
    }
  })
  it('sanitizes deleted references and invalid fields without discarding independent valid fields', () => {
    const controls = { overrides: { wash: { mode: 'animation' as const, programId: 'deleted', colorProfileId: 'deleted', intensity: .3 }, back: { intensity: NaN } }, links: [] }
    const preview = livePreview(initialShow, state, controls)
    expect(() => assertShowDocument(preview.show)).not.toThrow()
    const wash = preview.show.looks[0].layers!.find(l => l.groupId === 'wash')!
    expect(wash).toMatchObject({ mode: 'static', programId: null, colorProfileId: null, intensity: .3 })
    expect(preview.show.looks[0].layers!.find(l => l.groupId === 'back')!.intensity).toBe(1)
    expect(applyLiveGroupLook(initialShow, controls, 'wash', 'deleted')).toBe(controls)
  })
  it('static/off modes clear program reference in the ephemeral layer, not the independent override', () => {
    const controls = updateLiveGroups(initialShow, emptyLiveControls(), 'wash', { mode: 'off', programId: 'pulse' })
    expect(controls.overrides.wash.programId).toBe('pulse')
    expect(livePreview(initialShow, state, controls).show.looks[0].layers!.find(l => l.groupId === 'wash')).toMatchObject({ mode: 'off', programId: null })
    expect(render(controls).fixtures[0].intensity).toBe(0)
  })
  it.each(['blackout', 'safety', 'static'] as const)('changes never resume %s or erase held beat', mode => {
    const controls = updateLiveGroups(initialShow, emptyLiveControls(), 'wash', { mode: 'animation', programId: 'pulse', colorProfileId: 'neon' })
    const runtime = { ...state, mode, heldAtBeats: .3 }
    expect(livePreview(initialShow, runtime, controls).state).toBe(runtime)
    if (mode !== 'static') expect(render(controls, runtime)).toEqual(render(emptyLiveControls(), runtime))
    else expect(render(controls, runtime, initialShow, 10).fixtures).toEqual(render(controls, runtime, initialShow, 20).fixtures)
  })
  it('falls back to the same Look as the domain for a deleted active Look and handles no Looks', () => {
    const controls = updateLiveGroups(initialShow, emptyLiveControls(), 'wash', { intensity: .2 })
    expect(render(controls, { ...state, activeLookId: 'deleted' })).toEqual(render(controls))
    const show = { ...initialShow, looks: [], activeLookId: '' }
    expect(livePreview(show, state, controls).show).toBe(show)
  })
  it('does not mutate stored show, links, existing overrides or source Look arrays', () => {
    const show = structuredClone(initialShow), original = structuredClone(show)
    const controls = linkLiveGroups(show, emptyLiveControls(), ['front', 'wash'])
    const before = structuredClone(controls)
    const changed = applyLiveGroupLook(show, controls, 'front', show.looks[1].id)
    livePreview(show, state, changed)
    updateLiveGroups(show, changed, 'wash', { intensity: .2 })
    resetLiveGroups(show, changed, 'wash')
    expect(show).toEqual(original)
    expect(controls).toEqual(before)
  })
  it('treats imported prototype-like IDs as ordinary own group keys', () => {
    const show = structuredClone(initialShow)
    show.groups.push({ id: '__proto__', name: 'Imported group', intensity: 1 })
    show.fixtures[0].groupId = '__proto__'
    const controls = updateLiveGroups(show, emptyLiveControls(), '__proto__', { mode: 'static', intensity: .5 })
    expect(Object.hasOwn(controls.overrides, '__proto__')).toBe(true)
    expect(render(controls, state, show).fixtures[0].intensity).toBeGreaterThan(0)
  })
})
