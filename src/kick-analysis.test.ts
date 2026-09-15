import { describe, expect, it } from 'vitest'
import { analyzeKickAudio, inspectWav, MAX_WAV_BYTES } from './kick-analysis'

const rate = 16000
function signal(times: number[], duration = 5, amplitude = 0.8) {
  const samples = new Float32Array(rate * duration)
  for (const time of times) {
    for (let i = 0; i < rate * 0.18 && i + Math.round(time * rate) < samples.length; i++) {
      samples[i + Math.round(time * rate)] +=
        amplitude * Math.sin((2 * Math.PI * 65 * i) / rate) * Math.exp((-i / rate) * 28)
    }
  }
  return samples
}
function wav(encoding = 1, bits = 16, channels = 1, sampleRate = rate, duration = 1) {
  const bytes = ((sampleRate * channels * bits) / 8) * duration
  const buffer = new ArrayBuffer(44 + bytes)
  const view = new DataView(buffer)
  const tag = (offset: number, value: string) =>
    [...value].forEach((letter, i) => view.setUint8(offset + i, letter.charCodeAt(0)))
  tag(0, 'RIFF')
  view.setUint32(4, buffer.byteLength - 8, true)
  tag(8, 'WAVE')
  tag(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, encoding, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, (sampleRate * channels * bits) / 8, true)
  view.setUint16(32, (channels * bits) / 8, true)
  view.setUint16(34, bits, true)
  tag(36, 'data')
  view.setUint32(40, bytes, true)
  return buffer
}

describe('kick analysis', () => {
  it('detects a kick train with bounded timing error and estimated repetition rate', () => {
    const times = [0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75]
    const result = analyzeKickAudio(signal(times), rate)
    expect(result.kicks).toHaveLength(times.length)
    result.kicks.forEach((kick, i) => expect(Math.abs(kick.time - times[i])).toBeLessThan(0.025))
    expect(result.bpm).toBeCloseTo(120, 0)
    expect(result.confidence).toBe(1)
    expect(result.waveform).toHaveLength(1024)
  })
  it('does not turn sustained bass into repeating triggers', () => {
    const samples = Float32Array.from({ length: rate * 3 }, (_, i) => Math.sin((2 * Math.PI * 65 * i) / rate) * 0.95)
    expect(analyzeKickAudio(samples, rate).kicks.length).toBeLessThanOrEqual(1)
  })
  it('returns empty results for silence and empty audio', () => {
    for (const samples of [new Float32Array(0), new Float32Array(rate)]) {
      const result = analyzeKickAudio(samples, rate)
      expect(result.kicks).toEqual([])
      expect(result.bpm).toBeNull()
      expect(result.confidence).toBe(0)
      expect(result.waveform.every((value) => value === 0)).toBe(true)
    }
  })
  it('rejects steady broadband noise as a kick train', () => {
    let seed = 123
    const noise = Float32Array.from({ length: rate * 3 }, () => {
      seed = (1664525 * seed + 1013904223) >>> 0
      return ((seed / 0xffffffff) * 2 - 1) * 0.8
    })
    expect(analyzeKickAudio(noise, rate).kicks).toHaveLength(0)
  })
  it('ignores higher-frequency transients and does not retrigger a long kick tail', () => {
    const treble = Float32Array.from(
      { length: rate },
      (_, i) => Math.sin((2 * Math.PI * 3000 * i) / rate) * Math.exp((-i / rate) * 15),
    )
    expect(analyzeKickAudio(treble, rate).kicks).toHaveLength(0)
    const tail = Float32Array.from(
      { length: rate * 2 },
      (_, i) => Math.sin((2 * Math.PI * 65 * i) / rate) * Math.exp((-i / rate) * 2),
    )
    expect(analyzeKickAudio(tail, rate, { minIntervalMs: 80, sensitivity: 1 }).kicks).toHaveLength(1)
  })
  it('honors the refractory interval and sensitivity', () => {
    const samples = signal([0.1, 0.35, 0.6, 0.85], 1)
    expect(analyzeKickAudio(samples, rate, { minIntervalMs: 400 }).kicks).toHaveLength(2)
    expect(analyzeKickAudio(samples, rate, { minIntervalMs: 80 }).kicks).toHaveLength(4)
    const quiet = signal([0.25, 0.75], 1, 0.012)
    expect(analyzeKickAudio(quiet, rate, { sensitivity: 1 }).kicks.length).toBeGreaterThan(
      analyzeKickAudio(quiet, rate, { sensitivity: 0 }).kicks.length,
    )
  })
  it('does not claim tempo certainty for irregular isolated kicks', () => {
    const result = analyzeKickAudio(signal([0.1, 0.45, 1.2, 2.3, 2.55, 3.9]), rate)
    expect(result.bpm).toBeNull()
    expect(result.confidence).toBeLessThan(0.65)
  })
  it('clamps clipped finite samples and rejects malformed/beyond-duration inputs', () => {
    expect(analyzeKickAudio(signal([0.2], 1, 4), rate).waveform.every((value) => value <= 1)).toBe(true)
    expect(() => analyzeKickAudio(new Float32Array([NaN]), rate)).toThrow('samples')
    expect(() => analyzeKickAudio(new Float32Array(8000 * 601), 8000)).toThrow('10 minuten')
    expect(() => analyzeKickAudio(new Float32Array(0), Infinity)).toThrow('samplefrequentie')
    expect(() => analyzeKickAudio(new Float32Array(0), rate, { sensitivity: NaN })).toThrow('instellingen')
    expect(() => analyzeKickAudio(new Float32Array(0), rate, { minIntervalMs: 79 })).toThrow('instellingen')
  })
})

