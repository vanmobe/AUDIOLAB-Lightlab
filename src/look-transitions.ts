import {
  evaluateFrame,
  type EvaluatedFixture,
  type EvaluatedFrame,
  type FixtureProfile,
  type RuntimeState,
  type ShowDocument,
} from './domain'

export interface LookTransitionStatus {
  phase: 'queued' | 'fading'
  fromLookId: string
  toLookId: string
  startAtBeats: number
  endAtBeats: number
  progress: number
}
export interface TransitionResult {
  frame: EvaluatedFrame
  transition?: LookTransitionStatus
}
type Input = { show: ShowDocument; state: RuntimeState; creativeKey: string }
type Source = { input: Input } | { frame: EvaluatedFrame }
type Pending = { source: Source; fromFrame?: EvaluatedFrame; status: LookTransitionStatus }

function creativeSignature(show: ShowDocument, state: RuntimeState) {
  const look = show.looks.find((look) => look.id === state.activeLookId)
  return JSON.stringify([
    show.fixtures.map(({ id, profileId, modeId, groupId, position, visualSegments }) => ({
      id,
      profileId,
      modeId,
      groupId,
      position,
      visualSegments,
    })),
    show.groups.map(({ id, intensity }) => ({ id, intensity })),
    look && { id: look.id, programId: look.programId, colorProfileId: look.colorProfileId, layers: look.layers },
    show.programs.map(({ id, effect, targetGroupIds, rateBeats, defaultColorProfileId, pattern }) => ({
      id,
      effect,
      targetGroupIds,
      rateBeats,
      defaultColorProfileId,
      pattern,
    })),
    show.colorProfiles.map(({ id, primary, secondary, accent, white, intensityLimit }) => ({
      id,
      primary,
      secondary,
      accent,
      white,
      intensityLimit,
    })),
    show.regie,
    state.colorLockId,
  ])
}

