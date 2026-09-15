import { Children, isValidElement, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RuntimePlaybackPanel } from './RuntimePlaybackPanel'
import { initialShow } from './seed'
import { PlaybackConflict, PlaybackUnavailable } from './playback-client'

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => unknown)[], get: vi.fn(), start: vi.fn(), command: vi.fn() }))
vi.mock('./playback-client', async original => ({ ...await original<typeof import('./playback-client')>(), getPlaybackStatus: hooks.get, startPlayback: hooks.start, commandPlayback: hooks.command }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const index = hooks.cursor++; if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial; return [hooks.values[index], (next: unknown) => { hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next }] },
  useRef: (initial: unknown) => { const index = hooks.cursor++; if (!(index in hooks.values)) hooks.values[index] = { current: initial }; return hooks.values[index] },
  useEffect: (effect: () => unknown) => { hooks.effects.push(effect) },
}))
interface Props { children?: ReactNode; disabled?: boolean; value?: string; 'aria-label'?: string; onClick?: () => unknown; onChange?: (event: { target: { value: string } }) => void }
const text = (node: ReactNode): string => Children.toArray(node).map(child => isValidElement<Props>(child) ? text(child.props.children) : String(child)).join('')
function find(node: ReactNode, match: (props: Props) => boolean): Props {
  for (const child of Children.toArray(node)) { if (!isValidElement<Props>(child)) continue; if (match(child.props)) return child.props; try { return find(child.props.children, match) } catch { /* next */ } }
  throw new Error('Control not found')
}
const running = { version: 1, sessionId: 'session', status: 'running', mode: 'automation', lookId: initialShow.activeLookId, bpm: 120, atBeats: 1, frameCount: 50, universeCount: 1, outputSent: false, error: null }
const idle = { ...running, sessionId: null, status: 'idle', lookId: null }
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
beforeEach(() => { hooks.values = []; hooks.cursor = 0; hooks.effects = []; hooks.get.mockReset(); hooks.start.mockReset(); hooks.command.mockReset() })
afterEach(() => vi.useRealTimers())
function setup() {
  let show = initialShow, dirty = false
  const render = () => { hooks.cursor = 0; hooks.effects = []; return RuntimePlaybackPanel({ show, dirty }) }
  const button = (name: string) => find(render(), props => !!props.onClick && text(props.children) === name)
  return { render, button, change: (next: typeof show) => { show = next }, dirty: () => { dirty = true } }
}

it('discovers a prior session on mount without starting or stopping it, even on unmount', async () => {
  hooks.get.mockResolvedValue(running)
  const view = setup(); view.render(); const cleanup = hooks.effects[0]() as () => void
  await tick()
  expect(text(view.render())).toContain('eerder of vanuit een ander tabblad gestart')
  expect(text(view.render())).toContain(initialShow.activeLookId)
  expect(view.button('Start opgeslagen snapshot').disabled).toBe(true)
  cleanup()
  expect(hooks.start).not.toHaveBeenCalled()
  expect(hooks.command).not.toHaveBeenCalled()
})
it('hydrates a discovered session tempo once and preserves later user drafts', async () => {
  hooks.get.mockResolvedValueOnce({ ...running, bpm: 90 }).mockResolvedValueOnce({ ...running, bpm: 80, atBeats: 2 })
  const view = setup(); view.render(); hooks.effects[0](); await tick()
  const tempo = () => find(view.render(), props => props['aria-label'] === 'Tempo runtimeproef')
  expect(tempo().value).toBe('90')
  expect(text(view.render())).toContain('ShowstandAfspelen')
  tempo().onChange!({ target: { value: '95' } })
  view.button('Status ophalen').onClick!(); await tick()
  expect(tempo().value).toBe('95')
  expect(text(view.render())).toContain('80 BPM')
})
it('does not overwrite a tempo edit made before initial status discovery completes', async () => {
  let resolve!: (value: unknown) => void
  hooks.get.mockImplementation(() => new Promise(done => { resolve = done }))
  const view = setup(); view.render(); hooks.effects[0]()
  find(view.render(), props => props['aria-label'] === 'Tempo runtimeproef').onChange!({ target: { value: '105' } })
  resolve({ ...running, bpm: 90 }); await tick()
  expect(find(view.render(), props => props['aria-label'] === 'Tempo runtimeproef').value).toBe('105')
})
it('starts explicitly, preserves snapshot identity, and keeps stop available with dirty patch and bad tempo', async () => {
  hooks.get.mockResolvedValue(idle); hooks.start.mockResolvedValue(running); hooks.command.mockResolvedValue({ ...running, status: 'stopped' })
  const view = setup(); view.render(); hooks.effects[0](); await tick()
  view.button('Start opgeslagen snapshot').onClick!(); await tick()
  expect(hooks.start.mock.calls[0].slice(0, 3)).toEqual([initialShow, initialShow.activeLookId, 120])
  view.change({ ...initialShow, name: 'Edited snapshot' }); view.dirty()
  find(view.render(), props => props['aria-label'] === 'Tempo runtimeproef').onChange!({ target: { value: '' } })
  expect(text(view.render())).toContain('runtime gebruikt nog de eerdere snapshot')
  expect(view.button('Stop runtimeproef').disabled).toBe(false)
  view.button('Stop runtimeproef').onClick!(); await tick()
  expect(hooks.command.mock.calls[0].slice(0, 2)).toEqual(['session', { command: 'stop' }])
  expect(text(view.render())).toContain('Runtime: gestopt')
})
it('does not retry a conflicting command and reads the actual session instead', async () => {
  hooks.get.mockResolvedValueOnce(running).mockResolvedValueOnce({ ...running, sessionId: 'new-session', lookId: 'other-look' })
  hooks.command.mockRejectedValue(new PlaybackConflict('Session changed'))
  const view = setup(); view.render(); hooks.effects[0](); await tick()
  view.button('Blackout').onClick!(); await tick(); await tick()
  expect(hooks.command).toHaveBeenCalledOnce()
  expect(hooks.get).toHaveBeenCalledTimes(2)
  expect(text(view.render())).toContain('other-look')
})
it('ignores a superseded command reply after stop', async () => {
  let resolve!: (value: unknown) => void
  hooks.get.mockResolvedValue(running)
  hooks.command.mockImplementationOnce(() => new Promise(done => { resolve = done })).mockResolvedValueOnce({ ...running, status: 'stopped' })
  const view = setup(); view.render(); hooks.effects[0](); await tick()
  view.button('Blackout').onClick!()
  view.button('Stop runtimeproef').onClick!(); await tick()
  resolve({ ...running, mode: 'blackout' }); await tick()
  expect(text(view.render())).toContain('Runtime: gestopt')
  expect((hooks.command.mock.calls[0][2] as AbortSignal).aborted).toBe(true)
})

it('polls only while expanded and suspends automatic requests for an old runtime', async () => {
  vi.useFakeTimers()
  hooks.get.mockResolvedValueOnce(idle).mockRejectedValue(new PlaybackUnavailable('Old runtime'))
  const view = setup(); view.render(); const unmount = hooks.effects[0]() as () => void; hooks.effects[1]()
  await tick(); await vi.advanceTimersByTimeAsync(1000)
  expect(hooks.get).toHaveBeenCalledOnce()
  view.render().props.onToggle({ currentTarget: { open: true } })
  view.render(); const close = hooks.effects[1]() as () => void
  await vi.advanceTimersByTimeAsync(2500)
  expect(hooks.get).toHaveBeenCalledTimes(2)
  expect(text(view.render())).toContain('Old runtime')
  close(); unmount()
  expect(hooks.command).not.toHaveBeenCalled()
})
