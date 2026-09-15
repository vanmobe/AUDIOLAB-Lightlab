import { PlaybackConflict } from './playback-client'
import { requestRuntime } from './runtime-live-client'

export interface PlaybackOutputStatus {
  version: 1
  sessionId: string
  state: 'disarmed' | 'armed' | 'faulted'
  routes: { universe: number; protocol: 'sacn' | 'artnet'; host: string }[]
  framesSent: number
  lastError: string | null
  armError: string | null
}
function invalid(): never {
  throw new Error('Ongeldige uitvoerstatus. Werk de lokale runtime bij.')
}
export function parseOutputStatus(value: unknown, sessionId: string): PlaybackOutputStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  const v = value as Record<string, unknown>
  if (v.sessionId !== sessionId)
    throw new PlaybackConflict('De uitvoer hoort bij een andere runtimesessie. Verbind opnieuw.')
  if (
    v.version !== 1 ||
    !['disarmed', 'armed', 'faulted'].includes(v.state as string) ||
    !Number.isSafeInteger(v.framesSent) ||
    (v.framesSent as number) < 0 ||
    !Array.isArray(v.routes) ||
    v.routes.length > 256
  )
    invalid()
  for (const key of ['lastError', 'armError'])
    if (!(v[key] === null || (typeof v[key] === 'string' && (v[key] as string).length <= 4096))) invalid()
  const universes = new Set<number>()
  for (const route of v.routes) {
    if (
      !route ||
      !['artnet', 'sacn'].includes(route.protocol) ||
      !Number.isInteger(route.universe) ||
      route.universe < 1 ||
      route.universe > (route.protocol === 'artnet' ? 32768 : 63999) ||
      typeof route.host !== 'string' ||
      !route.host.trim() ||
      route.host.length > 253 ||
      universes.has(route.universe)
    )
      invalid()
    universes.add(route.universe)
  }
  if (v.state === 'armed' && (!v.routes.length || v.armError !== null)) invalid()
  return v as unknown as PlaybackOutputStatus
}
export async function getOutputStatus(sessionId: string, signal: AbortSignal) {
  return parseOutputStatus(
    await requestRuntime(`output?sessionId=${encodeURIComponent(sessionId)}`, signal, 131072),
    sessionId,
  )
}
export async function setOutputState(
  sessionId: string,
  command: 'arm' | 'disarm',
  confirmed: boolean,
  signal: AbortSignal,
) {
  if (
    !sessionId ||
    sessionId.length > 120 ||
    !['arm', 'disarm'].includes(command) ||
    (command === 'arm' && confirmed !== true)
  )
    throw new Error('Bevestig eerst de fysieke uitvoer naar de getoonde bestemmingen.')
  return parseOutputStatus(
    await requestRuntime('output', signal, 131072, {
      version: 1,
      sessionId,
      command,
      ...(command === 'arm' ? { confirmed: true } : {}),
    }),
    sessionId,
  )
}
