import { describe, expect, it } from 'vitest'
import { initialShow } from './seed'
import { evaluateFrame, type RuntimeState } from './domain'
import { fixtureProfiles } from './fixtures'
import { emptyLiveControls, linkLiveGroups, updateLiveGroups, livePreview } from './live-controls'
import { assertPlaybackLiveState, playbackLivePreview, type PlaybackLiveState } from './playback-live-state'
import { createEngineProtocol } from '../runtime-worker/protocol'

const makeLive = (): PlaybackLiveState => ({ controls: emptyLiveControls(), groupIntensities: Object.fromEntries(initialShow.groups.map(g => [g.id, g.intensity])), colorLockId: null })
describe('runtime live transport', () => {
  it('uses existing linked overrides, masters, color lock and timing without modifying loaded show', () => {
    const before = JSON.stringify(initialShow)
    const live = makeLive()
    live.controls = linkLiveGroups(initialShow, live.controls, ['wash', 'back'])
    live.controls = updateLiveGroups(initialShow, live.controls, 'wash', { mode: 'animation', programId: initialShow.programs[1].id, rateBeats: 8, offsetBeats: -2, intensity: .6 })
    live.groupIntensities.wash = .2; live.groupIntensities.back = .2
    live.colorLockId = initialShow.colorProfiles[1].id
    assertPlaybackLiveState(initialShow, live)
    const protocol = createEngineProtocol()
    expect(protocol({ version: 1, requestId: 'load', op: 'load', show: initialShow }).ok).toBe(true)
    expect(protocol({ version: 1, requestId: 'validate', op: 'validate-live', live }).ok).toBe(true)
    for (const mode of ['automation', 'static', 'safety', 'blackout'] as const) {
      const state: RuntimeState = { mode, activeLookId: initialShow.activeLookId, heldAtBeats: .25 }
      const preview = playbackLivePreview(initialShow, state, live)
      const expected = evaluateFrame(preview.show, fixtureProfiles, preview.state, 3)
      const reply = protocol({ version: 1, requestId: 'eval', op: 'evaluate', atBeats: 3, state, live })
      expect(reply).toEqual({ version: 1, requestId: 'eval', ok: true, frame: expected })
      const direct = livePreview({ ...initialShow, groups: initialShow.groups.map(g => ({ ...g, intensity: live.groupIntensities[g.id] })) }, { ...state, colorLockId: live.colorLockId! }, live.controls)
      expect(evaluateFrame(direct.show, fixtureProfiles, direct.state, 3)).toEqual(expected)
    }
    expect(JSON.stringify(initialShow)).toBe(before)
  })
  it('rejects invalid data and stale references before evaluating without poisoning worker state', () => {
    const protocol = createEngineProtocol()
    protocol({ version: 1, requestId: 'load', op: 'load', show: initialShow })
    const invalids = [
      { ...makeLive(), colorLockId: 'missing' },
      { ...makeLive(), groupIntensities: {} },
      { ...makeLive(), groupIntensities: { ...makeLive().groupIntensities, wash: NaN } },
      { ...makeLive(), controls: { overrides: { missing: {} }, links: [] } },
      { ...makeLive(), controls: { overrides: { wash: { programId: 'missing' } }, links: [] } },
      { ...makeLive(), controls: { overrides: { wash: { rateBeats: 0 } }, links: [] } },
      { ...makeLive(), controls: { overrides: { wash: { offsetBeats: 65 } }, links: [] } },
      { ...makeLive(), controls: { overrides: { wash: { code: 'execute' } }, links: [] } },
      { ...makeLive(), controls: { overrides: {}, links: [['wash', 'back'], ['front', 'wash']] } },
      { ...makeLive(), controls: { overrides: {}, links: [['wash']] } },
      { ...makeLive(), controls: { overrides: {}, links: [['wash', 'missing']] } },
    ]
    for (const live of invalids) {
      expect(() => assertPlaybackLiveState(initialShow, live)).toThrow()
      expect(protocol({ version: 1, requestId: 'bad', op: 'validate-live', live }).ok).toBe(false)
    }
    expect(protocol({ version: 1, requestId: 'good', op: 'evaluate', atBeats: 0, state: { mode: 'automation', activeLookId: initialShow.activeLookId }, live: makeLive() }).ok).toBe(true)
  })
  it('keeps native property-looking group IDs as own data', () => {
    const show = { ...initialShow, groups: [{ id: '__proto__', name: 'Group', intensity: .8 }] }
    const live = { controls: { overrides: JSON.parse('{"__proto__":{"intensity":0.2}}'), links: [] }, groupIntensities: JSON.parse('{"__proto__":0.4}'), colorLockId: null }
    expect(() => assertPlaybackLiveState(show, live)).not.toThrow()
    expect(playbackLivePreview(show, { mode: 'automation', activeLookId: show.activeLookId }, live).show.groups[0].intensity).toBe(.4)
  })
  it('accepts bounded full-state collections larger than the old 16KiB command limit', () => {
    const groups = Array.from({ length: 256 }, (_, i) => ({ id: `group-${i}-${'x'.repeat(70)}`, name: `Group ${i}`, intensity: .5 }))
    const show = { ...initialShow, groups }
    const live: PlaybackLiveState = {
      controls: { overrides: Object.fromEntries(groups.map(g => [g.id, { mode: 'static', programId: null, rateBeats: 8, offsetBeats: -2 }])), links: [] },
      groupIntensities: Object.fromEntries(groups.map(g => [g.id, .5])), colorLockId: null,
    }
    expect(JSON.stringify(live).length).toBeGreaterThan(16384)
    expect(JSON.stringify(live).length).toBeLessThan(1024 * 1024)
    expect(() => assertPlaybackLiveState(show, live)).not.toThrow()
  })
})
