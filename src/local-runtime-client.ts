export interface LocalRuntimeStatus {
  version: 1
  state: 'stopped' | 'starting' | 'running' | 'external' | 'error'
  canStart: boolean
  canStop?: boolean
  stopping?: boolean
  startedAt?: string | null
  launchMode?: 'development' | 'prebuilt'
  buildMessage?: string
  message: string
  logs: { id: number; time: string; level: 'info' | 'warning' | 'error'; message: string }[]
}

const invalid = () => new Error('De lokale runtime geeft een ongeldig statusantwoord. Open de webapp opnieuw met de Lightlab-starter.')
export const launcherUnavailable = 'De lokale starter is niet bereikbaar. Open de webapp opnieuw met de Lightlab-starter om de runtime hier te starten.'
const safeText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value)

export function parseLocalRuntimeStatus(value: unknown): LocalRuntimeStatus {
  if (!value || typeof value !== 'object') throw invalid()
  const item = value as LocalRuntimeStatus
  if (item.version !== 1 || !['stopped', 'starting', 'running', 'external', 'error'].includes(item.state)
    || typeof item.canStart !== 'boolean' || !safeText(item.message, 2048)
    || !Array.isArray(item.logs) || item.logs.length > 200
    || (item.canStart && !['stopped', 'error'].includes(item.state))) throw invalid()
  if ((item.canStop !== undefined && typeof item.canStop !== 'boolean')
    || (item.stopping !== undefined && typeof item.stopping !== 'boolean')
    || (item.canStop && (item.canStart || item.stopping || item.state === 'external'))
    || (item.stopping && item.canStart)
    || (item.startedAt !== undefined && item.startedAt !== null && (!safeText(item.startedAt, 40) || !Number.isFinite(Date.parse(item.startedAt))))
    || (item.launchMode !== undefined && !['development', 'prebuilt'].includes(item.launchMode))
    || (item.buildMessage !== undefined && !safeText(item.buildMessage, 2048))) throw invalid()
  const ids = new Set<number>()
  for (const log of item.logs) {
    if (!log || !Number.isSafeInteger(log.id) || log.id < 0 || ids.has(log.id)
      || typeof log.time !== 'string' || log.time.length > 40 || !Number.isFinite(Date.parse(log.time))
      || !['info', 'warning', 'error'].includes(log.level) || !safeText(log.message, 2048)) throw invalid()
    ids.add(log.id)
  }
  return item
}

/** Lifecycle commands target only the same-origin launcher's owned process. */
export async function requestLocalRuntime(action: boolean | 'status' | 'start' | 'stop', signal: AbortSignal): Promise<LocalRuntimeStatus> {
  const operation = action === true ? 'start' : action === false ? 'status' : action
  const mutation = operation !== 'status'
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  const timeout = setTimeout(abort, mutation ? 5000 : 3000)
  try {
    const response = await fetch(mutation ? `/__lightlab/runtime/${operation}` : '/__lightlab/runtime', {
      method: mutation ? 'POST' : 'GET', signal: controller.signal, cache: 'no-store', redirect: 'error',
      ...(mutation ? { headers: { 'X-Lightlab-Action': operation } } : {}),
    })
    if (response.status === 404 || !response.headers.get('content-type')?.includes('application/json')) throw new Error(launcherUnavailable)
    if (!response.ok || !response.body) throw new Error('De starter kon de aanvraag niet uitvoeren. Controleer de status opnieuw.')
    const maxBytes = 128 * 1024
    if (Number(response.headers.get('content-length')) > maxBytes) throw invalid()
    const reader = response.body.getReader(), decoder = new TextDecoder()
    let size = 0, content = ''
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > maxBytes) throw invalid()
        content += decoder.decode(chunk.value, { stream: true })
      }
      content += decoder.decode()
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
    try { return parseLocalRuntimeStatus(JSON.parse(content)) } catch { throw invalid() }
  } catch (error) {
    if (controller.signal.aborted) throw new Error(operation === 'start'
      ? 'Startaanvraag niet bevestigd. De runtime kan nog starten; controleer de status opnieuw.'
      : operation === 'stop' ? 'Stopaanvraag niet bevestigd. De runtime kan nog draaien; controleer de status opnieuw.'
        : 'Statuscontrole duurde te lang. Controleer opnieuw of open de webapp opnieuw met de Lightlab-starter.')
    if (error instanceof TypeError) throw new Error(launcherUnavailable)
    throw error
  } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort) }
}
