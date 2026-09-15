import { Children, isValidElement, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RuntimeOutputPanel } from './RuntimeOutputPanel'

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effect: undefined as undefined | (() => (() => void)) }))
const client = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }))
vi.mock('./playback-output-client', () => ({ getOutputStatus: client.read, setOutputState: client.write }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const index = hooks.cursor++; if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial; return [hooks.values[index], (value: unknown) => { hooks.values[index] = typeof value === 'function' ? value(hooks.values[index]) : value }] },
  useRef: (initial: unknown) => { const index = hooks.cursor++; if (!(index in hooks.values)) hooks.values[index] = { current: initial }; return hooks.values[index] },
  useEffect: (effect: () => (() => void)) => { hooks.effect = effect },
}))
interface Props { children?: ReactNode; disabled?: boolean; onClick?: () => Promise<void>; onChange?: (event: { target: { checked: boolean } }) => void }
const text = (node: ReactNode): string => Children.toArray(node).map(child => isValidElement<Props>(child) ? text(child.props.children) : String(child)).join('')
function find(node: ReactNode, predicate: (props: Props) => boolean): Props {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Props>(child)) continue
    if (predicate(child.props)) return child.props
    try { return find(child.props.children, predicate) } catch { /* search sibling */ }
  }
  throw new Error('Missing output control')
}
const status = { version: 1, sessionId: 'test', state: 'disarmed', routes: [{ universe: 1, protocol: 'sacn', host: '127.0.0.1' }], framesSent: 0, lastError: null, armError: null }
const render = () => { hooks.cursor = 0; return RuntimeOutputPanel({ sessionId: 'test', running: true }) }
const button = (name: string) => find(render(), props => !!props.onClick && text(props.children) === name)
let cleanup: (() => void) | undefined
beforeEach(async () => {
  vi.useFakeTimers(); hooks.values = []; hooks.cursor = 0
  client.read.mockReset().mockResolvedValue(status); client.write.mockReset().mockResolvedValue({ ...status, state: 'armed' })
  render(); cleanup = hooks.effect!(); await Promise.resolve(); await Promise.resolve()
})
afterEach(() => { cleanup?.(); vi.useRealTimers() })
it('reads on mount and arms only from an explicit click without a checkbox', async () => {
  expect(client.write).not.toHaveBeenCalled()
  expect(() => button('Controleer uitvoerstatus')).toThrow()
  expect(() => button('Opnieuw proberen')).toThrow()
  expect(button('DMX-uitvoer aan').disabled).toBe(false)
  expect(() => button('DMX-uitvoer uit')).toThrow()
  expect(() => find(render(), props => !!props.onChange)).toThrow()
  await button('DMX-uitvoer aan').onClick!()
  expect(client.write).toHaveBeenCalledWith('test', 'arm', true, expect.any(AbortSignal))
  expect(text(render())).toContain('Verzendt')
  expect(button('DMX-uitvoer uit').disabled).not.toBe(true)
  expect(() => button('DMX-uitvoer aan')).toThrow()
})
it('explains a stopped session even when its saved routes are valid', () => {
  hooks.cursor = 0
  const prepare = vi.fn()
  const view = RuntimeOutputPanel({ sessionId: 'test', running: false, onPrepare: prepare })
  expect(text(view)).toContain('Start eerst een livesessie')
  expect(find(view, props => !!props.onClick && text(props.children) === 'DMX-uitvoer aan').disabled).toBe(true)
  expect(client.write).not.toHaveBeenCalled()
  find(view, props => !!props.onClick && text(props.children) === 'Ga naar de livesessie').onClick!()
  expect(prepare).toHaveBeenCalledOnce()
  expect(client.write).not.toHaveBeenCalled()
})
it('allows deliberate arming after the session starts', async () => {
  hooks.cursor = 0
  RuntimeOutputPanel({ sessionId: 'test', running: false })
  expect(text(render())).not.toContain('Start eerst een livesessie')
  expect(button('DMX-uitvoer aan').disabled).toBe(false)
  await button('DMX-uitvoer aan').onClick!()
  expect(client.write).toHaveBeenCalledWith('test', 'arm', true, expect.any(AbortSignal))
})
it('keeps disarm available during an ambiguous arm and ignores its late response', async () => {
  let resolve!: (value: unknown) => void
  client.write.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const arming = button('DMX-uitvoer aan').onClick!()
  const emergency = button('DMX-uitvoer uit')
  expect(emergency.disabled).not.toBe(true)
  client.write.mockResolvedValue({ ...status, state: 'disarmed' })
  await emergency.onClick!()
  resolve({ ...status, state: 'armed' }); await arming
  expect(text(render())).not.toContain('Verzendt')
  expect(client.write.mock.calls[0][3].aborted).toBe(true)
})
it('marks connection loss unknown and does not stop on unmount', async () => {
  client.read.mockRejectedValue(new Error('Lost'))
  await vi.advanceTimersByTimeAsync(1000)
  expect(text(render())).toContain('Onbekend')
  expect(button('DMX-uitvoer aan').disabled).toBe(true)
  expect(button('DMX-uitvoer uit').disabled).not.toBe(true)
  expect(button('Opnieuw proberen').disabled).not.toBe(true)
  cleanup?.(); cleanup = undefined
  expect(client.write).not.toHaveBeenCalled()
})
it('blocks invalid and missing routes, including direct handler invocation', async () => {
  for (const invalid of [{ ...status, armError: 'Ongeldige patch' }, { ...status, routes: [] }]) {
    client.read.mockResolvedValue(invalid)
    await vi.advanceTimersByTimeAsync(1000)
    expect(button('DMX-uitvoer aan').disabled).toBe(true)
    await button('DMX-uitvoer aan').onClick!()
  }
  expect(client.write).not.toHaveBeenCalled()
})
