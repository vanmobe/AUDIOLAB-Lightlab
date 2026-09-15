import { assertShowDocument } from './show-validation'
import { validateShow, type RuntimeMode, type ShowDocument } from './domain'
import { fixtureProfiles } from './fixtures'
import { routeUniverseError } from './patch-overview'

export interface PlaybackStatus {
  version: 1
  sessionId: string | null
  status: 'idle' | 'starting' | 'running' | 'stopped' | 'faulted'
  mode: RuntimeMode
  lookId: string | null
  bpm: number
  atBeats: number
  frameCount: number
  universeCount: number
  outputSent: boolean
  error: string | null
}
export type PlaybackCommand =
  | { command: 'look'; lookId: string }
  | { command: 'bpm'; bpm: number }
  | { command: 'mode'; mode: RuntimeMode }
  | { command: 'stop' }
export class PlaybackConflict extends Error {}
export class PlaybackUnavailable extends Error {}
const endpoint = 'http://127.0.0.1:5188/playback/'
const maxBody = 2 * 1024 * 1024
function invalid(): never {
  throw new Error('Ongeldig antwoord van de runtime. Werk de runtime bij en probeer opnieuw.')
}
export function parsePlaybackStatus(value: unknown): PlaybackStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  const v = value as Record<string, unknown>
  const boundedString = (item: unknown, max: number) => typeof item === 'string' && item.length <= max
  const numeric = (item: unknown, min: number, max: number) =>
    typeof item === 'number' && Number.isFinite(item) && item >= min && item <= max
  if (
    v.version !== 1 ||
    typeof v.outputSent !== 'boolean' ||
    !(v.sessionId === null || boundedString(v.sessionId, 120)) ||
    typeof v.status !== 'string' ||
    !['idle', 'starting', 'running', 'stopped', 'faulted'].includes(v.status) ||
    typeof v.mode !== 'string' ||
    !['automation', 'static', 'safety', 'blackout'].includes(v.mode) ||
    !(v.lookId === null || boundedString(v.lookId, 1024)) ||
    !numeric(v.bpm, 30, 240) ||
    !numeric(v.atBeats, 0, Number.MAX_SAFE_INTEGER) ||
    !numeric(v.frameCount, 0, Number.MAX_SAFE_INTEGER) ||
    !Number.isInteger(v.frameCount) ||
    !numeric(v.universeCount, 0, 256) ||
    !Number.isInteger(v.universeCount) ||
    !(v.error === null || boundedString(v.error, 4096))
  )
    invalid()
  if ((v.status === 'running' || v.status === 'starting') && (!v.sessionId || !v.lookId)) invalid()
  return v as unknown as PlaybackStatus
}

async function readStatus(response: Response): Promise<PlaybackStatus> {
  const max = 65_536
  if (Number(response.headers.get('content-length')) > max || !response.body) invalid()
  const reader = response.body.getReader(),
    decoder = new TextDecoder()
  let size = 0,
    text = ''
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > max) {
        await reader.cancel()
        invalid()
      }
      text += decoder.decode(next.value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    reader.releaseLock()
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    invalid()
  }
  return parsePlaybackStatus(value)
}

async function request(
  path: 'status' | 'start' | 'command',
  signal: AbortSignal,
  body?: unknown,
  expectedSession?: string,
) {
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
    if (encoded && new TextEncoder().encode(encoded).length > maxBody)
      throw new Error('De showsnapshot is groter dan 2 MiB. Verklein de show voordat je start.')
    const response = await fetch(endpoint + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: encoded,
      signal: controller.signal,
    })
    if (controller.signal.aborted) throw new Error('Geannuleerd')
    if (response.status === 409)
      throw new PlaybackConflict(
        'De runtimesessie is veranderd. De actuele status wordt opnieuw opgehaald; je opdracht is niet herhaald.',
      )
    if (response.status === 404)
      throw new PlaybackUnavailable(
        'Deze runtime ondersteunt de autonome proef nog niet. Start de bijgewerkte runtime.',
      )
    if (!response.ok)
      throw new Error(
        `Runtimeopdracht geweigerd (${response.status}). Controleer de snapshot en haal de status opnieuw op.`,
      )
    const status = await readStatus(response)
    if (controller.signal.aborted) throw new Error('Geannuleerd')
    if (expectedSession && status.sessionId !== expectedSession)
      throw new PlaybackConflict('Het antwoord hoort bij een andere sessie. Haal de actuele status op.')
    return status
  } catch (error) {
    if (timedOut)
      throw new Error('Geen antwoord binnen 10 seconden. Haal de status op: de opdracht kan wel ontvangen zijn.')
    if (signal.aborted) throw new Error('Aanvraag geannuleerd. Dit stopt de runtime niet.')
    if (error instanceof TypeError)
      throw new Error('Runtime niet bereikbaar. Start de lokale runtime en haal de status opnieuw op.')
    throw error
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
  }
}

