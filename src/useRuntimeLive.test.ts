import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useRuntimeLive } from './useRuntimeLive'
import { initialShow } from './seed'
import { evaluateFrame } from './domain'
import { fixtureProfiles } from './fixtures'
import { PlaybackConflict } from './playback-client'

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => unknown)[], status: vi.fn(), start: vi.fn(), command: vi.fn(), show: vi.fn(), preview: vi.fn(), live: vi.fn() }))
vi.mock('./playback-client', async original => ({ ...await original<typeof import('./playback-client')>(), getPlaybackStatus: hooks.status, startPlayback: hooks.start, commandPlayback: hooks.command }))
vi.mock('./runtime-live-client', async original => ({ ...await original<typeof import('./runtime-live-client')>(), getRuntimeShow: hooks.show, getRuntimePreview: hooks.preview, setRuntimeLive: hooks.live }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const index = hooks.cursor++; if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial; return [hooks.values[index], (next: unknown) => { hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next }] },
  useRef: (initial: unknown) => { const index = hooks.cursor++; if (!(index in hooks.values)) hooks.values[index] = { current: initial }; return hooks.values[index] },
  useEffect: (effect: () => unknown) => { hooks.effects.push(effect) },
}))
const status = { version: 1, sessionId: 'session', status: 'running', mode: 'automation', lookId: initialShow.activeLookId, bpm: 120, atBeats: 2, frameCount: 50, universeCount: 1, outputSent: false, error: null }
const masters = Object.fromEntries(initialShow.groups.map(group => [group.id, group.intensity]))
const frame = (revision = 0) => ({ version: 1, sessionId: 'session', status, frame: evaluateFrame(initialShow, fixtureProfiles, { mode: 'automation', activeLookId: initialShow.activeLookId }, 2), controls: { overrides: {}, links: [] }, groupIntensities: masters, colorLockId: null, revision })
let cleanup: (() => void) | undefined
beforeEach(() => {
  vi.useFakeTimers(); hooks.values = []; hooks.cursor = 0; hooks.effects = []
  for (const mock of [hooks.status, hooks.start, hooks.command, hooks.show, hooks.preview, hooks.live]) mock.mockReset()
  hooks.status.mockResolvedValue(status); hooks.start.mockResolvedValue(status); hooks.command.mockResolvedValue(status); hooks.show.mockResolvedValue(initialShow); hooks.preview.mockResolvedValue(frame()); hooks.live.mockResolvedValue(status)
})
afterEach(() => { cleanup?.(); cleanup = undefined; vi.useRealTimers() })
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
function setup() { const render = () => { hooks.cursor = 0; hooks.effects = []; return useRuntimeLive() }; render(); cleanup = hooks.effects[0]() as () => void; return render }