describe('WAV preflight', () => {
  it('accepts a six-minute mono recording like K.IN.WAV without retaining private audio', () => {
    const duration = 378.65541666666667
    expect(inspectWav(wav(1, 16, 1, 48000, duration)).duration).toBeCloseTo(duration)
    expect(analyzeKickAudio(new Float32Array(8000 * 379), 8000).duration).toBe(379)
  })
  it.each([
    [1, 16],
    [1, 24],
    [1, 32],
    [3, 32],
  ])('accepts bounded uncompressed encoding %s/%s', (encoding, bits) => {
    expect(inspectWav(wav(encoding, bits, 2))).toEqual({ duration: 1, channels: 2, sampleRate: rate })
  })
  it('rejects malformed, truncated, oversized and misleading rate metadata before decode', () => {
    expect(() => inspectWav(new ArrayBuffer(0))).toThrow('WAV')
    expect(() => inspectWav(wav().slice(0, -1))).toThrow('WAV')
    expect(() => inspectWav(new ArrayBuffer(MAX_WAV_BYTES + 1))).toThrow('64 MiB')
    expect(() => inspectWav(wav(1, 16, 1, 8000, 601))).toThrow('10 minuten')
    expect(() => inspectWav(wav(6))).toThrow('ongecomprimeerde')
    expect(() => inspectWav(wav(1, 8))).toThrow('ongecomprimeerde')
    expect(() => inspectWav(wav(1, 16, 9))).toThrow('WAV')
    const lyingRate = wav()
    new DataView(lyingRate).setUint32(28, 1, true)
    expect(() => inspectWav(lyingRate)).toThrow('WAV')
    const giantChunk = wav()
    new DataView(giantChunk).setUint32(40, 0xffffffff, true)
    expect(() => inspectWav(giantChunk)).toThrow('WAV')
  })
  it('accepts padded metadata but rejects missing padding and duplicate data chunks', () => {
    const original = new Uint8Array(wav())
    const withMetadata = new Uint8Array(original.length + 10)
    withMetadata.set(original.subarray(0, 36))
    withMetadata.set([74, 85, 78, 75, 1, 0, 0, 0, 42, 0], 36) // Odd JUNK chunk needs a padding byte.
    withMetadata.set(original.subarray(36), 46)
    new DataView(withMetadata.buffer).setUint32(4, withMetadata.length - 8, true)
    expect(inspectWav(withMetadata.buffer).duration).toBe(1)
    const withoutPadding = new Uint8Array(withMetadata.length - 1)
    withoutPadding.set(withMetadata.subarray(0, 45))
    withoutPadding.set(withMetadata.subarray(46), 45)
    new DataView(withoutPadding.buffer).setUint32(4, withoutPadding.length - 8, true)
    expect(() => inspectWav(withoutPadding.buffer)).toThrow('WAV')
    const duplicateData = new Uint8Array(original.length + 10)
    duplicateData.set(original)
    duplicateData.set([100, 97, 116, 97, 2, 0, 0, 0, 0, 0], original.length)
    new DataView(duplicateData.buffer).setUint32(4, duplicateData.length - 8, true)
    expect(() => inspectWav(duplicateData.buffer)).toThrow('WAV')
  })
  it('bounds header traversal even when many tiny chunks fit within the byte limit', () => {
    const original = new Uint8Array(wav())
    const excessive = new Uint8Array(original.length + 1024 * 8)
    excessive.set(original)
    for (let i = 0; i < 1024; i++) excessive.set([74, 85, 78, 75, 0, 0, 0, 0], original.length + i * 8)
    new DataView(excessive.buffer).setUint32(4, excessive.length - 8, true)
    expect(() => inspectWav(excessive.buffer)).toThrow('WAV')
  })
})
