import { expect, it } from 'vitest'
import { assertRuntimePreviewOrder, type RuntimeLivePreview } from './runtime-live-client'
function frame(count: number, beats: number, revision = 0) {
  return { sessionId: 'session', revision, status: { frameCount: count }, frame: { atBeats: beats } } as RuntimeLivePreview
}
it('accepts a new runtime frame after a backward WAV seek or source change', () => {
  expect(() => assertRuntimePreviewOrder(frame(100, 50), frame(101, 2))).not.toThrow()
})
it('still rejects stale revisions, counts and changed timestamps on the same frame', () => {
  expect(() => assertRuntimePreviewOrder(frame(100, 50), frame(99, 60))).toThrow()
  expect(() => assertRuntimePreviewOrder(frame(100, 50, 2), frame(101, 60, 1))).toThrow()
  expect(() => assertRuntimePreviewOrder(frame(100, 50), frame(100, 2))).toThrow()
})
