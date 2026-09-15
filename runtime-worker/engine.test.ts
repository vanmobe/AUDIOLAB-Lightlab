import { beforeAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { build } from 'vite'
import { createEngineProtocol } from './protocol'
import { animationEffects, evaluateFrame, materializeGroupTiming, type RuntimeState } from '../src/domain'
import { initialShow } from '../src/seed'
import { fixtureProfiles } from '../src/fixtures'
import { playbackLivePreview, type PlaybackLiveState } from '../src/playback-live-state'
import { createLookTransitionPlayer } from '../src/look-transitions'
import { defaultShowRegie } from '../src/show-regie'
import { createAudioLivePlayer, type AudioLiveSnapshot } from '../src/audio-live'

const load = (show = initialShow) => ({ version: 1, requestId: 'load', op: 'load', show })
const evaluate = (
  atBeats = 2,
  state: RuntimeState = { mode: 'automation', activeLookId: initialShow.activeLookId },
) => ({ version: 1, requestId: 'frame', op: 'evaluate', atBeats, state })

describe('autonomous evaluator protocol', () => {
  it('requires a loaded snapshot, clones input and retains it after an invalid replacement', () => {
    const handle = createEngineProtocol()
    expect(handle(evaluate()).ok).toBe(false)
    const source = structuredClone(initialShow)
    expect(handle(load(source)).ok).toBe(true)
    const before = handle(evaluate())
    source.groups[0].intensity = 0
    expect(handle(evaluate())).toEqual(before)
    expect(handle(load({ ...source, schemaVersion: 99 } as never)).ok).toBe(false)
    expect(handle(evaluate())).toEqual(before)
  })
  it('rejects oversized rigs and unknown personalities without modifying the snapshot', () => {
    const handle = createEngineProtocol()
    handle(load())
    const show = structuredClone(initialShow)
    show.fixtures = Array.from({ length: 257 }, (_, index) => ({ ...show.fixtures[0], id: String(index) }))
    expect(handle(load(show)).ok).toBe(false)
    show.fixtures = show.fixtures.slice(0, 5).map((fixture) => ({ ...fixture, visualSegments: 64 }))
    expect(handle(load(show)).ok).toBe(false)
    show.fixtures = [{ ...show.fixtures[0], profileId: 'unknown' }]
    expect(handle(load(show)).ok).toBe(false)
    expect(handle(evaluate()).ok).toBe(true)
  })
  it('rejects extra fields, invalid references, unsupported versions and invalid time', () => {
    const handle = createEngineProtocol()
    handle(load())
    for (const request of [
      null,
      { ...load(), version: 2 },
      { ...evaluate(), requestId: 'a'.repeat(121) },
      { ...evaluate(), script: 'untrusted' },
      { ...evaluate(), atBeats: -1 },
      { ...evaluate(), atBeats: Infinity },
      { ...evaluate(), state: { ...evaluate().state, activeLookId: 'missing' } },
      { ...evaluate(), state: { ...evaluate().state, mode: 'bad' } },
      { ...evaluate(), state: { ...evaluate().state, colorLockId: 'missing' } },
      { ...evaluate(), state: { ...evaluate().state, heldAtBeats: -1 } },
      { ...evaluate(), state: { ...evaluate().state, extra: true } },
    ])
      expect(handle(request).ok).toBe(false)
  })
})

describe('bundled Node process parity', () => {
  beforeAll(async () => {
    await build({ configFile: 'vite.engine.config.ts', logLevel: 'silent' })
  })
  const run = (input: string) =>
    spawnSync(process.execPath, [resolve('runtime-worker/dist/engine.mjs')], {
      input,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 10_000,
    })
  it('carries individual-kick fades through the real bundled process without changing the audio wire clock', () => {
    const show = materializeGroupTiming(structuredClone(initialShow))
    show.regie = { ...defaultShowRegie(show), transition: { quantizeBeats: 0, fadeBeats: 2 } }
    const analysis = {
      duration: 10,
      kicks: [
        { time: 0.7, strength: 1 },
        { time: 1.4, strength: 1 },
      ],
      bpm: 90,
      confidence: 1,
    }
    const player = createAudioLivePlayer(),
      sharedAnalysis = { ...analysis, waveform: [] }
    const requests: unknown[] = [load(show), { version: 1, requestId: 'audio', op: 'audio', analysis }]
    const expected: unknown[] = [
      { version: 1, requestId: 'load', ok: true },
      { version: 1, requestId: 'audio', ok: true },
    ]
    for (const [seconds, look, mode] of [
      [0, 0, 'automation'],
      [0.7, 1, 'automation'],
      [1, 1, 'automation'],
      [1.4, 1, 'automation'],
      [1.4, 0, 'automation'],
      [1.5, 0, 'static'],
      [2, 0, 'blackout'],
    ] as const) {
      const state: RuntimeState = { activeLookId: show.looks[look].id, mode }
      const position = {
        seconds,
        playing: true,
        mode: 'kicks' as const,
        bpm: 90,
        decayMs: 100,
        floor: 0.2,
        reactions: Object.fromEntries(show.groups.map((group) => [group.id, 'pulse' as const])),
      }
      const beat = (seconds * position.bpm) / 60
      const result = player.evaluate(show, state, beat, {
        ...position,
        analysis: sharedAnalysis,
      } satisfies AudioLiveSnapshot)
      result.frame.atBeats = beat
      if (seconds === 1) expect(result.transition?.progress).toBeCloseTo(0.225)
      requests.push({ ...evaluate(beat, state), audio: position })
      expected.push({ version: 1, requestId: 'frame', ok: true, ...result })
    }
    const child = run(requests.map((request) => JSON.stringify(request)).join('\n') + '\n')
    expect(child.status, child.stderr).toBe(0)
    expect(
      child.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    ).toEqual(expected)
  })
  it('matches the browser transition controller through queued, interrupted, held and blackout frames', () => {
    const show = materializeGroupTiming(structuredClone(initialShow))
    show.regie = { ...defaultShowRegie(show), transition: { quantizeBeats: 2, fadeBeats: 4 } }
    const player = createLookTransitionPlayer()
    const samples = [
      { at: 0, state: { mode: 'automation', activeLookId: 'warm-static' } },
      { at: 0.5, state: { mode: 'automation', activeLookId: 'neon-chorus' } },
      { at: 2, state: { mode: 'automation', activeLookId: 'neon-chorus' } },
      { at: 3, state: { mode: 'automation', activeLookId: 'neon-chorus' } },
      { at: 3, state: { mode: 'automation', activeLookId: 'warm-static' } },
      { at: 4, state: { mode: 'static', activeLookId: 'warm-static', heldAtBeats: 3.5 } },
      { at: 9, state: { mode: 'static', activeLookId: 'warm-static', heldAtBeats: 3.5 } },
      { at: 10, state: { mode: 'blackout', activeLookId: 'warm-static' } },
    ] as Array<{ at: number; state: RuntimeState }>
    const requests = [load(show), ...samples.map((sample) => evaluate(sample.at, sample.state))]
    const expected = [
      { version: 1, requestId: 'load', ok: true },
      ...samples.map((sample) => ({
        version: 1,
        requestId: 'frame',
        ok: true,
        ...player.evaluate(show, fixtureProfiles, sample.state, sample.at),
      })),
    ]
    const child = run(requests.map((request) => JSON.stringify(request)).join('\n') + '\n')
    expect(child.status, child.stderr).toBe(0)
    expect(
      child.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    ).toEqual(expected)
  })
  it('matches direct shared-source playback for every legacy effect and layered recipes at exact beats', () => {
    const requests: unknown[] = [],
      expected: unknown[] = []
    const shows = animationEffects.map((effect) => {
      const show = structuredClone(initialShow)
      show.programs[0].effect = effect.id
      show.programs[0].rateBeats = 2.5
      return show
    })
    const recipe = materializeGroupTiming(structuredClone(initialShow))
    recipe.programs[0].pattern = {
      version: 1,
      floor: 0.2,
      steps: [
        { selection: 'moving', direction: 'inward', envelope: 'fade-out', width: 1, trail: 0.5, level: 1, weight: 2 },
        { selection: 'random', direction: 'forward', envelope: 'pulse', width: 2, trail: 0, level: 0.8, weight: 1 },
      ],
    }
    recipe.looks[0].layers = recipe.looks[0].layers!.map((layer, index) => ({
      ...layer,
      mode: layer.mode === 'off' ? 'off' : 'animation',
      programId: layer.mode === 'off' ? null : recipe.programs[0].id,
      rateBeats: index + 0.5,
      offsetBeats: index % 2 ? -0.75 : 0.25,
    }))
    expect(
      evaluateFrame(
        recipe,
        fixtureProfiles,
        { mode: 'automation', activeLookId: recipe.activeLookId },
        0.375,
      ).fixtures.some((fixture) => fixture.segments?.length === 4),
    ).toBe(true)
    shows.push(recipe)
    // Additive show settings must cross the real process boundary with exact browser parity.
    shows.push({
      ...recipe,
      regie: {
        minimumCoverage: { percent: 80, threshold: 0.1 },
        colorRoles: ['primary', 'secondary', 'accent', 'white'],
        safetyGroupIds: ['wash'],
      },
    })
    for (const show of shows) {
      requests.push(load(show))
      expected.push({ version: 1, requestId: 'load', ok: true })
      for (const at of [0, 0.375, 128.7])
        for (const mode of ['automation', 'static', 'safety', 'blackout'] as const) {
          const state = { mode, activeLookId: show.activeLookId, heldAtBeats: 0.375, colorLockId: 'neon' }
          requests.push(evaluate(at, state))
          expected.push({
            version: 1,
            requestId: 'frame',
            ok: true,
            frame: evaluateFrame(show, fixtureProfiles, state, at),
          })
        }
    }
    const child = run(requests.map((request) => JSON.stringify(request)).join('\n') + '\n')
    expect(child.status, child.stderr).toBe(0)
    expect(child.stderr).toBe('')
    expect(
      child.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    ).toEqual(expected)
  })
  it('recovers from malformed lines and accepts a final complete message at EOF', () => {
    const child = run('broken-json\n' + JSON.stringify(load()) + '\n' + JSON.stringify(evaluate()))
    expect(child.status, child.stderr).toBe(0)
    expect(
      child.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line).ok),
    ).toEqual([false, true, true])
  })
  it('carries live overrides, linked groups, masters and lock through the actual process protocol', () => {
    const live: PlaybackLiveState = {
      controls: {
        overrides: {
          wash: {
            mode: 'animation',
            programId: initialShow.programs[1].id,
            rateBeats: 8,
            offsetBeats: -2,
            intensity: 0.7,
          },
          back: {
            mode: 'animation',
            programId: initialShow.programs[1].id,
            rateBeats: 8,
            offsetBeats: -2,
            intensity: 0.7,
          },
        },
        links: [['wash', 'back']],
      },
      groupIntensities: Object.fromEntries(initialShow.groups.map((g) => [g.id, 0.35])),
      colorLockId: initialShow.colorProfiles[1].id,
    }
    const requests: unknown[] = [
      load(),
      { version: 1, requestId: 'bad', op: 'validate-live', live: { ...live, colorLockId: 'missing' } },
      { version: 1, requestId: 'valid', op: 'validate-live', live },
    ]
    const expectedFrames = []
    for (const mode of ['automation', 'static', 'safety', 'blackout'] as const) {
      const state = { mode, activeLookId: initialShow.activeLookId, heldAtBeats: 0.5 }
      requests.push({ ...evaluate(4, state), live })
      const preview = playbackLivePreview(materializeGroupTiming(initialShow), state, live)
      expectedFrames.push(evaluateFrame(preview.show, fixtureProfiles, preview.state, 4))
    }
    const child = run(requests.map((r) => JSON.stringify(r)).join('\n') + '\n')
    expect(child.status, child.stderr).toBe(0)
    const replies = child.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(replies.slice(0, 3).map((r) => r.ok)).toEqual([true, false, true])
    expect(replies.slice(3).map((r) => r.frame)).toEqual(expectedFrames)
  })
  it('terminates on oversized lines without echoing input or accepting following commands', () => {
    const child = run('x'.repeat(2 * 1024 * 1024 + 1) + '\n' + JSON.stringify(load()))
    expect(child.status).toBe(1)
    expect(child.stdout).toBe('')
    expect(child.stderr).toBe('Engine gestopt: protocol- of streamfout.\n')
  })
})
