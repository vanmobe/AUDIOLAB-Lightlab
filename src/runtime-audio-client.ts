import type { AudioLiveSnapshot } from './audio-live'
import { requestRuntime } from './runtime-live-client'

export interface RuntimeAudioStatus {
  version: 1
  sessionId: string
  audioId: string | null
  state: 'detached' | 'following' | 'lost'
  sequence: number
  error: string | null
}
export function parseRuntimeAudioStatus(value: unknown, sessionId: string): RuntimeAudioStatus {
  if (!value || typeof value !== 'object') throw new Error('Ongeldig audioantwoord van de runtime.')
  const item = value as RuntimeAudioStatus
  if (
    item.version !== 1 ||
    item.sessionId !== sessionId ||
    !['detached', 'following', 'lost'].includes(item.state) ||
    !(item.audioId === null || (typeof item.audioId === 'string' && /^[a-f0-9]{32}$/.test(item.audioId))) ||
    !Number.isSafeInteger(item.sequence) ||
    item.sequence < 0 ||
    !(item.error === null || (typeof item.error === 'string' && item.error.length <= 4096)) ||
    (item.state === 'following' && !item.audioId)
  )
    throw new Error('Ongeldige of verouderde audiostatus. Verbind opnieuw.')
  return item
}
export function audioPosition(input: AudioLiveSnapshot) {
  return {
    seconds: input.seconds,
    playing: input.playing ?? false,
    mode: input.mode,
    bpm: input.bpm,
    reactions: input.reactions,
    decayMs: input.decayMs,
    floor: input.floor,
  }
}
export async function sendRuntimeAudio(
  sessionId: string,
  audioId: string,
  command: 'attach' | 'sync' | 'detach',
  signal: AbortSignal,
  input?: AudioLiveSnapshot,
  sequence = 0,
): Promise<RuntimeAudioStatus> {
  if (!sessionId || !/^[a-f0-9]{32}$/.test(audioId) || (command !== 'detach' && !input))
    throw new Error('Geen geldige audioverbinding of WAV-analyse.')
  const body = {
    version: 1,
    sessionId,
    audioId,
    command,
    ...(command !== 'detach' ? { sequence, position: audioPosition(input!) } : {}),
    ...(command === 'attach'
      ? {
          analysis: {
            duration: input!.analysis.duration,
            kicks: input!.analysis.kicks,
            bpm: input!.analysis.bpm,
            confidence: input!.analysis.confidence,
          },
        }
      : {}),
  }
  return parseRuntimeAudioStatus(await requestRuntime('audio', signal, 16384, body), sessionId)
}

type Send = typeof sendRuntimeAudio
/** One outstanding clock message, no retries/queue. A failed lease requires a new explicit connect. */
export class RuntimeAudioLink {
  private audioId: string | undefined
  private analysis: AudioLiveSnapshot['analysis'] | undefined
  private sequence = 0
  private epoch = 0
  private pending: AbortController | undefined
  constructor(
    private sessionId: string,
    private send: Send = sendRuntimeAudio,
  ) {}
  get connected() {
    return this.audioId !== undefined && this.analysis !== undefined
  }
  async connect(input: AudioLiveSnapshot): Promise<RuntimeAudioStatus> {
    if (this.audioId || this.pending) throw new Error('Er is al een audioverbinding of aanvraag actief.')
    const audioId = crypto.randomUUID().replaceAll('-', ''),
      epoch = ++this.epoch
    this.audioId = audioId
    this.sequence = 0
    const controller = new AbortController()
    this.pending = controller
    try {
      const result = await this.send(this.sessionId, audioId, 'attach', controller.signal, input, 0)
      if (epoch !== this.epoch) throw new Error('Audioverbinding geannuleerd.')
      if (result.state !== 'following' || result.audioId !== audioId || result.sequence !== 0)
        throw new Error('De runtime volgt deze audiobron niet.')
      this.analysis = input.analysis
      return result
    } catch (error) {
      if (epoch === this.epoch) void this.disconnect()
      throw error
    } finally {
      if (this.pending === controller) this.pending = undefined
    }
  }
  async sync(input: AudioLiveSnapshot | undefined): Promise<RuntimeAudioStatus | undefined> {
    if (!this.connected || this.pending) return
    if (!input || input.analysis !== this.analysis) {
      await this.disconnect()
      throw new Error('WAV of audiokoppeling gewijzigd. Uitvoer is uitgeschakeld; koppel de opname opnieuw.')
    }
    const audioId = this.audioId!,
      sequence = ++this.sequence,
      epoch = this.epoch
    const controller = new AbortController()
    this.pending = controller
    // A stalled request must not build a backlog. Runtime watchdog independently disarms output.
    const timer = setTimeout(() => controller.abort(), 1500)
    try {
      const result = await this.send(this.sessionId, audioId, 'sync', controller.signal, input, sequence)
      if (epoch !== this.epoch) return
      if (result.state !== 'following' || result.audioId !== audioId || result.sequence !== sequence)
        throw new Error('De audioverbinding is gestopt. Koppel opnieuw en bevestig uitvoer opnieuw.')
      return result
    } catch (error) {
      if (epoch === this.epoch) void this.disconnect()
      throw error
    } finally {
      clearTimeout(timer)
      if (this.pending === controller) this.pending = undefined
    }
  }
  async disconnect(): Promise<void> {
    const id = this.audioId
    this.epoch++
    this.audioId = undefined
    this.analysis = undefined
    this.pending?.abort()
    this.pending = undefined
    if (id) {
      // Best effort only: closing the page may cancel this; the runtime lease still expires.
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 1500)
      try {
        await this.send(this.sessionId, id, 'detach', controller.signal)
      } catch {
        /* No automatic reattach or re-arm. */
      } finally {
        clearTimeout(timer)
      }
    }
  }
}
