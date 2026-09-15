import { evaluateFrame, type ShowDocument } from './domain'
import { fixtureProfiles } from './fixtures'

export type InspectionMode = 'automation' | 'blackout' | 'safety'
export interface DmxInspection {
  version: 1
  requestId: string
  catalogVersion: string
  dryRun: true
  outputSent: false
  issues: Array<{ severity: 'error' | 'warning'; code: string; message: string; fixtureId?: string }>
  issuesTruncated?: boolean
  universes: Array<{
    universe: number
    protocol: 'artnet' | 'sacn' | null
    routeEnabled: boolean
    channels: number[]
    fixtures: Array<{ fixtureId: string; address: number; channels: number[]; channelLabels: string[] }>
  }>
}

export function inspectionRequest(
  show: ShowDocument,
  lookId: string,
  mode: InspectionMode,
  beat: number,
  requestId: string,
) {
  if (
    !show.looks.some((look) => look.id === lookId) ||
    !Number.isFinite(beat) ||
    beat < 0 ||
    beat > 64 ||
    !['automation', 'blackout', 'safety'].includes(mode)
  )
    throw new Error('Kies een bestaande Look en een moment tussen 0 en 64 beats.')
  return {
    version: 1,
    requestId,
    patch: {
      fixtures: show.fixtures.map(({ id, profileId, modeId, patch }) => ({
        id,
        profileId,
        modeId,
        patch: patch ?? null,
      })),
      routes: show.routes.map(({ id, universe, protocol, host, enabled }) => ({
        id,
        universe,
        protocol,
        host,
        enabled,
      })),
    },
    frame: evaluateFrame(show, fixtureProfiles, { mode, activeLookId: lookId }, beat),
  }
}

function invalid(): never {
  throw new Error('Ongeldig antwoord van de runtime. Werk de runtime bij en probeer opnieuw.')
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) invalid()
  return value
}
function string(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max) invalid()
  return value
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) invalid()
  return value
}
function bytes(value: unknown): number[] {
  return list(value, 512).map((byte) => integer(byte, 0, 255))
}

export function parseInspection(value: unknown, requestId: string): DmxInspection {
  const root = record(value)
  if (
    root.version !== 1 ||
    root.requestId !== requestId ||
    root.dryRun !== true ||
    root.outputSent !== false ||
    (root.issuesTruncated !== undefined && typeof root.issuesTruncated !== 'boolean')
  )
    invalid()
  const issues = list(root.issues, 256).map((value): DmxInspection['issues'][number] => {
    const issue = record(value)
    if (issue.severity !== 'error' && issue.severity !== 'warning') invalid()
    return {
      severity: issue.severity,
      code: string(issue.code, 120),
      message: string(issue.message, 2048),
      ...(issue.fixtureId == null ? {} : { fixtureId: string(issue.fixtureId, 1024) }),
    }
  })
  let fixtureCount = 0
  const universeIds = new Set<number>(),
    fixtureIds = new Set<string>()
  const universes = list(root.universes, 256).map((value) => {
    const entry = record(value),
      universe = integer(entry.universe, 1, 63999),
      channels = bytes(entry.channels)
    if (
      universeIds.has(universe) ||
      channels.length !== 512 ||
      typeof entry.routeEnabled !== 'boolean' ||
      !['artnet', 'sacn', null].includes(entry.protocol as string | null)
    )
      invalid()
    universeIds.add(universe)
    const occupied = new Set<number>()
    const fixtures = list(entry.fixtures, 1024).map((value) => {
      const fixture = record(value),
        fixtureId = string(fixture.fixtureId, 1024),
        address = integer(fixture.address, 1, 512),
        channels = bytes(fixture.channels)
      const channelLabels = list(fixture.channelLabels, 512).map((label) => string(label, 120))
      if (
        ++fixtureCount > 1024 ||
        fixtureIds.has(fixtureId) ||
        !channels.length ||
        channelLabels.length !== channels.length ||
        address + channels.length - 1 > 512
      )
        invalid()
      channels.forEach((byte, index) => {
        const channel = address + index
        if (occupied.has(channel) || byte !== (entry.channels as number[])[channel - 1]) invalid()
        occupied.add(channel)
      })
      fixtureIds.add(fixtureId)
      return { fixtureId, address, channels, channelLabels }
    })
    return {
      universe,
      protocol: entry.protocol as 'artnet' | 'sacn' | null,
      routeEnabled: entry.routeEnabled,
      channels,
      fixtures,
    }
  })
  if (issues.some((issue) => issue.severity === 'error') && universes.length) invalid()
  return {
    version: 1,
    requestId,
    catalogVersion: string(root.catalogVersion, 120),
    dryRun: true,
    outputSent: false,
    issues,
    ...(root.issuesTruncated === undefined ? {} : { issuesTruncated: root.issuesTruncated }),
    universes,
  }
}

async function boundedResponseText(response: Response): Promise<string> {
  const maxBytes = 3 * 1024 * 1024
  const declared = Number(response.headers.get('content-length'))
  if (declared > maxBytes || !response.body) invalid()
  const reader = response.body.getReader(),
    decoder = new TextDecoder()
  let size = 0,
    text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        invalid()
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

/** Stateless inspection only: this client has no arm, send-frame or transport capability. */
export async function inspectDmx(
  body: ReturnType<typeof inspectionRequest>,
  signal: AbortSignal,
): Promise<DmxInspection> {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) controller.abort()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, 10_000)
  try {
    const encoded = JSON.stringify(body)
    if (new TextEncoder().encode(encoded).length > 1024 * 1024)
      throw new Error('Deze DMX-proef is te groot. Beperk de fixtureconfiguratie.')
    const response = await fetch('http://127.0.0.1:5188/output/inspect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: encoded,
      signal: controller.signal,
    })
    if (controller.signal.aborted) throw new Error('Geannuleerd')
    if (!response.ok)
      throw new Error(
        response.status === 404
          ? 'Deze runtime ondersteunt de DMX-proef nog niet. Start de bijgewerkte runtime.'
          : `DMX-proef geweigerd door de runtime (${response.status}). Controleer je patch.`,
      )
    const text = await boundedResponseText(response)
    if (controller.signal.aborted) throw new Error('Geannuleerd')
    if (text.length > 3 * 1024 * 1024) invalid()
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      invalid()
    }
    return parseInspection(value, body.requestId)
  } catch (error) {
    if (timedOut) throw new Error('De runtime antwoordde niet binnen 10 seconden. Probeer opnieuw.')
    if (signal.aborted) throw new Error('DMX-proef geannuleerd.')
    if (error instanceof TypeError)
      throw new Error('Runtime niet bereikbaar. Start de lokale runtime en probeer opnieuw.')
    throw error
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
  }
}
