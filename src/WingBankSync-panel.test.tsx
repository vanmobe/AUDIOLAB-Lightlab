import { Children, isValidElement, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WingBankSync } from './WingBankSync'
import { initialShow } from './seed'

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial
    return [hooks.values[index], (next: unknown) => { hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next }]
  },
}))
interface Props { children?: ReactNode; open?: boolean; onClose?: () => void; onClick?: () => void; onBusy?: (value: boolean) => void; onUncertain?: (value: boolean) => void; closeDisabled?: boolean }
function nodes(node: ReactNode): Props[] { return Children.toArray(node).flatMap(child => isValidElement<Props>(child) ? [child.props, ...nodes(child.props.children)] : []) }
function content(node: ReactNode): string { return Children.toArray(node).map(child => isValidElement<Props>(child) ? content(child.props.children) : String(child)).join('') }
beforeEach(() => { hooks.values = []; hooks.cursor = 0; vi.stubGlobal('fetch', vi.fn()) })
afterEach(() => vi.unstubAllGlobals())

it('keeps sync actions mounted and blocks closing while requests are in flight', () => {
  const render = () => { hooks.cursor = 0; return WingBankSync({ show: initialShow, initialBank: 3 }) }
  const panel = () => nodes(render()).find(props => props.onClose)!
  const actions = () => nodes(render()).find(props => props.onBusy)!
  expect(panel().open).toBe(false)
  nodes(render()).find(props => props.onClick)!.onClick!()
  expect(panel().open).toBe(true)
  actions().onBusy!(true)
  expect(panel().closeDisabled).toBe(true)
  panel().onClose!()
  expect(panel().open).toBe(true)
  actions().onBusy!(false)
  actions().onUncertain!(true)
  panel().onClose!()
  expect(panel().open).toBe(false)
  expect(actions()).toBeDefined()
  expect(content(render())).toContain('Controle nodig')
  nodes(render()).find(props => props.onClick)!.onClick!()
  expect(content(render())).toContain('Een eerdere verzending is niet volledig bevestigd')
  expect(fetch).not.toHaveBeenCalled()
})
