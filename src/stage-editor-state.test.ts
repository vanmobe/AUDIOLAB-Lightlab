import { describe, expect, it } from 'vitest'
import { initialShow } from './seed'
import { restoreStage, sameStage, stageSnapshot } from './stage-editor-state'

describe('stage undo boundaries', () => {
  it('restores placement without reverting patch, group masters or creative edits', () => {
    const before = stageSnapshot(initialShow)
    const edited = structuredClone(initialShow)
    edited.fixtures[0].position = [3, 4, 2]
    edited.fixtures[0].patch = { universe: 4, address: 200 }
    edited.groups[0].intensity = .23
    edited.colorProfiles[0].name = 'New creative work'
    const restored = restoreStage(edited, before)
    expect(restored.fixtures[0].position).toEqual(initialShow.fixtures[0].position)
    expect(restored.fixtures[0].patch).toEqual({ universe: 4, address: 200 })
    expect(restored.groups[0].intensity).toBe(.23)
    expect(restored.colorProfiles[0].name).toBe('New creative work')
  })
  it('undoes group creation and assignment together without dangling fixture groups', () => {
    const before = stageSnapshot(initialShow)
    const edited = structuredClone(initialShow)
    edited.groups.push({ id: 'new', name: 'New', intensity: 1 })
    edited.fixtures[0].groupId = 'new'
    const restored = restoreStage(edited, before)
    expect(restored.groups.some(g => g.id === 'new')).toBe(false)
    expect(restored.fixtures[0].groupId).toBe(initialShow.fixtures[0].groupId)
  })
  it('keeps a newly created group if unrelated current creative or control work references it', () => {
    const edited = structuredClone(initialShow)
    edited.groups.push({ id: 'new', name: 'New', intensity: .4 }, { id: 'control', name: 'Control', intensity: .8 })
    edited.programs[0].targetGroupIds = ['new']
    edited.controlSurface.bindings.push({ id: 'rotary', label: 'Rotary', action: 'group-intensity', targetId: 'control' })
    const restored = restoreStage(edited, stageSnapshot(initialShow))
    expect(restored.groups.find(g => g.id === 'new')?.intensity).toBe(.4)
    expect(restored.groups.some(g => g.id === 'control')).toBe(true)
  })
  it('restores member deletion and camera changes', () => {
    const before = structuredClone(initialShow)
    before.bandMembers = [{ id: 'singer', name: 'Singer', position: [0, 0, 1] }]
    const edited = { ...before, bandMembers: [], camera: { ...before.camera, fov: 60 } }
    expect(restoreStage(edited, stageSnapshot(before)).bandMembers).toEqual(before.bandMembers)
    expect(restoreStage(edited, stageSnapshot(before)).camera).toEqual(before.camera)
  })
  it('retains a new group referenced only by a Look layer', () => {
    const show = structuredClone(initialShow)
    show.groups.push({ id: 'side', name: 'Side', intensity: .7 })
    show.looks[0].layers = [{ groupId: 'side', mode: 'static', programId: null, colorProfileId: null, intensity: .8 }]
    expect(restoreStage(show, stageSnapshot(initialShow)).groups.find(group => group.id === 'side')?.intensity).toBe(.7)
  })
  it('ignores changes outside editor fields when deciding whether to create an undo step', () => {
    const edited = structuredClone(initialShow)
    edited.activeLookId = 'elsewhere'
    edited.groups[0].intensity = .1
    expect(sameStage(stageSnapshot(initialShow), stageSnapshot(edited))).toBe(true)
    edited.fixtures[0].position[0] += .25
    expect(sameStage(stageSnapshot(initialShow), stageSnapshot(edited))).toBe(false)
  })
})
