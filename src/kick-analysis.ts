export const MAX_WAV_BYTES = 64 * 1024 * 1024
export const MAX_AUDIO_DURATION_SECONDS = 600

export interface WavInfo {
  duration: number
  channels: number
  sampleRate: number
}
export interface Kick {
  time: number
  strength: number
}
export interface KickAnalysis {
  duration: number
  kicks: Kick[]
  waveform: number[]
  /** Estimated kick repetition rate, not a determination of musical meter. */
  bpm: number | null
  confidence: number
}
export interface KickAnalysisOptions {
  sensitivity?: number
  minIntervalMs?: number
}

/** Header-only preflight before allocating browser-decoded audio. No compressed/RF64 WAV. */
export function inspectWav(buffer: ArrayBuffer): WavInfo {
  const invalid = () => new Error('Ongeldig WAV-bestand: beschadigde of niet-ondersteunde structuur.')
  if (buffer.byteLength > MAX_WAV_BYTES) throw new Error('WAV mag maximaal 64 MiB groot zijn.')
  if (buffer.byteLength < 44) throw invalid()
  const view = new DataView(buffer)
  const tag = (offset: number) => String.fromCharCode(...new Uint8Array(buffer, offset, 4))
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || view.getUint32(4, true) + 8 !== buffer.byteLength) throw invalid()
  let format: { channels: number; sampleRate: number; blockAlign: number } | undefined
  let dataBytes: number | undefined
  let offset = 12
  let chunkCount = 0
  while (offset < buffer.byteLength) {
    // Preflight runs before decode; hostile files must not create millions of tiny chunks.
    if (++chunkCount > 1024) throw invalid()
    if (offset + 8 > buffer.byteLength) throw invalid()
    const chunk = tag(offset)
    const size = view.getUint32(offset + 4, true)
    const start = offset + 8
    const end = start + size
    if (end > buffer.byteLength || end + (size & 1) > buffer.byteLength) throw invalid()
    if (chunk === 'fmt ') {
      if (format || size < 16) throw invalid()
      const encoding = view.getUint16(start, true)
      const channels = view.getUint16(start + 2, true)
      const sampleRate = view.getUint32(start + 4, true)
      const byteRate = view.getUint32(start + 8, true)
      const blockAlign = view.getUint16(start + 12, true)
      const bits = view.getUint16(start + 14, true)
      if (!((encoding === 1 && [16, 24, 32].includes(bits)) || (encoding === 3 && bits === 32))) {
        throw new Error('Gebruik een ongecomprimeerde WAV: PCM 16/24/32-bit of 32-bit float.')
      }
      if (
        channels < 1 ||
        channels > 8 ||
        sampleRate < 8000 ||
        sampleRate > 96000 ||
        blockAlign !== (channels * bits) / 8 ||
        byteRate !== sampleRate * blockAlign
      )
        throw invalid()
      format = { channels, sampleRate, blockAlign }
    } else if (chunk === 'data') {
      if (dataBytes !== undefined || !size) throw invalid()
      dataBytes = size
    }
    offset = end + (size & 1)
  }
  if (!format || dataBytes === undefined || dataBytes % format.blockAlign !== 0) throw invalid()
  const duration = dataBytes / format.blockAlign / format.sampleRate
  if (duration > MAX_AUDIO_DURATION_SECONDS)
    throw new Error(
      `WAV duurt ${(duration / 60).toFixed(1)} minuten; maximaal ${MAX_AUDIO_DURATION_SECONDS / 60} minuten toegestaan.`,
    )
  return { duration, channels: format.channels, sampleRate: format.sampleRate }
}

/** Pure offline analysis; run in a worker, not in a rendering/audio callback. */
export function analyzeKickAudio(
  samples: Float32Array,
  sampleRate: number,
  options: KickAnalysisOptions = {},
): KickAnalysis {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 96000 || !Number.isInteger(sampleRate)) {
    throw new Error('Audio-samplefrequentie moet tussen 8 en 96 kHz liggen.')
  }
  if (samples.length > sampleRate * MAX_AUDIO_DURATION_SECONDS)
    throw new Error(`Audio mag maximaal ${MAX_AUDIO_DURATION_SECONDS / 60} minuten duren.`)
  const sensitivity = options.sensitivity ?? 0.5
  const minIntervalMs = options.minIntervalMs ?? 160
  if (
    !Number.isFinite(sensitivity) ||
    sensitivity < 0 ||
    sensitivity > 1 ||
    !Number.isFinite(minIntervalMs) ||
    minIntervalMs < 80 ||
    minIntervalMs > 500
  )
    throw new Error('Ongeldige kickdetectie-instellingen.')
  const duration = samples.length / sampleRate
  const frameSize = Math.max(1, Math.round(sampleRate * 0.01))
  const frames = Math.ceil(samples.length / frameSize)
  const energy = new Float32Array(frames)
  const fullEnergy = new Float32Array(frames)
  const waveform = new Array<number>(Math.min(1024, samples.length)).fill(0)
  const lowAlpha = 1 - Math.exp((-2 * Math.PI * 180) / sampleRate)
  const highAlpha = Math.exp((-2 * Math.PI * 35) / sampleRate)
  let low = 0,
    high = 0,
    previousLow = 0
  // Two one-pole filters emphasize kick fundamentals without an FFT-sized allocation.
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i])) throw new Error('Audio bevat ongeldige samples.')
    const value = Math.max(-1, Math.min(1, samples[i]))
    low += lowAlpha * (value - low)
    high = highAlpha * (high + low - previousLow)
    previousLow = low
    const frame = Math.floor(i / frameSize)
    energy[frame] += (high * high) / frameSize
    fullEnergy[frame] += (value * value) / frameSize
    const bin = Math.min(waveform.length - 1, Math.floor((i * waveform.length) / samples.length))
    waveform[bin] = Math.max(waveform[bin], Math.abs(value))
  }
  const kicks: Kick[] = []
  let baseline = 0,
    previousEnergy = 0,
    maxStrength = 0
  const ratioThreshold = 4.5 - sensitivity * 2.5
  const floor = 0.00015 * Math.pow(10, -sensitivity * 2)
  for (let frame = 0; frame < frames; frame++) {
    const current = energy[frame]
    const time = Math.max(0, (frame * frameSize) / sampleRate - 0.005)
    // A rising low-frequency transient is required; sustained bass is not a train of kicks.
    const onset =
      current > floor &&
      current > (baseline + floor) * ratioThreshold &&
      current > previousEnergy * 1.2 &&
      current / Math.max(fullEnergy[frame], 1e-12) > 0.22
    if (onset && (!kicks.length || time - kicks[kicks.length - 1].time >= minIntervalMs / 1000)) {
      const strength = Math.sqrt(current)
      kicks.push({ time, strength })
      maxStrength = Math.max(maxStrength, strength)
    }
    baseline += (current - baseline) * 0.08
    previousEnergy = current
  }
  for (const kick of kicks) kick.strength = Math.min(1, kick.strength / Math.max(maxStrength, 1e-12))
  const intervals = kicks.slice(1).map((kick, index) => kick.time - kicks[index].time)
  let bpm: number | null = null,
    confidence = 0
  if (intervals.length >= 3) {
    const sorted = [...intervals].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    confidence = intervals.filter((interval) => Math.abs(interval - median) <= median * 0.12).length / intervals.length
    if (confidence >= 0.65) bpm = Math.round((60 / median) * 10) / 10
  }
  return { duration, kicks, waveform, bpm, confidence }
}
