import { describe, expect, it } from 'vitest'
import { evaluateFrame, type RuntimeMode, type ShowDocument } from './domain'
import { initialShow } from './seed'
import { fixtureProfiles } from './fixtures'
import { createLookTransitionPlayer } from './look-transitions'
import { defaultShowRegie } from './show-regie'
import { assertShowDocument } from './show-validation'

function rig(quantizeBeats: 0 | 1 | 2 | 4 | 8 = 0, fadeBeats = 4) {
  const show = structuredClone(initialShow)
  show.regie = { ...defaultShowRegie(show), transition: { quantizeBeats, fadeBeats } }
  show.groups.forEach((group) => {
    group.intensity = group.id === 'effects' ? 0 : 1
  })
  show.colorProfiles[0] = { ...show.colorProfiles[0], primary: '#0000ff', accent: '#0000ff', intensityLimit: 1 }
  show.colorProfiles[1] = { ...show.colorProfiles[1], primary: '#ff0000', accent: '#ff0000', intensityLimit: 1 }
  for (const look of show.looks)
    look.layers = show.groups.map((group) => ({
      groupId: group.id,
      mode: group.id === 'effects' ? 'off' : 'static',
      programId: null,
      colorProfileId: null,
      intensity: 1,
      rateBeats: 1,
      offsetBeats: 0,
    }))
  return show
}
const state = (activeLookId: string, mode: RuntimeMode = 'automation', heldAtBeats?: number) => ({
  activeLookId,
  mode,
  ...(heldAtBeats === undefined ? {} : { heldAtBeats }),
})
const light = (result: ReturnType<ReturnType<typeof createLookTransitionPlayer>['evaluate']>) =>
  result.frame.fixtures[0]
