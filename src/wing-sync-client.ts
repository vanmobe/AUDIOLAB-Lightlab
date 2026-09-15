import type { ShowDocument } from './domain'
import { canAssignBinding, getControlSurfaceProfile } from './control-surface'

export interface WingDevice {
  name: string
  model: string
  firmware: string
}
export interface WingBinding {
  bank: number
  kind: 'button' | 'rotary'
  index: number
  label: string
}
export interface WingPlanRequest {
  version: 1
  address: string
  profileId: 'wing-full' | 'wing-rack'
  banks: number[]
  bindings: WingBinding[]
}
export interface WingChange extends WingBinding {
  before: Record<string, string | number>
  after: Record<string, string | number>
}
export interface WingPlan {
  version: 1
  planId: string
  address: string
  device: WingDevice
  expiresAt: string
  changes: WingChange[]
  warnings: string[]
}
export interface WingApplyResult {
  version: 1
  state: 'applied' | 'partial'
  verifiedSlots: number
  totalSlots: number
  error?: string
  backup: unknown[]
}
export function wingAddress(value: string) {
  const address = value.trim(),
    parts = address.split('.')
  const privateAddress =
    parts[0] === '10' ||
    (parts[0] === '172' && Number(parts[1]) >= 16 && Number(parts[1]) <= 31) ||
    (parts[0] === '192' && parts[1] === '168')
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255) ||
    !privateAddress
  )
    throw new Error('Vul een privé IPv4-adres van de WING in, bijvoorbeeld 10.0.0.10.')
  return address
}
export function wingPlanRequest(show: ShowDocument, address: string, banks: number[]): WingPlanRequest {
  const profileId = show.controlSurface.profileId,
    profile = getControlSurfaceProfile(profileId)
  if (profileId !== 'wing-full' && profileId !== 'wing-rack')
    throw new Error('Banksynchronisatie ondersteunt momenteel WING Full en Rack, niet Compact.')
  if (
    !banks.length ||
    banks.length > 16 ||
    new Set(banks).size !== banks.length ||
    banks.some((bank) => !Number.isInteger(bank) || bank < 1 || bank > 16)
  )
    throw new Error('Selecteer minstens één bank van 1 tot en met 16.')
  const bindings = show.controlSurface.bindings
    .filter(
      (binding) =>
        binding.slot && banks.includes(binding.slot.bank) && canAssignBinding(binding, binding.slot, profile),
    )
    .map((binding) => ({ ...binding.slot!, label: binding.label }))
    .sort((a, b) => a.bank - b.bank || a.kind.localeCompare(b.kind) || a.index - b.index)
  if (!bindings.length)
    throw new Error('Deze banken hebben nog geen toegewezen knoppen of draaiknoppen. Vul eerst de indeling in.')
  // Configuration only: do not send rotary values, which can emit MIDI and move live group masters.
  return { version: 1, address: wingAddress(address), profileId, banks: [...banks].sort((a, b) => a - b), bindings }
}
function invalid(): never {
  throw new Error('Ongeldig WING-antwoord. Lees de tafel opnieuw uit met een bijgewerkte runtime.')
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}
function string(value: unknown, max = 256): string {
  if (typeof value !== 'string' || value.length > max) invalid()
  return value
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) invalid()
  return value
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) invalid()
  return value
}
function device(value: unknown): WingDevice {
  const item = record(value)
  return { name: string(item.name), model: string(item.model), firmware: string(item.firmware) }
}
function fields(value: unknown): Record<string, string | number> {
  const entries = Object.entries(record(value))
  if (entries.length > 32) invalid()
  return Object.fromEntries(
    entries.map(([key, value]) => {
      if (
        !key.length ||
        key.length > 120 ||
        (typeof value !== 'string' && typeof value !== 'number') ||
        (typeof value === 'number' && !Number.isFinite(value))
      )
        invalid()
      return [key, typeof value === 'string' ? string(value, 1024) : value]
    }),
  )
}
export function parseWingProbe(value: unknown, address: string): WingDevice {
  const root = record(value)
  if (root.version !== 1 || root.address !== address) invalid()
  return device(root.device)
}
export function parseWingPlan(value: unknown, request: WingPlanRequest): WingPlan {
  const root = record(value)
  if (root.version !== 1 || root.address !== request.address) invalid()
  const planId = string(root.planId, 128),
    expiresAt = string(root.expiresAt, 64),
    seen = new Set<string>()
  if (!planId || !Number.isFinite(Date.parse(expiresAt))) invalid()
  const changes = array(root.changes, 192).map((value): WingChange => {
    const item = record(value),
      bank = integer(item.bank, 1, 16)
    if (item.kind !== 'button' && item.kind !== 'rotary') invalid()
    const kind = item.kind,
      index = integer(item.index, 1, kind === 'button' ? 8 : 4),
      key = `${bank}:${kind}:${index}`
    if (
      seen.has(key) ||
      !request.bindings.some((binding) => binding.bank === bank && binding.kind === kind && binding.index === index)
    )
      invalid()
    seen.add(key)
    return {
      bank,
      kind,
      index,
      label: string(item.label, 1024),
      before: fields(item.before),
      after: fields(item.after),
    }
  })
  return {
    version: 1,
    planId,
    address: request.address,
    expiresAt,
    device: device(root.device),
    changes,
    warnings: array(root.warnings, 256).map((value) => string(value, 2048)),
  }
}
export function parseWingApply(value: unknown, total: number): WingApplyResult {
  const root = record(value)
  if (root.version !== 1 || !['applied', 'partial'].includes(root.state as string) || root.totalSlots !== total)
    invalid()
  const verifiedSlots = integer(root.verifiedSlots, 0, total)
  if (root.state === 'applied' && verifiedSlots !== total) invalid()
  return {
    version: 1,
    state: root.state as WingApplyResult['state'],
    verifiedSlots,
    totalSlots: total,
    ...(root.error == null ? {} : { error: string(root.error, 2048) }),
    backup: array(root.backup, 192),
  }
}

