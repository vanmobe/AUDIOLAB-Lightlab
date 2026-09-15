import { describe, expect, it } from 'vitest'
import { animationEffects, applyAbsoluteRotary, evaluateFrame, validateShow, type AnimationEffect, type ShowDocument } from './domain'
import { assertShowDocument } from './show-validation'
import { fixtureProfiles } from './fixtures'
import { createShowPackage, createVersion, parseShowPackage } from './show-package'

const show: ShowDocument = {
  schemaVersion: 1, name: 'Test show',
  groups: [{ id: 'front', name: 'Front', intensity: 1 }, { id: 'wash', name: 'Wash', intensity: 1 }],
  fixtures: [
    { id: 'front-1', name: 'Front 1', profileId: 'varytec-theater-spot-100', modeId: '2ch', groupId: 'front', patch: { universe: 1, address: 1 }, position: [0, 3, 2], aim: [0, 0, 0] },
    { id: 'wash-1', name: 'Wash 1', profileId: 'adj-mega-tripar-profile-plus', modeId: '4ch', groupId: 'wash', patch: { universe: 1, address: 3 }, position: [1, 3, 0], aim: [0, 0, 0] },
  ],
  routes: [{ id: 'route-1', universe: 1, protocol: 'artnet', host: '192.168.1.10', enabled: true }],
  colorProfiles: [{ id: 'warm', name: 'Warm', primary: '#ff8500', secondary: '#ffb000', accent: '#fff1d6', white: '#ffffff', intensityLimit: 1 }],
  programs: [{ id: 'steady', name: 'Steady', effect: 'static', targetGroupIds: ['front', 'wash'], rateBeats: 1, defaultColorProfileId: 'warm' }],
  looks: [{ id: 'warm-look', name: 'Warm Look', programId: 'steady', colorProfileId: 'warm' }],
  activeLookId: 'warm-look',
  controlSurface: { profileId: 'wing-rack', bindings: [] },
  sync: { source: 'direct-audio', audioDeviceName: 'Test input', lightingOffsetMs: 0 },
  camera: { position: [0, 6, 12], target: [0, 1, 0], fov: 48 },
}