describe('shared Look transitions', () => {
  it('preserves instant legacy frames, including static/haze, when transitions are absent', () => {
    const player = createLookTransitionPlayer()
    for (const at of [0, 0.4, 10])
      for (const mode of ['automation', 'static', 'safety', 'blackout'] as const) {
        const input = state(initialShow.looks[at === 0 ? 0 : 1].id, mode, 0.2)
        expect(player.evaluate(initialShow, fixtureProfiles, input, at)).toEqual({
          frame: evaluateFrame(initialShow, fixtureProfiles, input, at),
        })
      }
  })
  it('waits for the beat boundary and blends emitted colors over a musical duration', () => {
    const show = rig(4),
      player = createLookTransitionPlayer()
    player.evaluate(show, fixtureProfiles, state('warm-static'), 0)
    const queued = player.evaluate(show, fixtureProfiles, state('neon-chorus'), 1)
    expect(queued.transition).toMatchObject({ phase: 'queued', startAtBeats: 4, endAtBeats: 8 })
    expect(light(queued).color).toBe('#ff0000')
    expect(light(player.evaluate(show, fixtureProfiles, state('neon-chorus'), 4)).color).toBe('#ff0000')
    const halfway = player.evaluate(show, fixtureProfiles, state('neon-chorus'), 6)
    expect(halfway.transition?.progress).toBe(0.5)
    expect(light(halfway).color).toBe('#800080')
    expect(player.evaluate(show, fixtureProfiles, state('neon-chorus'), 8).transition).toBeUndefined()
  })
  it('interruption captures the current mixed frame without a jump or stale source', () => {
    const show = rig(),
      player = createLookTransitionPlayer()
    player.evaluate(show, fixtureProfiles, state('warm-static'), 0)
    player.evaluate(show, fixtureProfiles, state('neon-chorus'), 1)
    const midway = player.evaluate(show, fixtureProfiles, state('neon-chorus'), 3)
    const interrupted = player.evaluate(show, fixtureProfiles, state('warm-static'), 3)
    expect(interrupted.frame.fixtures).toEqual(midway.frame.fixtures)
    expect(light(player.evaluate(show, fixtureProfiles, state('warm-static'), 5)).color).toBe('#c00040')
  })
  it('captures an in-flight mix on static, and applies later operator edits at the held beat', () => {
    const show = rig(),
      player = createLookTransitionPlayer()
    player.evaluate(show, fixtureProfiles, state('warm-static'), 0)
    player.evaluate(show, fixtureProfiles, state('neon-chorus'), 1)
    const staticState = state('neon-chorus', 'static', 3)
    expect(light(player.evaluate(show, fixtureProfiles, staticState, 3)).color).toBe('#800080')
    expect(light(player.evaluate(show, fixtureProfiles, staticState, 10)).color).toBe('#800080')
    const edited = { ...show, groups: show.groups.map((group) => ({ ...group, intensity: 0 })) }
    expect(
      player
        .evaluate(edited, fixtureProfiles, staticState, 11)
        .frame.fixtures.every((fixture) => fixture.intensity === 0),
    ).toBe(true)
  })
  it('safety, blackout and explicit master/group edits cancel immediately', () => {
    for (const action of ['safety', 'blackout', 'edit'] as const) {
      const show = rig(),
        player = createLookTransitionPlayer()
      player.evaluate(show, fixtureProfiles, state('warm-static'), 0)
      player.evaluate(show, fixtureProfiles, state('neon-chorus'), 1)
      const next: ShowDocument =
        action === 'edit' ? { ...show, groups: show.groups.map((group) => ({ ...group, intensity: 0 })) } : show
      const input = state('neon-chorus', action === 'edit' ? 'automation' : action)
      const result = player.evaluate(next, fixtureProfiles, input, 2)
      expect(result.transition).toBeUndefined()
      expect(result.frame).toEqual(evaluateFrame(next, fixtureProfiles, input, 2))
    }
  })
  it('supports quantized cuts, reset/seek, and never fades edits of the same Look', () => {
    const show = rig(2, 0),
      player = createLookTransitionPlayer()
    player.evaluate(show, fixtureProfiles, state('warm-static'), 0)
    expect(player.evaluate(show, fixtureProfiles, state('neon-chorus'), 0.5).transition?.phase).toBe('queued')
    expect(light(player.evaluate(show, fixtureProfiles, state('neon-chorus'), 2)).color).toBe('#0000ff')
    expect(player.evaluate({ ...show }, fixtureProfiles, state('neon-chorus'), 3).transition).toBeUndefined()
    player.reset()
    expect(player.evaluate(show, fixtureProfiles, state('warm-static'), 4).transition).toBeUndefined()
    expect(player.evaluate(show, fixtureProfiles, state('neon-chorus'), 1).transition).toBeUndefined()
  })
  it('does not cancel a fade for equivalent derived inputs, linking or presentation changes', () => {
    const show = rig(),
      player = createLookTransitionPlayer()
    player.evaluate(show, fixtureProfiles, state('warm-static'), 0)
    player.evaluate(show, fixtureProfiles, state('neon-chorus'), 1)
    const derived = structuredClone(show)
    derived.camera.position[0] = 9
    derived.name = 'Renamed show'
    derived.groups[0].name = 'Renamed group'
    const result = player.evaluate(derived, fixtureProfiles, state('neon-chorus'), 3)
    expect(result.transition?.progress).toBe(0.5)
    expect(light(result).color).toBe('#800080')
  })
  it('rejects unknown fields and invalid saved transition bounds', () => {
    const show = rig()
    expect(() => assertShowDocument(show)).not.toThrow()
    for (const transition of [
      { quantizeBeats: 3, fadeBeats: 1 },
      { quantizeBeats: 0, fadeBeats: -1 },
      { quantizeBeats: 0, fadeBeats: 33 },
      { quantizeBeats: 0, fadeBeats: NaN },
      { quantizeBeats: 0, fadeBeats: 1, script: '' },
    ])
      expect(() => assertShowDocument({ ...show, regie: { ...show.regie, transition } })).toThrow()
  })
})
