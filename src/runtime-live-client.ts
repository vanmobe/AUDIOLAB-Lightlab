import type { EvaluatedFrame, ShowDocument } from './domain'
import { assertPlaybackLiveState } from './playback-live-state'
import type { LiveControls } from './live-controls'
import type { LookTransitionStatus } from './look-transitions'
import { getFixtureMode } from './domain'
import { fixtureProfiles } from './fixtures'
import { assertShowDocument } from './show-validation'
import { parsePlaybackStatus, PlaybackConflict, PlaybackUnavailable, type PlaybackStatus } from './playback-client'

export interface RuntimeLivePreview {
  transition?: LookTransitionStatus
  version: 1
  sessionId: string
  status: PlaybackStatus
  frame: EvaluatedFrame
  controls: LiveControls
  groupIntensities: Record<string, number>
  colorLockId: string | null
  revision: number
}
export interface RuntimeLiveState {
  controls: LiveControls
  groupIntensities: Record<string, number>
  colorLockId: string | null
}
export function assertRuntimePreviewOrder(previous: RuntimeLivePreview | undefined, next: RuntimeLivePreview) {
  if (previous?.sessionId !== next.sessionId) return
  // Media seeks and changing clock sources can rewind beats; only runtime counters establish freshness.
  if (
    next.revision < previous.revision ||
    next.status.frameCount < previous.status.frameCount ||
    (next.status.frameCount === previous.status.frameCount && next.frame.atBeats !== previous.frame.atBeats)
  ) {
    throw new Error('Verouderd runtimeframe ontvangen. Verbind opnieuw.')
  }
}
function invalid(): never {
  throw new Error('Ongeldig runtime-liveantwoord. Verbind opnieuw met een bijgewerkte runtime.')
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) invalid()
  return value
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid()
  return value
}
function reference(value: unknown, allowed: Set<string>): string {
  if (typeof value !== 'string' || !allowed.has(value)) invalid()
  return value
}
function color(value: unknown): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) invalid()
  return value
}
function session(value: unknown, expected: string) {
  if (value !== expected)
    throw new PlaybackConflict('De runtimesessie is veranderd. Verbind opnieuw; de opdracht wordt niet herhaald.')
}

export function parseRuntimeLiveState(value: unknown, show: ShowDocument): RuntimeLiveState {
  const root = object(value)
  const state = { controls: root.controls, groupIntensities: root.groupIntensities, colorLockId: root.colorLockId }
  assertPlaybackLiveState(show, state)
  return state
}

export function parseRuntimeShow(value: unknown, sessionId: string): ShowDocument {
  const root = object(value)
  if (root.version !== 1) invalid()
  session(root.sessionId, sessionId)
  assertShowDocument(root.show)
  return root.show
}

export function parseRuntimePreview(value: unknown, sessionId: string, show: ShowDocument): RuntimeLivePreview {
  const root = object(value)
  if (root.version !== 1) invalid()
  session(root.sessionId, sessionId)
  const status = parsePlaybackStatus(root.status)
  session(status.sessionId, sessionId)
  if (status.status !== 'running' || !show.looks.some((look) => look.id === status.lookId)) invalid()
  const revision = number(root.revision, 0, Number.MAX_SAFE_INTEGER)
  if (!Number.isInteger(revision)) invalid()
  const raw = object(root.frame)
  if (raw.mode !== status.mode || raw.atBeats !== status.atBeats) invalid()
  const seen = new Set<string>(),
    ids = new Set(show.fixtures.map((fixture) => fixture.id))
  const fixtures = array(raw.fixtures, 1024).map((value) => {
    const f = object(value),
      fixtureId = reference(f.fixtureId, ids)
    if (seen.has(fixtureId)) invalid()
    seen.add(fixtureId)
    const fixture = show.fixtures.find((fixture) => fixture.id === fixtureId)!
    const profile = fixtureProfiles.find((profile) => profile.id === fixture.profileId)
    const heads =
      profile && getFixtureMode(profile, fixture.modeId)?.independentHeads ? (fixture.visualSegments ?? 1) : 1
    const segments =
      f.segments == null
        ? undefined
        : array(f.segments, 64).map((value) => {
            const segment = object(value)
            return { intensity: number(segment.intensity, 0, 1), color: color(segment.color) }
          })
    if (segments && segments.length !== heads) invalid()
    return {
      fixtureId,
      intensity: number(f.intensity, 0, 1),
      color: color(f.color),
      haze: number(f.haze, 0, 1),
      ...(segments ? { segments } : {}),
    }
  })
  if (seen.size !== ids.size) invalid()
  let transition: LookTransitionStatus | undefined
  if (root.transition != null) {
    const item = object(root.transition),
      looks = new Set(show.looks.map((look) => look.id))
    if (item.phase !== 'queued' && item.phase !== 'fading') invalid()
    const startAtBeats = number(item.startAtBeats, 0, 1e9 + 8),
      endAtBeats = number(item.endAtBeats, startAtBeats, startAtBeats + 32)
    const progress = number(item.progress, 0, 1)
    transition = {
      phase: item.phase,
      fromLookId: reference(item.fromLookId, looks),
      toLookId: reference(item.toLookId, looks),
      startAtBeats,
      endAtBeats,
      progress,
    }
    if (transition.toLookId !== status.lookId || status.mode !== 'automation') invalid()
  }
  return {
    version: 1,
    sessionId,
    status,
    frame: { mode: status.mode, atBeats: status.atBeats, fixtures },
    revision,
    ...parseRuntimeLiveState(root, show),
    ...(transition ? { transition } : {}),
  }
}