/** One explicit request, no retries: an uncertain apply must be read back before another write. */
export async function requestWing(
  action: 'probe' | 'plan' | 'apply',
  body: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController(),
    cancel = () => controller.abort()
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) controller.abort()
  const timer = setTimeout(cancel, 90_000)
  try {
    const response = await fetch(`http://127.0.0.1:5188/controllers/wing/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (response.status === 404)
      throw new Error('Deze runtime ondersteunt WING-synchronisatie nog niet. Start de bijgewerkte runtime.')
    if (response.status === 403)
      throw new Error('De runtime weigert toegang vanuit dit venster. Open Lightlab via de lokale launcher.')
    if (!response.body || Number(response.headers.get('content-length')) > 512 * 1024) invalid()
    const reader = response.body.getReader(),
      decoder = new TextDecoder()
    let size = 0,
      text = ''
    try {
      while (true) {
        if (controller.signal.aborted) throw new Error('Verzoek onderbroken.')
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 512 * 1024) {
          await reader.cancel()
          invalid()
        }
        text += decoder.decode(value, { stream: true })
      }
    } finally {
      reader.releaseLock()
    }
    if (controller.signal.aborted) throw new Error('Verzoek onderbroken.')
    if (!response.ok) {
      let detail = ''
      try {
        const failure = record(JSON.parse(text + decoder.decode()))
        if (typeof failure.error === 'string' && failure.error.length <= 2048) detail = failure.error
      } catch {
        /* Unknown error envelopes stay generic. */
      }
      throw new Error(
        `${detail || `WING-verzoek geweigerd (${response.status}).`} ${action === 'apply' ? 'De tafel kan gedeeltelijk gewijzigd zijn. ' : ''}Lees de tafel opnieuw uit. Er wordt niets automatisch herhaald.`,
      )
    }
    try {
      return JSON.parse(text + decoder.decode())
    } catch {
      invalid()
    }
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        action === 'apply'
          ? 'Versturen onderbroken of tijdslimiet bereikt. De tafel kan gedeeltelijk gewijzigd zijn. Lees opnieuw uit; niet blind opnieuw versturen.'
          : 'Uitlezen onderbroken of niet binnen 90 seconden voltooid. Controleer verbinding en runtime.',
      )
    if (error instanceof TypeError)
      throw new Error(
        action === 'apply'
          ? 'Verbinding verloren tijdens versturen. De tafel kan gedeeltelijk gewijzigd zijn. Lees opnieuw uit.'
          : 'Lokale runtime niet bereikbaar. Start de runtime en controleer de verbinding.',
      )
    throw error
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
  }
}
