import { analyzeKickAudio } from './kick-analysis'
self.onmessage = (event: MessageEvent<{ samples: Float32Array; sampleRate: number; sensitivity: number; minIntervalMs: number }>) => {
  try {
    const { samples, sampleRate, sensitivity, minIntervalMs } = event.data
    self.postMessage({ analysis: analyzeKickAudio(samples, sampleRate, { sensitivity, minIntervalMs }) })
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Audioanalyse mislukt.' }) }
}