export async function requestRuntime(
  path: string,
  signal: AbortSignal,
  maxBytes: number,
  body?: unknown,
): Promise<unknown> {
  const controller = new AbortController(),
    cancel = () => controller.abort()
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) controller.abort()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, 10_000)
  try {
    const encoded = body === undefined ? undefined : JSON.stringify(body)
    if (encoded && new TextEncoder().encode(encoded).length > 1024 * 1024)
      throw new Error('Te veel live-instellingen voor één opdracht.')
    const response = await fetch(`http://127.0.0.1:5188/playback/${path}`, {
      method: encoded === undefined ? 'GET' : 'POST',
      headers: encoded === undefined ? undefined : { 'content-type': 'application/json' },
      body: encoded,
      signal: controller.signal,
    })
    if (response.status === 409)
      throw new PlaybackConflict(
        'De sessie of live-instellingen zijn veranderd. Verbind opnieuw; je opdracht wordt niet herhaald.',
      )
    if (response.status === 404)
      throw new PlaybackUnavailable('Deze runtime ondersteunt verbonden Live nog niet. Start de bijgewerkte runtime.')
    if (!response.ok)
      throw new Error(
        `Runtime-liveopdracht geweigerd (${response.status}). Verbind opnieuw om de actuele toestand te zien.`,
      )
    if (!response.body || Number(response.headers.get('content-length')) > maxBytes) invalid()
    const reader = response.body.getReader(),
      decoder = new TextDecoder()
    let count = 0,
      text = ''
    try {
      while (true) {
        if (controller.signal.aborted) throw new Error('Geannuleerd')
        const { done, value } = await reader.read()
        if (done) break
        count += value.byteLength
        if (count > maxBytes) {
          await reader.cancel()
          invalid()
        }
        text += decoder.decode(value, { stream: true })
      }
      text += decoder.decode()
    } finally {
      reader.releaseLock()
    }
    if (controller.signal.aborted) throw new Error('Geannuleerd')
    try {
      return JSON.parse(text)
    } catch {
      invalid()
    }
  } catch (error) {
    if (timedOut)
      throw new Error(
        'Runtime reageert niet binnen 10 seconden. Verbind opnieuw; opdrachten worden niet automatisch herhaald.',
      )
    if (signal.aborted) throw new Error('Verzoek geannuleerd; de runtime is niet gestopt.')
    if (error instanceof TypeError)
      throw new Error('Runtimeverbinding verbroken. Verbind opnieuw; er wordt geen lokaal vervangend beeld afgespeeld.')
    throw error
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
  }
}

export async function getRuntimeShow(sessionId: string, signal: AbortSignal) {
  return parseRuntimeShow(
    await requestRuntime(`show?sessionId=${encodeURIComponent(sessionId)}`, signal, 3 * 1024 * 1024),
    sessionId,
  )
}
export async function getRuntimePreview(sessionId: string, show: ShowDocument, signal: AbortSignal) {
  return parseRuntimePreview(
    await requestRuntime(`preview?sessionId=${encodeURIComponent(sessionId)}`, signal, 1024 * 1024),
    sessionId,
    show,
  )
}
export async function setRuntimeLive(
  sessionId: string,
  expectedRevision: number,
  state: RuntimeLiveState,
  show: ShowDocument,
  signal: AbortSignal,
) {
  if (!sessionId || sessionId.length > 120 || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) invalid()
  const live = parseRuntimeLiveState(state, show)
  const status = parsePlaybackStatus(
    await requestRuntime('command', signal, 65_536, {
      version: 1,
      sessionId,
      command: 'live',
      expectedRevision,
      ...live,
    }),
  )
  session(status.sessionId, sessionId)
  return status
}