describe('lighting domain', () => {
  it.each(['automation', 'static'] as const)('keeps a valid empty design dark in %s while retaining front-only mode', mode => {
    const empty = { ...structuredClone(show), programs: [], colorProfiles: [], looks: [], activeLookId: '' }
    expect(() => assertShowDocument(empty)).not.toThrow()
    const state = { mode, activeLookId: '' }
    expect(evaluateFrame(empty, fixtureProfiles, state, 1).fixtures.every(fixture => fixture.intensity === 0 && fixture.haze === 0)).toBe(true)
    expect(evaluateFrame(empty, fixtureProfiles, { ...state, mode: 'safety' }, 1).fixtures[0].intensity).toBe(.8)
  })
  it('keeps front-only mode independent of a dark creative palette or color lock', () => {
    const edited = structuredClone(show)
    edited.colorProfiles.push({ ...edited.colorProfiles[0], id: 'dark', intensityLimit: 0 })
    edited.groups[0].intensity = .5
    const state = { mode: 'safety' as const, activeLookId: edited.activeLookId, colorLockId: 'dark' }
    expect(evaluateFrame(edited, fixtureProfiles, state, 1).fixtures[0].intensity).toBe(.4)
    edited.groups[0].intensity = 0
    expect(evaluateFrame(edited, fixtureProfiles, state, 1).fixtures[0].intensity).toBe(0)
  })
  it('does not attenuate static and pulse programs with the inactive chase level', () => {
    const edited = structuredClone(show)
    const state = { mode: 'automation' as const, activeLookId: 'warm-look' }
    expect(evaluateFrame(edited, fixtureProfiles, state, 0).fixtures[0].intensity).toBe(1)
    edited.programs[0].effect = 'pulse'
    expect(evaluateFrame(edited, fixtureProfiles, state, .25).fixtures[0].intensity).toBeCloseTo(.8)
    edited.programs[0].effect = 'chase'
    expect(evaluateFrame(edited, fixtureProfiles, state, 0).fixtures[1].intensity).toBeCloseTo(.28)
  })
  it('keeps fixed-white fixtures warm while RGB fixtures follow palette changes', () => {
    const edited = structuredClone(show)
    const state = { mode: 'automation' as const, activeLookId: 'warm-look' }
    const before = evaluateFrame(edited, fixtureProfiles, state, 0)
    edited.colorProfiles[0].primary = '#0000ff'
    edited.colorProfiles[0].accent = '#ff00ff'
    edited.colorProfiles[0].white = '#00ff00'
    const after = evaluateFrame(edited, fixtureProfiles, state, 0)
    expect(after.fixtures[0].color).toBe('#fff1d6')
    expect(after.fixtures[0].color).toBe(before.fixtures[0].color)
    expect(after.fixtures[1].color).toBe('#0000ff')
    edited.groups[0].intensity = 0
    expect(evaluateFrame(edited, fixtureProfiles, state, 0).fixtures[0].intensity).toBe(0)
    expect(evaluateFrame(edited, fixtureProfiles, { ...state, mode: 'safety' }, 0).fixtures[0].color).toBe('#fff1d6')
  })
  it.each(['static', 'pulse', 'chase'] as const)('keeps the Varytec emitter fixed throughout %s and color locks', (effect) => {
    const edited = structuredClone(show)
    edited.programs[0].effect = effect
    edited.colorProfiles.push({ ...edited.colorProfiles[0], id: 'blue', primary: '#0000ff', accent: '#ff00ff', white: '#00ff00' })
    for (const beat of [0, .25, 1, 2.5, 16]) {
      const frame = evaluateFrame(edited, fixtureProfiles, { mode: 'automation', activeLookId: edited.activeLookId, colorLockId: 'blue' }, beat)
      expect(frame.fixtures[0].color).toBe('#fff1d6')
    }
  })
  it('finds overlapping patch ranges', () => {
    const invalid = structuredClone(show)
    invalid.fixtures[1].patch!.address = 2
    expect(validateShow(invalid, fixtureProfiles).some((issue) => issue.message.includes('DMX-overlap'))).toBe(true)
  })

  it('blocks a fixture personality that runs past DMX channel 512', () => {
    const invalid = structuredClone(show)
    invalid.fixtures[1].patch!.address = 510
    expect(validateShow(invalid, fixtureProfiles).some((issue) => issue.message.includes('kanaal 512'))).toBe(true)
  })

  it('blocks two armed protocols on the same universe', () => {
    const invalid = structuredClone(show)
    invalid.routes.push({ id: 'route-duplicate', universe: 1, protocol: 'sacn', host: '192.168.1.11', enabled: true })
    expect(validateShow(invalid, fixtureProfiles).some((issue) => issue.message.includes('meer dan één actieve outputroute'))).toBe(true)
  })

  it('does not jump before an absolute rotary has picked up its current value', () => {
    expect(applyAbsoluteRotary(0.8, 0.2, false)).toEqual({ value: 0.8, pickup: false })
    expect(applyAbsoluteRotary(0.8, 0.78, false)).toEqual({ value: 0.78, pickup: true })
  })

  it('lets blackout override every evaluated fixture', () => {
    const frame = evaluateFrame(show, fixtureProfiles, { mode: 'blackout', activeLookId: 'warm-look' }, 4)
    expect(frame.fixtures.every((fixture) => fixture.intensity === 0 && fixture.haze === 0)).toBe(true)
  })

  it('uses the partial safety look only for the front group', () => {
    const frame = evaluateFrame(show, fixtureProfiles, { mode: 'safety', activeLookId: 'warm-look' }, 4)
    expect(frame.fixtures.find((fixture) => fixture.fixtureId === 'front-1')!.intensity).toBeGreaterThan(0)
    expect(frame.fixtures.find((fixture) => fixture.fixtureId === 'wash-1')!.intensity).toBe(0)
  })

  it('creates a portable versioned show package without retaining mutable references', () => {
    const version = createVersion(show, 'Warm look approved', new Date('2026-09-13T12:00:00.000Z'))
    const packaged = createShowPackage(show, [version])
    show.name = 'Changed afterwards'
    const restored = parseShowPackage(JSON.stringify(packaged))
    expect(restored.show.name).toBe('Test show')
    expect(restored.versions[0].note).toBe('Warm look approved')
  })
})