it('discovers status only and never autoattaches, starts or stops on lifecycle', async () => {
  const render = setup(); await tick()
  expect(render().status?.sessionId).toBe('session')
  expect(render().connected).toBe(false)
  expect(hooks.show).not.toHaveBeenCalled(); expect(hooks.preview).not.toHaveBeenCalled(); expect(hooks.start).not.toHaveBeenCalled()
  cleanup!(); cleanup = undefined
  expect(hooks.command).not.toHaveBeenCalled()
})
it('refreshes stopped or restarted runtime status without loading or starting a show', async () => {
  const render = setup(); await tick()
  hooks.status.mockResolvedValueOnce({ ...status, sessionId: null, status: 'stopped' })
  await render().refreshStatus()
  expect(render().status?.status).toBe('stopped')
  expect(render().error).toBe('')
  hooks.status.mockRejectedValueOnce(new Error('Runtime stopped'))
  await render().refreshStatus()
  expect(render().status).toBeUndefined()
  hooks.status.mockResolvedValueOnce(status)
  await render().refreshStatus()
  expect(render().status?.status).toBe('running')
  expect(render().connected).toBe(false)
  expect(hooks.show).not.toHaveBeenCalled(); expect(hooks.start).not.toHaveBeenCalled(); expect(hooks.command).not.toHaveBeenCalled()
})
it('background status discovery preserves an unsuccessful show-start explanation', async () => {
  const render = setup(); await tick()
  hooks.start.mockRejectedValueOnce(new Error('Patch ongeldig'))
  await render().start(initialShow, 120)
  await render().refreshStatus()
  expect(render().error).toBe('Patch ongeldig')
})
it('attaches to server snapshot and consumes real sequential frames without overlapping reads', async () => {
  const render = setup(); await tick(); await render().attach()
  expect(render().show).toBe(initialShow); expect(render().preview).toEqual(frame()); expect(render().connected).toBe(true)
  let resolve!: (value: unknown) => void
  hooks.preview.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  await vi.advanceTimersByTimeAsync(50)
  expect(hooks.preview).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(500)
  expect(hooks.preview).toHaveBeenCalledTimes(2)
  resolve(frame()); await tick(); await vi.advanceTimersByTimeAsync(50)
  expect(hooks.preview).toHaveBeenCalledTimes(3)
})
it('clears the last frame on disconnect and reconnects only on explicit attach', async () => {
  const render = setup(); await tick(); await render().attach()
  hooks.preview.mockRejectedValueOnce(new Error('Disconnected'))
  await vi.advanceTimersByTimeAsync(50)
  expect(render().preview).toBeUndefined(); expect(render().connected).toBe(false)
  const calls = hooks.preview.mock.calls.length
  await vi.advanceTimersByTimeAsync(1000); expect(hooks.preview).toHaveBeenCalledTimes(calls)
  await render().attach(); expect(render().connected).toBe(true)
})
it('stop supersedes a pending mutation and ignores its late reply', async () => {
  const render = setup(); await tick(); await render().attach()
  let resolve!: (value: unknown) => void
  hooks.command.mockImplementationOnce(() => new Promise(done => { resolve = done })).mockResolvedValueOnce({ ...status, status: 'stopped' })
  const pending = render().command({ command: 'mode', mode: 'blackout' })
  await render().stop()
  resolve(status); await pending
  expect(render().status?.status).toBe('stopped'); expect(render().connected).toBe(false); expect(render().preview).toBeUndefined()
  expect((hooks.command.mock.calls[0][2] as AbortSignal).aborted).toBe(true)
})
it('fences live settings with the rendered revision, not a newer unpublished poll revision', async () => {
  const render = setup(); await tick(); await render().attach()
  const rendered = render()
  hooks.preview.mockResolvedValueOnce(frame(1))
  await vi.advanceTimersByTimeAsync(50)
  // React has not rendered the new server revision yet; this handler still belongs to revision 0.
  await rendered.setLive({ overrides: { wash: { intensity: .5 } }, links: [] }, masters, null)
  expect(hooks.live).not.toHaveBeenCalled()
  expect(render().connected).toBe(false)
  expect(render().error).toContain('intussen veranderd')
})
it('serializes live mutations without queuing slider changes and disconnects on conflict', async () => {
  const render = setup(); await tick(); await render().attach()
  let reject!: (reason: unknown) => void
  hooks.live.mockImplementationOnce(() => new Promise((_done, fail) => { reject = fail }))
  const action = render().setLive({ overrides: {}, links: [] }, masters, null)
  await render().setLive({ overrides: {}, links: [] }, { ...masters, wash: .2 }, null)
  expect(hooks.live).toHaveBeenCalledOnce(); expect(hooks.live.mock.calls[0][1]).toBe(0)
  reject(new PlaybackConflict('Changed revision')); await action
  expect(render().preview).toBeUndefined(); expect(render().pending).toBe(false)
})
it('start loads the returned snapshot rather than reevaluating a local replacement', async () => {
  const render = setup(); await tick()
  await render().start(initialShow, 90)
  expect(hooks.start.mock.calls[0].slice(0, 3)).toEqual([initialShow, initialShow.activeLookId, 90])
  expect(hooks.show).toHaveBeenCalledOnce(); expect(render().preview).toEqual(frame())
})

it('validates replacement schema, size and BPM before reading status or stopping the current show', async () => {
  const render = setup(); await tick(); hooks.status.mockClear()
  const cases: [typeof initialShow, number][] = [[initialShow, 0], [{ ...initialShow, activeLookId: 'missing' }, 120], [{ ...initialShow, padding: 'x'.repeat(2 * 1024 * 1024) } as typeof initialShow, 120]]
  for (const [snapshot, bpm] of cases) {
    await render().loadEditorShow(snapshot, bpm)
  }
  expect(hooks.status).not.toHaveBeenCalled(); expect(hooks.command).not.toHaveBeenCalled(); expect(hooks.start).not.toHaveBeenCalled()
})

