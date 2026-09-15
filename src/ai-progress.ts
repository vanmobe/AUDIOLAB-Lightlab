import { readDesignResponse } from './ai-trace'

export const phaseLabels = {
  waiting: 'Wachten op het model',
  thinking: 'Model denkt na',
  generating: 'Voorstel wordt geschreven',
  validating: 'Voorstel controleren',
  correcting: 'Model corrigeert het voorstel',
}
export interface AiProgress {
  type: 'progress'
  phase: keyof typeof phaseLabels
  attempt: number
  thinking?: string
  content?: string
  clipped?: boolean
}
export type AiSignal = AiProgress | { type: 'heartbeat' }

/** Progress is provisional, bounded and never part of a show document. */
export async function readAiResponse(
  response: Response,
  signal: AbortSignal,
  onSignal: (event: AiSignal) => void,
): Promise<Record<string, any>> {
  if (!response.headers.get('content-type')?.includes('application/x-ndjson')) return readDesignResponse(response)
  const reader = response.body?.getReader()
  if (!reader) throw new Error('AI-antwoord ontbreekt.')
  const cancel = () => {
    void reader.cancel().catch(() => {})
  }
  signal.addEventListener('abort', cancel, { once: true })
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let buffer = ''
  let bytes = 0
  let preview = 0
  function parse(line: string): Record<string, any> | undefined {
    const event = JSON.parse(line)
    if (!event || typeof event !== 'object') throw new Error('Ongeldig AI-voortgangsbericht.')
    if (event.type === 'result' && event.result && typeof event.result === 'object' && !Array.isArray(event.result))
      return event.result
    if (event.type === 'error' && typeof event.error === 'string')
      return { error: event.error, trace: event.trace, code: event.code }
    if (event.type === 'heartbeat') {
      onSignal({ type: 'heartbeat' })
      return
    }
    if (
      event.type !== 'progress' ||
      !Object.hasOwn(phaseLabels, event.phase) ||
      ![1, 2].includes(event.attempt) ||
      ['thinking', 'content'].some((key) => event[key] != null && typeof event[key] !== 'string')
    )
      throw new Error('Ongeldig AI-voortgangsbericht.')
    preview += (event.thinking?.length || 0) + (event.content?.length || 0)
    if (preview > 32768) throw new Error('AI-voortgang bevat te veel tekst.')
    onSignal({
      type: 'progress',
      phase: event.phase,
      attempt: event.attempt,
      thinking: event.thinking ?? undefined,
      content: event.content ?? undefined,
      clipped: event.clipped === true,
    })
  }
  try {
    for (;;) {
      signal.throwIfAborted()
      const { value, done } = await reader.read()
      signal.throwIfAborted()
      bytes += value?.byteLength || 0
      if (bytes > 8 * 1024 * 1024) throw new Error('AI-antwoord is te groot om te tonen.')
      buffer += decoder.decode(value, { stream: !done })
      if (buffer.length > 6 * 1024 * 1024) throw new Error('AI-bericht is te groot om te tonen.')
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line) {
          const result = parse(line)
          if (result) return result
        }
      }
      if (done) {
        if (buffer.trim()) {
          const result = parse(buffer)
          if (result) return result
        }
        throw new Error(
          'Verbinding onderbroken vóór het volledige AI-antwoord. Je show is niet gewijzigd. Probeer opnieuw wanneer de runtime bereikbaar is.',
        )
      }
    }
  } catch (error) {
    if (error instanceof TypeError)
      throw new Error('De AI-verbinding werd onderbroken of bevatte ongeldige tekst. Je show is niet gewijzigd.')
    if (error instanceof SyntaxError) throw new Error('Ongeldig AI-voortgangsbericht. Je show is niet gewijzigd.')
    throw error
  } finally {
    signal.removeEventListener('abort', cancel)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
