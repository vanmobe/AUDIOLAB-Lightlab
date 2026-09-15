export interface AiTraceAttempt {
  requestBody: string
  responseBody: string | null
  responseStatus: number | null
  requestTruncated: boolean
  responseTruncated: boolean
  redacted: boolean
}
export interface AiTrace {
  version: 1
  provider: string
  model: string | null
  attempts: AiTraceAttempt[]
  truncated: boolean
}
export function parseAiTrace(value: unknown): AiTrace | undefined {
  if (!value || typeof value !== 'object') return undefined
  const t = value as AiTrace
  if (
    t.version !== 1 ||
    typeof t.provider !== 'string' ||
    t.provider.length > 120 ||
    (t.model !== null && (typeof t.model !== 'string' || t.model.length > 200)) ||
    typeof t.truncated !== 'boolean' ||
    !Array.isArray(t.attempts) ||
    t.attempts.length > 2
  )
    return undefined
  if (
    !t.attempts.every(
      (a) =>
        a &&
        typeof a.requestBody === 'string' &&
        a.requestBody.length <= 131072 &&
        (a.responseBody === null || (typeof a.responseBody === 'string' && a.responseBody.length <= 131072)) &&
        (a.responseStatus === null ||
          (Number.isInteger(a.responseStatus) && a.responseStatus >= 100 && a.responseStatus <= 599)) &&
        typeof a.requestTruncated === 'boolean' &&
        typeof a.responseTruncated === 'boolean' &&
        typeof a.redacted === 'boolean',
    )
  )
    return undefined
  const attempts = t.attempts.map((a) => ({
    requestBody: a.requestBody,
    responseBody: a.responseBody,
    responseStatus: a.responseStatus,
    requestTruncated: a.requestTruncated,
    responseTruncated: a.responseTruncated,
    redacted: a.redacted,
  }))
  return {
    version: 1,
    provider: t.provider,
    model: t.model,
    attempts,
    truncated: attempts.some((a) => a.requestTruncated || a.responseTruncated),
  }
}
/** Bound the wire response before JSON parsing, including diagnostic strings. */
export async function readDesignResponse(response: Response): Promise<Record<string, any>> {
  const maximum = 6 * 1024 * 1024
  if (Number(response.headers.get('content-length')) > maximum) throw new Error('AI-antwoord is te groot om te tonen.')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('AI-antwoord ontbreekt.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximum) {
        await reader.cancel()
        throw new Error('AI-antwoord is te groot om te tonen.')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ongeldig AI-antwoord ontvangen.')
  return value as Record<string, any>
}
export function downloadAiTrace(trace: AiTrace) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(trace, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'lightlab-ai-diagnose.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
