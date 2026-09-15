import { Children, isValidElement, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WingBankSync } from './WingBankSync'
import { initialShow } from './seed'

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, request: vi.fn() }))
vi.mock('./wing-sync-client', async (original) => ({
  ...(await original<typeof import('./wing-sync-client')>()),
  requestWing: hooks.request,
  parseWingPlan: (value: unknown) => value,
  parseWingApply: (value: unknown) => value,
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial
    return [
      hooks.values[index],
      (next: unknown) => {
        hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next
      },
    ]
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = { current: initial }
    return hooks.values[index]
  },
  useEffect: () => {},
}))
interface Props {
  children?: ReactNode
  disabled?: boolean
  onClick?: () => void
  onChange?: (event: { target: { checked: boolean } }) => void
  onBusy?: (busy: boolean) => void
  onUncertain?: (uncertain: boolean) => void
}
function elements(node: ReactNode): { type: unknown; props: Props }[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<Props>(child) ? [child, ...elements(child.props.children)] : [],
  )
}
function text(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => (isValidElement<Props>(child) ? text(child.props.children) : String(child)))
    .join('')
}
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}
const plan = {
  version: 1,
  planId: 'plan',
  address: '10.0.0.10',
  expiresAt: '2099-01-01T00:00:00Z',
  device: { name: 'WING', model: 'Full', firmware: '3.1' },
  warnings: [],
  changes: [{ bank: 1, kind: 'button', index: 1, label: 'Look', before: { name: 'Before' }, after: { name: 'After' } }],
}
beforeEach(() => {
  hooks.values = []
  hooks.cursor = 0
  hooks.request.mockReset()
  vi.stubGlobal('sessionStorage', { setItem: vi.fn(), removeItem: vi.fn(), getItem: vi.fn() })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
function setup() {
  // Exercise the real action component through its parent seam, without mounting WebGL or a browser.
  const show = structuredClone(initialShow)
  show.controlSurface.bindings[0].slot = { bank: 1, kind: 'button', index: 1 }
  const child = elements(WingBankSync({ show, initialBank: 1 })).find((element) => element.props.onBusy)!
  hooks.values = []
  const render = () => {
    hooks.cursor = 0
    return (child.type as (props: Props) => ReactNode)({ ...child.props, onBusy: vi.fn(), onUncertain: vi.fn() })
  }
  const button = (label: string) =>
    elements(render()).find((element) => element.props.onClick && text(element.props.children) === label)!.props
  return { render, button }
}
it('requires explicit confirmation but permits applying a valid plan without downloading a backup', async () => {
  hooks.request
    .mockResolvedValueOnce(plan)
    .mockResolvedValueOnce({ state: 'applied', verifiedSlots: 1, totalSlots: 1, error: null })
  const view = setup()
  view.button('Lees banken uit & vergelijk').onClick!()
  await flush()
  expect(view.button('Download back-up van huidige posities')).toBeDefined()
  expect(view.button('Verstuur bevestigde wijzigingen').disabled).toBe(true)
  view.button('Verstuur bevestigde wijzigingen').onClick!()
  await flush()
  expect(hooks.request.mock.calls.map((call) => call[0])).toEqual(['plan'])
  elements(view.render()).find((element) => element.props.onChange)!.props.onChange!({ target: { checked: true } })
  expect(view.button('Verstuur bevestigde wijzigingen').disabled).toBe(false)
  view.button('Verstuur bevestigde wijzigingen').onClick!()
  await flush()
  expect(hooks.request.mock.calls.map((call) => call[0])).toEqual(['plan', 'apply'])
  expect(hooks.request.mock.calls[1][1]).toEqual({ version: 1, planId: 'plan', confirm: true })
  expect(text(view.render())).toContain('Instellingen teruggelezen en bevestigd')
})
it('still rejects an expired confirmed plan without sending an apply', async () => {
  hooks.request.mockResolvedValue(plan)
  const view = setup()
  view.button('Lees banken uit & vergelijk').onClick!()
  await flush()
  elements(view.render()).find((element) => element.props.onChange)!.props.onChange!({ target: { checked: true } })
  // Protect expiry between the rendered confirmation and the actual click.
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(plan.expiresAt) + 1)
  view.button('Verstuur bevestigde wijzigingen').onClick!()
  await flush()
  expect(hooks.request.mock.calls.map((call) => call[0])).toEqual(['plan'])
})
