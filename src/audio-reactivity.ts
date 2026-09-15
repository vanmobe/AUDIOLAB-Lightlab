import { evaluateFrame, resolveLookLayers, type ShowDocument, type RuntimeState } from './domain'
import { fixtureProfiles } from './fixtures'
import type { KickAnalysis } from './kick-analysis'

export type AudioReaction = 'look' | 'pulse' | 'step' | 'static'
export function kickIndexAt(analysis: KickAnalysis | undefined, seconds: number): number {
  const kicks = analysis?.kicks ?? []
  let low = 0,
    high = kicks.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (kicks[middle].time <= seconds) low = middle + 1
    else high = middle
  }
  return low - 1
}

/** Session-only adaptation; the saved Look, palette limits and off groups remain intact. */
export function audioPreviewFrame(
  show: ShowDocument,
  lookId: string,
  seconds: number,
  analysis: KickAnalysis | undefined,
  reactions: Record<string, AudioReaction>,
  bpm: number,
  decayMs: number,
  floor: number,
  state: RuntimeState = { mode: 'automation', activeLookId: lookId },
) {
  const look = show.looks.find((item) => item.id === lookId)
  const index = kickIndexAt(analysis, seconds)
  const last = analysis?.kicks[index]
  const envelope = last ? Math.max(0, 1 - ((seconds - last.time) * 1000) / Math.max(50, decayMs)) : 0
  const beats = (Math.max(0, seconds) * bpm) / 60
  if (state.mode === 'blackout' || state.mode === 'safety') return evaluateFrame(show, fixtureProfiles, state, beats)
  if (!look) return evaluateFrame(show, fixtureProfiles, { mode: 'blackout', activeLookId: lookId }, beats)
  const layers = resolveLookLayers(show, look).map((layer) => {
    const reaction = reactions[layer.groupId] ?? 'look'
    if (layer.mode === 'off') return layer
    if (reaction === 'pulse' || reaction === 'static')
      return {
        ...layer,
        mode: 'static' as const,
        intensity: layer.intensity * (reaction === 'pulse' ? floor + (1 - floor) * envelope : 1),
      }
    // Fractional cycle steps avoid repeatedly sampling the same phase of a one-beat pattern.
    if (reaction === 'step')
      return { ...layer, offsetBeats: (layer.offsetBeats ?? 0) + beats - ((index + 1) * (layer.rateBeats ?? 1)) / 8 }
    return layer
  })
  const preview = { ...show, looks: show.looks.map((item) => (item.id === lookId ? { ...item, layers } : item)) }
  return evaluateFrame(preview, fixtureProfiles, state, beats)
}