it('rejects deterministic patch errors and runtime head limits before stopping the old show', async () => {
  const render = setup(); await tick(); hooks.status.mockClear()
  const overlap = structuredClone(initialShow)
  overlap.fixtures[1].patch = { ...overlap.fixtures[0].patch! }
  const unknown = structuredClone(initialShow); unknown.fixtures[0].modeId = 'unknown'
  const crowded = structuredClone(initialShow)
  crowded.fixtures = Array.from({ length: 5 }, (_, index) => ({ ...crowded.fixtures[0], id: `fixture-${index}`, patch: undefined, visualSegments: 64 }))
  for (const snapshot of [overlap, unknown, crowded]) await render().loadEditorShow(snapshot, 120)
  expect(hooks.status).not.toHaveBeenCalled(); expect(hooks.command).not.toHaveBeenCalled(); expect(hooks.start).not.toHaveBeenCalled()
})

it('replaces only the known session and publishes fetched new server snapshot and frame', async () => {
  const render = setup(); await tick()
  const nextStatus = { ...status, sessionId: 'new-session' }
  const loaded = { ...initialShow, name: 'Server snapshot' }
  const nextFrame = { ...frame(), sessionId: 'new-session', status: nextStatus }
  hooks.command.mockResolvedValueOnce({ ...status, status: 'stopped' })
  hooks.start.mockResolvedValueOnce(nextStatus); hooks.show.mockResolvedValueOnce(loaded); hooks.preview.mockResolvedValueOnce(nextFrame)
  await render().loadEditorShow(initialShow, 95)
  expect(hooks.command.mock.calls[0].slice(0, 2)).toEqual(['session', { command: 'stop' }])
  expect(hooks.start.mock.calls[0].slice(0, 3)).toEqual([initialShow, initialShow.activeLookId, 95])
  expect(hooks.start.mock.calls[0][0]).not.toBe(initialShow)
  expect(render().show).toBe(loaded); expect(render().preview).toEqual(nextFrame)
  expect(render().connected).toBe(true); expect(render().error).toBe('')
})

it('never stops a session that changed since the rendered status', async () => {
  const render = setup(); await tick()
  hooks.status.mockResolvedValueOnce({ ...status, sessionId: 'other-session' })
  await render().loadEditorShow(initialShow, 120)
  expect(hooks.command).not.toHaveBeenCalled(); expect(hooks.start).not.toHaveBeenCalled()
  expect(render().error).toContain('Geen show is vervangen')
})

it('keeps attached frame and connection during replacement preflight and after discovery failure', async () => {
  const render = setup(); await tick(); await render().attach()
  const previous = render().preview
  let reject!: (reason: unknown) => void
  hooks.status.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
  const pending = render().loadEditorShow(initialShow, 120)
  expect(render().preview).toBe(previous); expect(render().connected).toBe(true)
  expect(render().status?.status).toBe('running')
  reject(new Error('Status unavailable')); await pending
  expect(render().preview).toBe(previous); expect(render().connected).toBe(true)
  expect(render().status?.sessionId).toBe('session')
  expect(render().error).toContain('actuele status is niet bevestigd')
  expect(hooks.command).not.toHaveBeenCalled(); expect(hooks.start).not.toHaveBeenCalled()
  const reads = hooks.preview.mock.calls.length
  await vi.advanceTimersByTimeAsync(500)
  expect(hooks.preview).toHaveBeenCalledTimes(reads)
})

it('stale-session preflight preserves attachment and old status without polling or writes', async () => {
  const render = setup(); await tick(); await render().attach()
  const previous = render().preview
  hooks.status.mockResolvedValueOnce({ ...status, sessionId: 'replacement-by-other-client' })
  await render().loadEditorShow(initialShow, 120)
  expect(render().preview).toBe(previous); expect(render().connected).toBe(true)
  expect(render().status?.sessionId).toBe('session')
  expect(hooks.command).not.toHaveBeenCalled(); expect(hooks.start).not.toHaveBeenCalled()
  const reads = hooks.preview.mock.calls.length
  await vi.advanceTimersByTimeAsync(500)
  expect(hooks.preview).toHaveBeenCalledTimes(reads)
})

