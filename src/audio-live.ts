import { type RuntimeState, type ShowDocument } from './domain'
import { fixtureProfiles } from './fixtures'
import { createLookTransitionPlayer, type TransitionResult } from './look-transitions'
import { audioPreviewFrame, type AudioReaction } from './audio-reactivity'
import type { KickAnalysis } from './kick-analysis'

export interface AudioLiveSnapshot {
  seconds: number
  analysis: KickAnalysis
  mode: 'tempo' | 'kicks'
  bpm: number
  reactions: Record<string, AudioReaction>
  decayMs: number
  floor: number
  playing?: boolean
}
export interface AudioLiveSource {
  read(): AudioLiveSnapshot | undefined
}

/** Shared browser/worker adapter. The caller owns media time and any transport. */
export function createAudioLivePlayer() {
  const transitions = createLookTransitionPlayer()
  let kickAudio: AudioLiveSnapshot | undefined
  const kickTransitions = createLookTransitionPlayer({
    animateSource: true,
    evaluateFrame(show, _profiles, state, beat) {
      const audio = kickAudio!
      // Preserve the exact current media timestamp at kick boundaries; an absolute
      // beats→seconds roundtrip can round just below a detected kick.
      const seconds = audio.seconds + ((beat - (audio.seconds * audio.bpm) / 60) * 60) / audio.bpm
      const frame = audioPreviewFrame(
        show,
        state.activeLookId,
        seconds,
        audio.analysis,
        audio.reactions,
        audio.bpm,
        audio.decayMs,
        audio.floor,
        state.mode === 'static' ? { ...state, mode: 'automation' } : state,
      )
      return state.mode === 'static'
        ? { ...frame, mode: 'static', fixtures: frame.fixtures.map((item) => ({ ...item, haze: 0 })) }
        : frame
    },
  })
  let clock: 'free' | 'tempo' | 'kicks' | undefined
  let heldSeconds: number | undefined
  let heldBpm: number | undefined
  let previousSeconds = 0
  let previousBpm = 120
  return {
    reset() {
      transitions.reset()
      kickTransitions.reset()
      kickAudio = undefined
      clock = undefined
      heldSeconds = undefined
      heldBpm = undefined
      previousSeconds = 0
    },
    evaluate(show: ShowDocument, state: RuntimeState, freeBeats: number, audio?: AudioLiveSnapshot): TransitionResult {
      const nextClock = audio?.mode ?? 'free'
      if (clock !== nextClock) {
        transitions.reset()
        kickTransitions.reset()
        kickAudio = undefined
        heldSeconds = undefined
        heldBpm = undefined
        clock = nextClock
        previousSeconds = audio?.seconds ?? 0
        previousBpm = audio?.bpm ?? 120
      }
      if (!audio) return transitions.evaluate(show, fixtureProfiles, state, freeBeats)
      // Capture media time, not the unrelated free-running rehearsal clock.
      if (state.mode === 'static') {
        heldSeconds ??= previousSeconds
        heldBpm ??= previousBpm
      } else {
        heldSeconds = undefined
        heldBpm = undefined
      }
      const seconds = heldSeconds ?? audio.seconds
      const bpm = heldBpm ?? audio.bpm
      previousSeconds = audio.seconds
      previousBpm = audio.bpm
      const beat = (seconds * bpm) / 60
      if (audio.mode === 'tempo')
        return transitions.evaluate(
          show,
          fixtureProfiles,
          state.mode === 'static' ? { ...state, heldAtBeats: beat } : state,
          beat,
        )
      // Audio beats are absolute media-position × BPM (also the runtime wire clock).
      // A tempo edit/reanalysis therefore cancels an old fade instead of jumping its progress.
      if (kickAudio && (kickAudio.bpm !== bpm || kickAudio.analysis !== audio.analysis)) kickTransitions.reset()
      kickAudio = { ...audio, seconds, bpm }
      // Keep the authored show stable: per-kick layer changes are evaluated inside
      // the renderer and must not be mistaken for operator edits cancelling a fade.
      return kickTransitions.evaluate(
        show,
        fixtureProfiles,
        state.mode === 'static' ? { ...state, heldAtBeats: beat } : state,
        beat,
      )
    },
  }
}