describe('expanded spatial patterns', () => {
  function patternShow(effect: AnimationEffect) {
    const edited = structuredClone(show)
    edited.programs[0] = { ...edited.programs[0], effect, rateBeats: 4, targetGroupIds: ['wash'] }
    // One four-head bar exercises sequencing within a fixture, not just between fixtures.
    edited.fixtures[1] = { ...edited.fixtures[1], profileId: 'stairville-stage-tri', modeId: '14ch', visualSegments: 4 }
    return edited
  }
  const state = { mode: 'automation' as const, activeLookId: 'warm-look' }
  const effects = animationEffects.filter(item => !['static', 'pulse', 'chase'].includes(item.id)).map(item => item.id)
  it.each(animationEffects.map(item => item.id))('accepts %s in schema 1 without migrating old shows', effect => {
    expect(() => assertShowDocument(patternShow(effect))).not.toThrow()
  })
  it.each(effects)('%s is seek-deterministic, freezes and respects targets, group levels and blackout', effect => {
    const edited = patternShow(effect)
    edited.groups[1].intensity = .5
    const frame = evaluateFrame(edited, fixtureProfiles, state, 1.4)
    evaluateFrame(edited, fixtureProfiles, state, 100)
    expect(evaluateFrame(edited, fixtureProfiles, state, 1.4)).toEqual(frame)
    expect(frame.fixtures[0].intensity).toBe(0)
    const levels = frame.fixtures[1].segments!.map(item => item.intensity)
    expect(levels.every(level => level >= 0 && level <= .5)).toBe(true)
    expect(new Set(levels).size).toBeGreaterThan(1)
    expect(evaluateFrame(edited, fixtureProfiles, { ...state, mode: 'static', heldAtBeats: 1.4 }, 99).fixtures).toEqual(frame.fixtures)
    expect(evaluateFrame(edited, fixtureProfiles, { ...state, mode: 'blackout' }, 1.4).fixtures.every(item => item.intensity === 0 && item.haze === 0 && !item.segments)).toBe(true)
  })
  it('runs a full four-head sequence in rateBeats, then repeats', () => {
    const edited = patternShow('sequence')
    for (let beat = 0; beat <= 4; beat++) {
      const output = evaluateFrame(edited, fixtureProfiles, state, beat).fixtures[1]
      expect(output.segments!.map(item => item.intensity)).toEqual([0, 1, 2, 3].map(index => index === beat % 4 ? 1 : 0))
      expect(output.intensity).toBe(.25)
    }
  })
  it('treats a grouped 3-channel bar as one point rather than four independent heads', () => {
    const edited = patternShow('sequence')
    edited.fixtures[1].modeId = '3ch'
    const output = evaluateFrame(edited, fixtureProfiles, state, 1).fixtures[1]
    expect(output.segments).toHaveLength(1)
    expect(output.intensity).toBe(1)
    expect(output.segments![0]).toEqual({ intensity: output.intensity, color: output.color })
  })
  it('builds progressively and resets at the complete cycle boundary', () => {
    const edited = patternShow('build')
    expect([0, 1, 2, 3, 4].map(beat => evaluateFrame(edited, fixtureProfiles, state, beat).fixtures[1].intensity)).toEqual([.25, .5, .75, 1, .25])
  })
  it('orders target fixtures by x, then z and stable id, not document order', () => {
    const edited = patternShow('sequence')
    const lamp = { ...edited.fixtures[1], visualSegments: 1 }
    edited.fixtures = [
      { ...lamp, id: 'c', position: [2, 1, 0] },
      { ...lamp, id: 'b', position: [-2, 1, 1] },
      { ...lamp, id: 'a', position: [-2, 1, -1] },
    ]
    expect([0, 4 / 3, 8 / 3].map(beat => evaluateFrame(edited, fixtureProfiles, state, beat).fixtures.find(item => item.intensity === 1)!.fixtureId)).toEqual(['a', 'b', 'c'])
  })
  it('twinkles fade within their interval and waves move smoothly', () => {
    const edited = patternShow('sparkle')
    const brightness = (beat: number) => evaluateFrame(edited, fixtureProfiles, state, beat).fixtures[1].intensity
    expect(brightness(0)).toBe(0)
    expect(brightness(1)).toBeLessThan(brightness(2))
    expect(brightness(3)).toBeCloseTo(brightness(1))
    edited.programs[0].effect = 'wave'
    const first = evaluateFrame(edited, fixtureProfiles, state, 0).fixtures[1].segments!
    const nearby = evaluateFrame(edited, fixtureProfiles, state, .001).fixtures[1].segments!
    expect(first.every((segment, index) => Math.abs(segment.intensity - nearby[index].intensity) < .01)).toBe(true)
    expect(evaluateFrame(edited, fixtureProfiles, state, 1).fixtures[1].segments![1].intensity).toBe(1)
  })
  it.each(effects)('%s ignores unrelated fixtures and storage order and limits RGB to two palette colors', effect => {
    const edited = patternShow(effect)
    const before = evaluateFrame(edited, fixtureProfiles, state, 1.4).fixtures[1]
    edited.fixtures.reverse()
    edited.fixtures.unshift({ ...edited.fixtures[1], id: 'unrelated', position: [-50, 1, 0] })
    expect(evaluateFrame(edited, fixtureProfiles, state, 1.4).fixtures.find(item => item.fixtureId === before.fixtureId)).toEqual(before)
    const colors = new Set(before.segments!.map(item => item.color))
    expect(colors).toEqual(new Set([edited.colorProfiles[0].primary, edited.colorProfiles[0].accent]))
  })
  it.each(effects)('%s preserves fixed warm white and does not treat hazers as light points', effect => {
    const edited = patternShow(effect)
    edited.programs[0].targetGroupIds.push('front')
    const before = evaluateFrame(edited, fixtureProfiles, state, 1.4)
    edited.fixtures.push({ ...edited.fixtures[0], id: 'haze', profileId: 'stairville-hz-200', modeId: '1ch', position: [-10, 0, 0] })
    const after = evaluateFrame(edited, fixtureProfiles, state, 1.4)
    expect(after.fixtures.slice(0, 2)).toEqual(before.fixtures)
    expect(after.fixtures[0].segments![0].color).toBe('#fff1d6')
    expect(after.fixtures[2].segments).toBeUndefined()
  })
  it('random selections change across intervals without changing mid-interval', () => {
    const edited = patternShow('random')
    expect(evaluateFrame(edited, fixtureProfiles, state, .1).fixtures).toEqual(evaluateFrame(edited, fixtureProfiles, state, 3.9).fixtures)
    const patterns = [0, 4, 8, 12, 16, 20].map(beat => JSON.stringify(evaluateFrame(edited, fixtureProfiles, state, beat).fixtures[1].segments))
    expect(new Set(patterns).size).toBeGreaterThan(1)
  })
})
