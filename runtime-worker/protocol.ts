import { materializeGroupTiming, type RuntimeState, type ShowDocument } from '../src/domain'
import { fixtureProfiles } from '../src/fixtures'
import { assertShowDocument } from '../src/show-validation'
import { assertPlaybackLiveState, playbackLivePreview } from '../src/playback-live-state'
import { createAudioLivePlayer, type AudioLiveSnapshot } from '../src/audio-live'
import type { KickAnalysis } from '../src/kick-analysis'

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
  return value as Record<string, unknown>
}
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))
  )
    throw new Error()
}
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 120
const beat = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e9

/** One validated snapshot; the caller owns time, commands and output, never this evaluator. */
export function createEngineProtocol() {
  let show: ShowDocument | undefined
  const player = createAudioLivePlayer()
  let analysis: KickAnalysis | undefined
  let previewKey: string | undefined, previewShow: ShowDocument | undefined
  return (input: unknown) => {
    let requestId = ''
    try {
      const request = object(input)
      if (identifier(request.requestId)) requestId = request.requestId
      if (request.version !== 1 || !requestId) throw new Error()
      if (request.op === 'load') {
        keys(request, ['version', 'requestId', 'op', 'show'])
        assertShowDocument(request.show)
        if (request.show.fixtures.length > 256) throw new Error()
        let heads = 0
        for (const fixture of request.show.fixtures) {
          const profile = fixtureProfiles.find((profile) => profile.id === fixture.profileId)
          if (!profile?.modes.some((mode) => mode.id === fixture.modeId)) throw new Error()
          if (profile.kind !== 'hazer') heads += fixture.visualSegments ?? 1
          if (heads > 256) throw new Error()
        }
        // Prepare first: validation/migration failure must leave the previous snapshot intact.
        const next = materializeGroupTiming(structuredClone(request.show))
        show = next
        player.reset()
        analysis = undefined
        previewKey = undefined
        previewShow = undefined
        return { version: 1, requestId, ok: true }
      }
      if (!show) throw new Error()
      if (request.op === 'audio') {
        keys(request, ['version', 'requestId', 'op', 'analysis'])
        if (request.analysis === null) {
          analysis = undefined
          player.reset()
          return { version: 1, requestId, ok: true }
        }
        const input = object(request.analysis)
        keys(input, ['duration', 'kicks', 'confidence'], ['bpm'])
        const finite = (v: unknown, min: number, max: number): v is number =>
          typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
        if (
          !finite(input.duration, 0.001, 600) ||
          !finite(input.confidence, 0, 1) ||
          (input.bpm != null && !finite(input.bpm, 1, 1000)) ||
          !Array.isArray(input.kicks) ||
          input.kicks.length > 7500
        )
          throw new Error()
        let previous = -1
        const kicks = input.kicks.map((value) => {
          const kick = object(value)
          keys(kick, ['time', 'strength'])
          if (!finite(kick.time, 0, input.duration as number) || kick.time <= previous || !finite(kick.strength, 0, 1))
            throw new Error()
          previous = kick.time
          return { time: kick.time, strength: kick.strength }
        })
        analysis = {
          duration: input.duration,
          confidence: input.confidence,
          bpm: (input.bpm as number | null) ?? null,
          kicks,
          waveform: [],
        }
        player.reset()
        return { version: 1, requestId, ok: true }
      }
      if (request.op === 'validate-live') {
        keys(request, ['version', 'requestId', 'op', 'live'])
        assertPlaybackLiveState(show, request.live)
        return { version: 1, requestId, ok: true }
      }
      if (request.op !== 'evaluate') throw new Error()
      keys(request, ['version', 'requestId', 'op', 'atBeats', 'state'], ['live', 'audio'])
      if (!beat(request.atBeats)) throw new Error()
      const state = object(request.state)
      keys(state, ['mode', 'activeLookId'], ['heldAtBeats', 'colorLockId'])
      if (
        !['automation', 'static', 'safety', 'blackout'].includes(state.mode as string) ||
        (show.looks.length ? !show.looks.some((look) => look.id === state.activeLookId) : state.activeLookId !== '') ||
        (Object.hasOwn(state, 'heldAtBeats') && !beat(state.heldAtBeats)) ||
        (Object.hasOwn(state, 'colorLockId') && !show.colorProfiles.some((profile) => profile.id === state.colorLockId))
      )
        throw new Error()
      let preview = { show, state: state as unknown as RuntimeState }
      if (Object.hasOwn(request, 'live')) {
        assertPlaybackLiveState(show, request.live)
        // Stable input identity distinguishes actual operator edits from repeated clock samples.
        const key = JSON.stringify([
          state.activeLookId,
          request.live.controls.overrides,
          request.live.groupIntensities,
          request.live.colorLockId,
        ])
        if (key !== previewKey) {
          previewShow = playbackLivePreview(show, preview.state, request.live).show
          previewKey = key
        }
        preview = {
          show: previewShow!,
          state: { ...preview.state, colorLockId: request.live.colorLockId ?? undefined },
        }
      } else {
        previewKey = undefined
        previewShow = undefined
      }
      let audio: AudioLiveSnapshot | undefined
      if (Object.hasOwn(request, 'audio')) {
        const input = object(request.audio)
        keys(input, ['seconds', 'playing', 'mode', 'bpm', 'reactions', 'decayMs', 'floor'])
        if (
          !analysis ||
          typeof input.playing !== 'boolean' ||
          !beat(input.seconds) ||
          input.seconds > analysis.duration ||
          !['tempo', 'kicks'].includes(input.mode as string) ||
          typeof input.bpm !== 'number' ||
          !Number.isFinite(input.bpm) ||
          input.bpm < 30 ||
          input.bpm > 240 ||
          typeof input.decayMs !== 'number' ||
          !Number.isFinite(input.decayMs) ||
          input.decayMs < 100 ||
          input.decayMs > 1000 ||
          typeof input.floor !== 'number' ||
          !Number.isFinite(input.floor) ||
          input.floor < 0 ||
          input.floor > 1 ||
          Math.abs(request.atBeats - (input.seconds * input.bpm) / 60) > 1e-9
        )
          throw new Error()
        const reactions = object(input.reactions)
        if (
          Object.entries(reactions).some(
            ([id, value]) =>
              !show!.groups.some((group) => group.id === id) ||
              !['look', 'pulse', 'step', 'static'].includes(value as string),
          )
        )
          throw new Error()
        audio = { ...input, analysis } as unknown as AudioLiveSnapshot
      } else if (analysis) throw new Error()
      const result = player.evaluate(preview.show, preview.state, request.atBeats, audio)
      // Content may be held at an earlier media instant; sample timestamps still identify this runtime evaluation.
      result.frame = { ...result.frame, atBeats: request.atBeats }
      return { version: 1, requestId, ok: true, ...result }
    } catch {
      return { version: 1, requestId, ok: false, error: 'Ongeldige engine-aanvraag, show of afspeelinstelling.' }
    }
  }
}