it('invalid replacement keeps the existing same-session preview poll running', async () => {
  const render = setup(); await tick(); await render().attach()
  await render().loadEditorShow(initialShow, 0)
  expect(render().connected).toBe(true)
  await vi.advanceTimersByTimeAsync(50)
  expect(hooks.preview).toHaveBeenCalledTimes(2)
  expect(hooks.command).not.toHaveBeenCalled(); expect(hooks.start).not.toHaveBeenCalled()
})

it('failed or unconfirmed old-session stop never starts replacement', async () => {
  const render = setup(); await tick()
  hooks.command.mockRejectedValueOnce(new Error('Stop failed'))
  await render().loadEditorShow(initialShow, 120)
  expect(hooks.start).not.toHaveBeenCalled(); expect(render().error).toContain('Stop failed')
  hooks.command.mockResolvedValueOnce(status)
  await render().loadEditorShow(initialShow, 120)
  expect(hooks.start).not.toHaveBeenCalled(); expect(render().error).toContain('niet bevestigd')
})

it('replacement is singleflight and later editor changes cannot alter the validated start payload', async () => {
  const render = setup(); await tick()
  let resolve!: (value: unknown) => void
  hooks.command.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const editable = structuredClone(initialShow)
  const pending = render().loadEditorShow(editable, 100); await tick()
  await render().loadEditorShow(initialShow, 150)
  editable.looks[0].name = 'Changed after click'
  resolve({ ...status, status: 'stopped' }); await pending
  expect(hooks.command).toHaveBeenCalledOnce(); expect(hooks.start).toHaveBeenCalledOnce()
  expect(hooks.start.mock.calls[0][0].looks[0].name).not.toBe('Changed after click')
  expect(hooks.start.mock.calls[0][2]).toBe(100)
})

it('Stop supersedes replacement during pending stop and prevents a late start', async () => {
  const render = setup(); await tick()
  let resolve!: (value: unknown) => void
  hooks.command.mockImplementationOnce(() => new Promise(done => { resolve = done })).mockResolvedValueOnce({ ...status, status: 'stopped' })
  const replacement = render().loadEditorShow(initialShow, 100); await tick()
  await render().stop()
  resolve({ ...status, status: 'stopped' }); await replacement
  expect(hooks.start).not.toHaveBeenCalled(); expect(render().connected).toBe(false)
})

it('unmount cancels replacement before start without sending an extra stop', async () => {
  const render = setup(); await tick()
  let resolve!: (value: unknown) => void
  hooks.command.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const pending = render().loadEditorShow(initialShow, 100); await tick()
  cleanup!(); cleanup = undefined
  resolve({ ...status, status: 'stopped' }); await pending
  expect(hooks.command).toHaveBeenCalledOnce(); expect(hooks.start).not.toHaveBeenCalled()
})

it('ambiguous replacement start explains that old show stopped and never retries', async () => {
  const render = setup(); await tick()
  hooks.command.mockResolvedValueOnce({ ...status, status: 'stopped' })
  hooks.start.mockRejectedValueOnce(new Error('Timeout'))
  await render().loadEditorShow(initialShow, 100)
  expect(render().error).toContain('De oude show is gestopt')
  expect(render().error).toContain('startaanvraag kan ontvangen zijn')
  await vi.advanceTimersByTimeAsync(1000)
  expect(hooks.start).toHaveBeenCalledOnce(); expect(render().connected).toBe(false)
})

it('loading into an idle runtime skips stop and Stop still cancels a pending idle preflight', async () => {
  hooks.status.mockResolvedValue({ ...status, status: 'idle', sessionId: null, lookId: null })
  const render = setup(); await tick()
  let resolve!: (value: unknown) => void
  hooks.status.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const pending = render().loadEditorShow(initialShow, 120)
  await render().stop()
  resolve({ ...status, status: 'idle', sessionId: null, lookId: null }); await pending
  expect(hooks.start).not.toHaveBeenCalled(); expect(hooks.command).not.toHaveBeenCalled()
  await render().loadEditorShow(initialShow, 120)
  expect(hooks.start).toHaveBeenCalledOnce(); expect(hooks.command).not.toHaveBeenCalled()
})