export const getPlaybackStatus = (signal: AbortSignal) => request('status', signal)
/** Validate the complete wire payload before a replacement may stop the old show. */
export function preparePlaybackSnapshot(show: ShowDocument, bpm: number): ShowDocument {
  assertShowDocument(show)
  if (!show.looks.some((look) => look.id === show.activeLookId) || !Number.isFinite(bpm) || bpm < 30 || bpm > 240)
    throw new Error('Kies een Look en een tempo tussen 30 en 240 BPM.')
  const encoded = JSON.stringify({ version: 1, show, bpm, lookId: show.activeLookId })
  if (new TextEncoder().encode(encoded).length > maxBody)
    throw new Error('De showsnapshot is groter dan 2 MiB. Verklein de show voordat je start.')
  const snapshot = JSON.parse(encoded).show as ShowDocument
  assertShowDocument(snapshot)
  if (snapshot.fixtures.length > 256)
    throw new Error('Maximum 256 fixtures per runtimesessie. De oude show is niet gestopt.')
  const patchError = validateShow(snapshot, fixtureProfiles).find((issue) => issue.severity === 'error')
  if (patchError)
    throw new Error(`Los eerst de show- of patchfout op: ${patchError.message} De oude show is niet gestopt.`)
  // Match the worker's bounded visual-head load guard without importing Three.js.
  const heads = snapshot.fixtures.reduce(
    (total, fixture) =>
      total +
      (fixtureProfiles.find((profile) => profile.id === fixture.profileId)?.kind === 'hazer'
        ? 0
        : (fixture.visualSegments ?? 1)),
    0,
  )
  if (heads > 256) throw new Error('Maximum 256 lichtpunten per runtimesessie. De oude show is niet gestopt.')
  for (const route of snapshot.routes) {
    if (
      routeUniverseError(String(route.universe), route.protocol) ||
      route.host.length > 253 ||
      (route.enabled && !route.host.trim())
    )
      throw new Error('Controleer de universe en bestemming van de outputroutes. De oude show is niet gestopt.')
  }
  // Freeze the detached JSON tree: edits made while the stop request is pending
  // must not alter the replacement that was validated and explicitly requested.
  const pending: object[] = [snapshot]
  while (pending.length) {
    const value = pending.pop()!
    for (const child of Object.values(value)) if (child !== null && typeof child === 'object') pending.push(child)
    Object.freeze(value)
  }
  return snapshot
}
export function startPlayback(show: ShowDocument, lookId: string, bpm: number, signal: AbortSignal) {
  assertShowDocument(show)
  if (!show.looks.some((look) => look.id === lookId) || !Number.isFinite(bpm) || bpm < 30 || bpm > 240)
    throw new Error('Kies een Look en een tempo tussen 30 en 240 BPM.')
  return request('start', signal, { version: 1, show, bpm, lookId })
}
export function commandPlayback(sessionId: string, command: PlaybackCommand, signal: AbortSignal) {
  if (
    !sessionId ||
    sessionId.length > 120 ||
    !['look', 'bpm', 'mode', 'stop'].includes(command.command) ||
    (command.command === 'mode' && !['automation', 'static', 'safety', 'blackout'].includes(command.mode)) ||
    (command.command === 'bpm' && (!Number.isFinite(command.bpm) || command.bpm < 30 || command.bpm > 240)) ||
    (command.command === 'look' && (!command.lookId || command.lookId.length > 1024))
  )
    throw new Error('Ongeldige runtimeopdracht.')
  return request('command', signal, { version: 1, sessionId, ...command }, sessionId)
}