function channel(color: string, offset: number) {
  return parseInt(color.slice(offset, offset + 2), 16) || 0
}
function mixLight(
  from: { intensity: number; color: string },
  to: { intensity: number; color: string },
  progress: number,
) {
  const intensity = from.intensity * (1 - progress) + to.intensity * progress
  // Blend emitted RGB, not unlit paint colors: a dark endpoint cannot tint a lit source.
  const color =
    '#' +
    [1, 3, 5]
      .map((offset) =>
        Math.round(
          intensity > 0
            ? (channel(from.color, offset) * from.intensity * (1 - progress) +
                channel(to.color, offset) * to.intensity * progress) /
                intensity
            : channel(to.color, offset),
        )
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  return { intensity, color }
}
export function mixTransitionFrames(from: EvaluatedFrame, to: EvaluatedFrame, progress: number): EvaluatedFrame {
  const amount = Math.max(0, Math.min(1, progress)),
    sources = new Map(from.fixtures.map((fixture) => [fixture.fixtureId, fixture]))
  return {
    ...to,
    fixtures: to.fixtures.map((target) => {
      const source = sources.get(target.fixtureId) ?? { ...target, intensity: 0, haze: 0, segments: undefined }
      const count = Math.max(source.segments?.length ?? 1, target.segments?.length ?? 1)
      const mixed = mixLight(source, target, amount)
      const segments =
        source.segments || target.segments
          ? Array.from({ length: count }, (_, index) =>
              mixLight(source.segments?.[index] ?? source, target.segments?.[index] ?? target, amount),
            )
          : undefined
      return {
        fixtureId: target.fixtureId,
        ...mixed,
        haze: source.haze * (1 - amount) + target.haze * amount,
        ...(segments
          ? {
              segments,
              intensity: segments.reduce((sum, segment) => sum + segment.intensity, 0) / segments.length,
              color: segments.find((segment) => segment.intensity > 0)?.color ?? mixed.color,
            }
          : {}),
      } satisfies EvaluatedFixture
    }),
  }
}

/** Session-only musical transition state. Inputs must be immutable; reset on show replacement. */
export function createLookTransitionPlayer(
  options: { evaluateFrame?: typeof evaluateFrame; animateSource?: boolean } = {},
) {
  const evaluate = options.evaluateFrame ?? evaluateFrame
  let previous: Input | undefined,
    pending: Pending | undefined,
    heldFrame: EvaluatedFrame | undefined,
    lastBeat: number | undefined
  function reset() {
    previous = undefined
    pending = undefined
    heldFrame = undefined
    lastBeat = undefined
  }
  function render(input: Input, profiles: FixtureProfile[], beat: number): TransitionResult {
    const target = () => evaluate(input.show, profiles, input.state, beat)
    if (!pending) return { frame: target() }
    const sourceAt = (at: number) =>
      'frame' in pending!.source
        ? { ...pending!.source.frame, atBeats: at }
        : evaluate(pending!.source.input.show, profiles, pending!.source.input.state, at)
    if (beat < pending.status.startAtBeats)
      return {
        frame: { ...sourceAt(beat), atBeats: beat, mode: input.state.mode },
        transition: { ...pending.status, phase: 'queued', progress: 0 },
      }
    if (beat >= pending.status.endAtBeats) {
      pending = undefined
      return { frame: target() }
    }
    // Audio endpoints must keep reacting to new kicks; interrupted fades still use
    // a captured mixed frame so repeated cues cannot grow a recursive render tree.
    const fromFrame = options.animateSource
      ? sourceAt(beat)
      : (pending.fromFrame ??= sourceAt(pending.status.startAtBeats))
    const progress = (beat - pending.status.startAtBeats) / (pending.status.endAtBeats - pending.status.startAtBeats)
    return {
      frame: mixTransitionFrames(fromFrame, target(), progress),
      transition: { ...pending.status, phase: 'fading', progress },
    }
  }
  return {
    reset,
    evaluate(show: ShowDocument, profiles: FixtureProfile[], state: RuntimeState, atBeats: number): TransitionResult {
      // Explicit seeking/reload starts a fresh player, never extrapolates a stale transition.
      if (lastBeat !== undefined && atBeats < lastBeat) reset()
      lastBeat = atBeats
      const old = previous
      // Derived input objects can change when merely linking groups or moving the camera.
      // Recompute only on input changes, not on musical ticks; ignore presentation metadata.
      const creativeKey =
        old &&
        show === old.show &&
        state.activeLookId === old.state.activeLookId &&
        state.colorLockId === old.state.colorLockId
          ? old.creativeKey
          : creativeSignature(show, state)
      const input = { show, state: { ...state }, creativeKey }
      const lookChanged = !!old && state.activeLookId !== old.state.activeLookId
      const edited = !!old && creativeKey !== old.creativeKey
      if (state.mode === 'blackout' || state.mode === 'safety') {
        pending = undefined
        heldFrame = undefined
      } else if (state.mode === 'static') {
        if (old && old.state.mode !== 'static' && pending) {
          const captured = render(old, profiles, state.heldAtBeats ?? atBeats).frame
          heldFrame = { ...captured, fixtures: captured.fixtures.map((fixture) => ({ ...fixture, haze: 0 })) }
        } else if (edited || lookChanged) heldFrame = undefined
        pending = undefined
        previous = input
        return {
          frame: heldFrame ? { ...heldFrame, atBeats, mode: 'static' } : evaluate(show, profiles, state, atBeats),
        }
      } else if (lookChanged) {
        const settings = show.regie?.transition
        if (settings && (settings.quantizeBeats > 0 || settings.fadeBeats > 0)) {
          const interrupted = !!pending
          const outgoing = heldFrame ?? render(old!, profiles, atBeats).frame
          const source: Source = interrupted || old!.state.mode !== 'automation' ? { frame: outgoing } : { input: old! }
          const start = settings.quantizeBeats
            ? Math.ceil((atBeats - 1e-9) / settings.quantizeBeats) * settings.quantizeBeats
            : atBeats
          pending = {
            source,
            status: {
              phase: 'queued',
              fromLookId: old!.state.activeLookId,
              toLookId: state.activeLookId,
              startAtBeats: start,
              endAtBeats: start + settings.fadeBeats,
              progress: 0,
            },
          }
        } else pending = undefined
        heldFrame = undefined
      } else if (edited || old?.state.mode !== state.mode) {
        // Operator edits (especially off/masters) win immediately over a queued/fading source.
        pending = undefined
        heldFrame = undefined
      }
      previous = input
      return render(input, profiles, atBeats)
    },
  }
}
