export const previewBpmRange = { min: 30, max: 240 }

export function validPreviewBpm(value: string): number | undefined {
  if (!value.trim()) return undefined
  const bpm = Number(value)
  return Number.isFinite(bpm) && bpm >= previewBpmRange.min && bpm <= previewBpmRange.max ? bpm : undefined
}

/** Integrate elapsed time: changing BPM must not move the already-reached musical phase. */
export function advancePreviewBeat(beat: number, elapsedMs: number, bpm: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || validPreviewBpm(String(bpm)) === undefined) return beat
  return beat + elapsedMs * bpm / 60_000
}
