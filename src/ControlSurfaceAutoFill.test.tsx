import { Children, isValidElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ControlSurfaceAutoFill } from './ControlSurfaceAutoFill'
import { initialShow } from './seed'
import type { ControlSurfaceLayout, ShowDocument } from './domain'

// Real event handlers across rerenders; browser QA covers layout/focus and parent undo integration.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (factory: () => unknown) => factory(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial
    return [
      hooks.values[index],
      (value: unknown) => {
        hooks.values[index] = typeof value === 'function' ? value(hooks.values[index]) : value
      },
    ]
  },
}))
interface Props {
  children?: ReactNode
  'aria-label'?: string
  disabled?: boolean
  onClick?: () => void
  onChange?: (event: { target: { value: string; checked: boolean } }) => void
}
function text(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => (isValidElement<Props>(child) ? text(child.props.children) : String(child)))
    .join('')
}
function find(node: ReactNode, match: (props: Props) => boolean): Props | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Props>(child)) continue
    if (match(child.props)) return child.props
    const nested = find(child.props.children, match)
    if (nested) return nested
  }
}
function session(profileId = 'wing-rack') {
  hooks.values = []
  hooks.cursor = 0
  let show: ShowDocument = structuredClone(initialShow)
  show.controlSurface = { profileId, bindings: [] }
  const apply = vi.fn((_surface: ControlSurfaceLayout, _firstBank: number) => true),
    close = vi.fn()
  const render = () => {
    hooks.cursor = 0
    return ControlSurfaceAutoFill({ show, initialBank: 1, onApply: apply, onClose: close })
  }
  const button = (name: string) => find(render(), (p) => !!p.onClick && text(p.children) === name)
  const control = (name: string) => find(render(), (p) => p['aria-label'] === name)!
  return {
    render,
    button,
    control,
    apply,
    close,
    changeShow: () => {
      show = { ...show, name: 'Modified' }
    },
  }
}
describe('automatic bank fill confirmation flow', () => {
  it('previews without applying and applies only after explicit acceptance', () => {
    const view = session()
    view.button('Bekijk bankindeling')!.onClick!()
    expect(view.apply).not.toHaveBeenCalled()
    expect(text(view.render())).toContain('Voorstel · nog niet toegepast')
    view.button('Pas bankindeling toe')!.onClick!()
    expect(view.apply).toHaveBeenCalledOnce()
    expect(view.apply.mock.calls[0][0]).toMatchObject({ profileId: 'wing-rack' })
    expect(view.close).toHaveBeenCalledOnce()
  })
  it('clears the proposal when bank selection or rotary choices change', () => {
    const view = session()
    view.button('Bekijk bankindeling')!.onClick!()
    view.control('Vul bank 3').onChange!({ target: { checked: true, value: '' } })
    expect(view.button('Pas bankindeling toe')).toBeUndefined()
    view.control('Vaste groep draaiknop 1').onChange!({ target: { value: 'wash', checked: false } })
    view.button('Bekijk bankindeling')!.onClick!()
    view.button('Pas bankindeling toe')!.onClick!()
    expect(view.apply.mock.calls[0][0]).toMatchObject({
      bindings: expect.arrayContaining([
        expect.objectContaining({
          action: 'group-intensity',
          targetId: 'wash',
          slot: { bank: 1, kind: 'rotary', index: 1 },
        }),
        expect.objectContaining({
          action: 'group-intensity',
          targetId: 'wash',
          slot: { bank: 3, kind: 'rotary', index: 1 },
        }),
      ]),
    })
  })
  it('blocks stale proposals even if the disabled acceptance handler is invoked', () => {
    const view = session()
    view.button('Bekijk bankindeling')!.onClick!()
    view.changeShow()
    const apply = view.button('Pas bankindeling toe')!
    expect(apply.disabled).toBe(true)
    apply.onClick!()
    expect(view.apply).not.toHaveBeenCalled()
    expect(text(view.render())).toContain('De show is intussen gewijzigd')
  })
  it('does not offer rotary controls for Compact, and cancellation never applies', () => {
    const view = session('wing-compact')
    expect(view.control('Vaste groep draaiknop 1')).toBeUndefined()
    expect(text(view.render())).toContain('geen draaiknoppen')
    view.button('Sluiten')!.onClick!()
    expect(view.apply).not.toHaveBeenCalled()
    expect(view.close).toHaveBeenCalledOnce()
  })
  it('disables proposal creation without a selected bank', () => {
    const view = session()
    view.button('Geen')!.onClick!()
    expect(view.button('Bekijk bankindeling')!.disabled).toBe(true)
    expect(view.apply).not.toHaveBeenCalled()
  })
})
