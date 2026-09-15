import { Children, isValidElement, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LocalRuntimePanel } from './LocalRuntimePanel'

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => unknown)[], request: vi.fn() }))
vi.mock('./local-runtime-client', () => ({ requestLocalRuntime: hooks.request }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const index = hooks.cursor++; if (!(index in hooks.values)) hooks.values[index] = initial; return [hooks.values[index], (next: unknown) => { hooks.values[index] = next }] },
  useRef: (initial: unknown) => { const index = hooks.cursor++; if (!(index in hooks.values)) hooks.values[index] = { current: initial }; return hooks.values[index] },
  useEffect: (effect: () => unknown) => { hooks.effects.push(effect) },
}))
interface Props { children?: ReactNode; disabled?: boolean; onClick?: () => void }
const text = (node: ReactNode): string => Children.toArray(node).map(child => isValidElement<Props>(child) ? text(child.props.children) : String(child)).join('')
function nodes(node: ReactNode): Props[] { return Children.toArray(node).flatMap(child => isValidElement<Props>(child) ? [child.props, ...nodes(child.props.children)] : []) }
const stopped = { version: 1, state: 'stopped', canStart: true, canStop: false, message: 'Gestopt.', logs: [] }
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
beforeEach(() => { vi.useFakeTimers(); hooks.values = []; hooks.cursor = 0; hooks.effects = []; hooks.request.mockReset() })
afterEach(() => { vi.useRealTimers() })
function setup() {
  const render = () => { hooks.cursor = 0; hooks.effects = []; return LocalRuntimePanel() }
  const button = (label: string) => nodes(render()).find(props => props.onClick && text(props.children) === label)!
  render(); const unmount = hooks.effects[0]() as () => void
  const stopPolling = hooks.effects[1]() as () => void
  return { render, button, cleanup: () => { stopPolling(); unmount() } }
}
it('discovers read-only and starts only after an explicit click, without duplicate requests', async () => {
  hooks.request.mockResolvedValue(stopped)
  const view = setup(); await flush()
  expect(hooks.request.mock.calls.map(call => call[0])).toEqual(['status'])
  expect(view.button('Start runtime').disabled).toBe(false)
  expect(view.button('Stop runtime').disabled).toBe(true)
  expect(view.button('Opnieuw proberen')).toBeUndefined()
  expect(text(view.render())).toContain('Probleem oplossen')
  hooks.request.mockResolvedValue({ ...stopped, state: 'starting', canStart: false })
  view.button('Start runtime').onClick!(); view.button('Start runtime').onClick!(); await flush()
  expect(hooks.request.mock.calls.map(call => call[0])).toEqual(['status', 'start'])
  expect(text(view.render())).toContain('Starten…')
  expect(view.button('Start runtime').disabled).toBe(true)
  view.cleanup()
})
it('stops an owned stoppable runtime only after an explicit click', async () => {
  hooks.request.mockResolvedValue({ ...stopped, state: 'running', canStart: false, canStop: true })
  const view = setup(); await flush()
  expect(view.button('Stop runtime').disabled).toBe(false)
  hooks.request.mockResolvedValue({ ...stopped, stopping: true })
  view.button('Stop runtime').onClick!(); await flush()
  expect(hooks.request.mock.calls.map(call => call[0])).toEqual(['status', 'stop'])
  expect(text(view.render())).toContain('Stoppen…')
  expect(view.button('Stop runtime').disabled).toBe(true)
  view.cleanup()
})
it('blocks stop for an external runtime, including direct handler invocation', async () => {
  hooks.request.mockResolvedValue({ ...stopped, state: 'external', canStart: false, canStop: false })
  const view = setup(); await flush()
  expect(view.button('Stop runtime').disabled).toBe(true)
  view.button('Stop runtime').onClick!(); await flush()
  expect(hooks.request.mock.calls.map(call => call[0])).toEqual(['status'])
  expect(text(view.render())).toContain('Actief buiten deze starter')
  view.cleanup()
})
it('marks stale status and blocks start after a failed check', async () => {
  hooks.request.mockResolvedValue(stopped)
  const view = setup(); await flush()
  hooks.request.mockRejectedValue(new Error('Open de webapp opnieuw met de Lightlab-starter.'))
  await vi.advanceTimersByTimeAsync(5000); await flush()
  expect(text(view.render())).toContain('Status onbekend')
  expect(text(view.render())).toContain('Laatst ontvangen berichten')
  expect(view.button('Start runtime').disabled).toBe(true)
  view.button('Start runtime').onClick!(); await flush()
  expect(hooks.request.mock.calls.map(call => call[0])).toEqual(['status', 'status'])
  hooks.request.mockResolvedValue(stopped)
  view.button('Opnieuw proberen').onClick!(); await flush()
  expect(view.button('Opnieuw proberen')).toBeUndefined()
  expect(view.button('Start runtime').disabled).toBe(false)
  view.cleanup()
})
it('aborts discovery and ignores late answers after unmount without stopping', async () => {
  let resolve!: (value: unknown) => void
  hooks.request.mockImplementation(() => new Promise(done => { resolve = done }))
  const view = setup(); view.cleanup()
  expect(hooks.request.mock.calls[0][1].aborted).toBe(true)
  resolve(stopped); await flush()
  expect(text(view.render())).toContain('Controleren…')
  expect(hooks.request.mock.calls.map(call => call[0])).toEqual(['status'])
})
