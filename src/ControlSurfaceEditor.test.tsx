import { Children, isValidElement, type ReactNode, type SetStateAction } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ControlSurfaceEditor } from './ControlSurfaceEditor'
import { assignControlBinding, bindingAtSlot } from './control-surface'
import { initialShow } from './seed'
import type { ShowDocument } from './domain'

// A minimal stateful hook harness invokes real handlers across explicit rerenders.
// Browser QA remains responsible for native drag, focus and layout behavior.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
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
  'aria-pressed'?: boolean
  className?: string
  disabled?: boolean
  title?: string
  open?: boolean
  onClose?: () => void
  initialBank?: number
  hideCloseButton?: boolean
  defaultValue?: unknown
  onClick?: () => void
  onChange?: (event: { target: { value: string } }) => void
  onBlur?: (event: { target: { value: string } }) => void
  onDragStart?: (event: {
    dataTransfer: { setData: (type: string, value: string) => void; effectAllowed: string }
  }) => void
  onDragOver?: (event: {
    preventDefault: () => void
    dataTransfer: { types: string[]; effectAllowed: string; dropEffect: string }
  }) => void
  onDrop?: (event: { preventDefault: () => void; dataTransfer: { getData: (type: string) => string } }) => void
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
function session(start: ShowDocument = initialShow) {
  hooks.values = []
  hooks.cursor = 0
  let show = structuredClone(start)
  const preview = vi.fn()
  const changed = vi.fn((update: SetStateAction<ShowDocument>) => {
    show = typeof update === 'function' ? update(show) : update
  })
  const render = () => {
    hooks.cursor = 0
    return ControlSurfaceEditor({ show, onChange: changed, onPreviewLook: preview })
  }
  const label = (name: string) => {
    const item = find(render(), (props) => props['aria-label'] === name)
    if (!item) throw new Error(`Missing labeled control: ${name}`)
    return item
  }
  const button = (name: string) => {
    const item = find(render(), (props) => !!props.onClick && text(props.children) === name)
    if (!item) throw new Error(`Missing button: ${name}`)
    return item
  }
  const source = (name: string) => {
    const item = find(
      render(),
      (props) => props.className === 'surface-source' && text(props.children).startsWith(name),
    )
    if (!item) throw new Error(`Missing source: ${name}`)
    return item
  }
  return {
    render,
    label,
    button,
    source,
    preview,
    changed,
    show: () => show,
    replace: (value: ShowDocument) => {
      show = value
    },
  }
}

describe('control surface editor workflow', () => {
  it('keeps the auto-fill draft mounted across closing and bank changes, resetting only for another profile', () => {
    const view = session()
    const editor = () =>
      find(view.render(), (props) => props.initialBank !== undefined && props.hideCloseButton === true)
    const panel = () => find(view.render(), (props) => props.title === 'Banken automatisch vullen')!
    expect(editor()).toBeUndefined()
    view.label('Bank 3 · 0 toegewezen').onClick!()
    view.button('Banken automatisch vullen').onClick!()
    expect(editor()?.initialBank).toBe(3)
    panel().onClose!()
    expect(editor()?.initialBank).toBe(3)
    view.label('Bank 5 · 0 toegewezen').onClick!()
    view.button('Banken automatisch vullen').onClick!()
    expect(editor()?.initialBank).toBe(3)
    panel().onClose!()
    view.label('Type bedieningspaneel').onChange!({ target: { value: 'wing-compact' } })
    expect(editor()).toBeUndefined()
    view.button('Banken automatisch vullen').onClick!()
    expect(editor()?.initialBank).toBe(1)
    expect(view.preview).not.toHaveBeenCalled()
  })
  it('opens auto fill in a side panel without changing assignments or retaining audio settings here', () => {
    const view = session()
    const panel = () => find(view.render(), (props) => props.title === 'Banken automatisch vullen')!
    expect(panel().open).toBe(false)
    view.button('Banken automatisch vullen').onClick!()
    expect(panel().open).toBe(true)
    panel().onClose!()
    expect(panel().open).toBe(false)
    expect(view.changed).not.toHaveBeenCalled()
    expect(view.show().sync).toEqual(initialShow.sync)
    expect(text(view.render())).not.toContain('Audio & synchronisatie')
  })
  it('matches copy and move drop effects to the source drag permission', () => {
    const view = session()
    const payload = new Map<string, string>()
    const transfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      types: ['application/x-lightlab-control'],
      setData: (key: string, value: string) => {
        payload.set(key, value)
      },
    }
    view.source('Warm static').onDragStart!({ dataTransfer: transfer })
    expect(transfer.effectAllowed).toBe('copy')
    view.label('Knop 1: Niet toegewezen').onDragOver!({ preventDefault: vi.fn(), dataTransfer: transfer })
    expect(transfer.dropEffect).toBe('copy')
    view.label('Knop 1: Niet toegewezen').onDrop!({
      preventDefault: vi.fn(),
      dataTransfer: { getData: (key) => payload.get(key) ?? '' },
    })
    view.label('Knop 1: Warm static').onDragStart!({ dataTransfer: transfer })
    expect(transfer.effectAllowed).toBe('move')
    view.label('Knop 2: Niet toegewezen').onDragOver!({ preventDefault: vi.fn(), dataTransfer: transfer })
    expect(transfer.dropEffect).toBe('move')
    view.label('Knop 2: Niet toegewezen').onDrop!({
      preventDefault: vi.fn(),
      dataTransfer: { getData: (key) => payload.get(key) ?? '' },
    })
    expect(bindingAtSlot(view.show().controlSurface, { bank: 1, kind: 'button', index: 1 })).toBeUndefined()
    expect(bindingAtSlot(view.show().controlSurface, { bank: 1, kind: 'button', index: 2 })?.targetId).toBe(
      'warm-static',
    )
    expect(view.preview).not.toHaveBeenCalled()
  })

  it('moves or swaps using the click/keyboard flow without native drag', () => {
    const view = session()
    view.source('Warm static').onClick!()
    view.label('Knop 1: Niet toegewezen').onClick!()
    view.source('Neon chorus').onClick!()
    view.label('Knop 2: Niet toegewezen').onClick!()
    view.label('Knop 1: Warm static').onClick!()
    view.button('Verplaats / verwissel').onClick!()
    view.label('Knop 2: Neon chorus').onClick!()
    expect(bindingAtSlot(view.show().controlSurface, { bank: 1, kind: 'button', index: 1 })?.targetId).toBe(
      'neon-chorus',
    )
    expect(bindingAtSlot(view.show().controlSurface, { bank: 1, kind: 'button', index: 2 })?.targetId).toBe(
      'warm-static',
    )
    expect(view.preview).not.toHaveBeenCalled()
  })

  it('restores a changed bank name with undo', () => {
    const view = session()
    view.label('Banknaam').onBlur!({ target: { value: 'Refrein' } })
    expect(view.show().controlSurface.bankNames?.['1']).toBe('Refrein')
    expect(view.label('Banknaam').defaultValue).toBe('Refrein')
    view.button('Ongedaan maken').onClick!()
    expect(view.label('Banknaam').defaultValue).toBe('')
    expect(view.show().controlSurface.bankNames).toBeUndefined()
    expect(view.preview).not.toHaveBeenCalled()
  })

  it('releases an unsupported old slot before assigning to an occupied Compact button', () => {
    let start = assignControlBinding(initialShow, initialShow.controlSurface.bindings[0], {
      bank: 16,
      kind: 'button',
      index: 8,
    })
    start = assignControlBinding(start, initialShow.controlSurface.bindings[1], { bank: 1, kind: 'button', index: 1 })
    start.controlSurface.profileId = 'wing-compact'
    const view = session(start)
    view.label('Soort functie').onChange!({ target: { value: 'unplaced' } })
    view.source('Ambient').onClick!()
    view.button('Maak oude positie vrij').onClick!()
    expect(bindingAtSlot(view.show().controlSurface, { bank: 16, kind: 'button', index: 8 })).toBeUndefined()
    view.label('Knop 1: Chorus').onClick!()
    expect(bindingAtSlot(view.show().controlSurface, { bank: 1, kind: 'button', index: 1 })?.id).toBe(
      initialShow.controlSurface.bindings[0].id,
    )
    expect(
      view.show().controlSurface.bindings.find((binding) => binding.id === initialShow.controlSurface.bindings[1].id)
        ?.slot,
    ).toBeUndefined()
    expect(view.preview).not.toHaveBeenCalled()
  })

  it('deletes only an unplaced binding and supports undo without deleting its Look', () => {
    const view = session()
    view.label('Soort functie').onChange!({ target: { value: 'unplaced' } })
    view.source('Ambient').onClick!()
    view.button('Verwijder ongeplaatste toewijzing').onClick!()
    expect(
      view.show().controlSurface.bindings.some((binding) => binding.id === initialShow.controlSurface.bindings[0].id),
    ).toBe(false)
    expect(view.show().looks).toEqual(initialShow.looks)
    view.button('Ongedaan maken').onClick!()
    expect(view.show().controlSurface.bindings).toEqual(initialShow.controlSurface.bindings)
    expect(view.preview).not.toHaveBeenCalled()
  })

  it('renders banked CC controls and states that setup does not send hardware commands', () => {
    const view = session()
    const html = renderToStaticMarkup(view.render())
    expect(html).toContain('Bank 16 · 0 toegewezen')
    expect(html).toContain('Knop 8: Niet toegewezen')
    expect(html).toContain('Draaiknop 4: Niet toegewezen')
    expect(html).toContain('geen verbinding met de tafel')
    expect(html).toContain('niet naar WING verstuurd')
    expect(html).toContain('Niet geplaatst (4)')
    expect(view.changed).not.toHaveBeenCalled()
    expect(view.preview).not.toHaveBeenCalled()
  })

  it('clicks a source then assigns a button, and previews only through the explicit action', () => {
    const view = session()
    view.source('Warm static').onClick!()
    expect(view.changed).not.toHaveBeenCalled()
    view.label('Knop 1: Niet toegewezen').onClick!()
    expect(bindingAtSlot(view.show().controlSurface, { bank: 1, kind: 'button', index: 1 })).toMatchObject({
      action: 'look',
      targetId: 'warm-static',
    })
    expect(view.preview).not.toHaveBeenCalled()
    view.label('Knop 1: Warm static').onClick!()
    expect(view.preview).not.toHaveBeenCalled()
    view.button('Bekijk Look in repetitie').onClick!()
    expect(view.preview).toHaveBeenCalledExactlyOnceWith('warm-static')
  })

  it('rejects a Look on a rotary while retaining the pending source for a valid target', () => {
    const view = session()
    view.source('Warm static').onClick!()
    view.label('Draaiknop 1: Niet toegewezen').onClick!()
    expect(view.changed).not.toHaveBeenCalled()
    expect(text(view.render())).toContain('Looks, kleuren en showfuncties horen op knoppen')
    view.label('Knop 2: Niet toegewezen').onClick!()
    expect(bindingAtSlot(view.show().controlSurface, { bank: 1, kind: 'button', index: 2 })?.targetId).toBe(
      'warm-static',
    )
    expect(view.preview).not.toHaveBeenCalled()
  })

  it('assigns a group only to a rotary without changing the group master', () => {
    const view = session()
    view.label('Soort functie').onChange!({ target: { value: 'groups' } })
    view.source('Wash').onClick!()
    view.label('Knop 1: Niet toegewezen').onClick!()
    expect(view.changed).not.toHaveBeenCalled()
    expect(text(view.render())).toContain('Een groepsmaster hoort op een draaiknop')
    view.label('Draaiknop 4: Niet toegewezen').onClick!()
    expect(bindingAtSlot(view.show().controlSurface, { bank: 1, kind: 'rotary', index: 4 })).toMatchObject({
      action: 'group-intensity',
      targetId: 'wash',
    })
    expect(view.show().groups).toEqual(initialShow.groups)
    expect(view.preview).not.toHaveBeenCalled()
  })

  it('keeps source selection through a bank switch and places only in that bank', () => {
    const view = session()
    view.source('Neon chorus').onClick!()
    view.label('Bank 16 · 0 toegewezen').onClick!()
    expect(view.changed).not.toHaveBeenCalled()
    view.label('Knop 8: Niet toegewezen').onClick!()
    expect(bindingAtSlot(view.show().controlSurface, { bank: 16, kind: 'button', index: 8 })?.targetId).toBe(
      'neon-chorus',
    )
    expect(bindingAtSlot(view.show().controlSurface, { bank: 1, kind: 'button', index: 8 })).toBeUndefined()
    view.label('Bank 1 · 0 toegewezen').onClick!()
    expect(view.label('Knop 8: Niet toegewezen')).toBeDefined()
    expect(view.preview).not.toHaveBeenCalled()
  })

  it('clears a slot recoverably and undo restores assignment without reverting unrelated edits', () => {
    const view = session()
    view.source('Warm static').onClick!()
    view.label('Knop 1: Niet toegewezen').onClick!()
    const id = bindingAtSlot(view.show().controlSurface, { bank: 1, kind: 'button', index: 1 })!.id
    view.button('Maak positie vrij').onClick!()
    expect(view.show().controlSurface.bindings.find((binding) => binding.id === id)?.slot).toBeUndefined()
    view.replace({ ...view.show(), name: 'A later show edit' })
    view.button('Ongedaan maken').onClick!()
    expect(bindingAtSlot(view.show().controlSurface, { bank: 1, kind: 'button', index: 1 })?.id).toBe(id)
    expect(view.show().name).toBe('A later show edit')
    expect(view.preview).not.toHaveBeenCalled()
  })

  it('switches to Compact while preserving unsupported Rack slots in the unplaced library', () => {
    const start = assignControlBinding(initialShow, initialShow.controlSurface.bindings[0], {
      bank: 16,
      kind: 'button',
      index: 8,
    })
    const view = session(start)
    view.label('Type bedieningspaneel').onChange!({ target: { value: 'wing-compact' } })
    expect(bindingAtSlot(view.show().controlSurface, { bank: 16, kind: 'button', index: 8 })?.id).toBe(
      initialShow.controlSurface.bindings[0].id,
    )
    const html = renderToStaticMarkup(view.render())
    expect(html).toContain('Knop 16: Niet toegewezen')
    expect(html).not.toContain('Draaiknop 1:')
    view.label('Soort functie').onChange!({ target: { value: 'unplaced' } })
    expect(text(view.render())).toContain('Buiten dit profiel · bank 16, knop 8')
    view.source('Ambient').onClick!()
    view.label('Knop 16: Niet toegewezen').onClick!()
    expect(bindingAtSlot(view.show().controlSurface, { bank: 1, kind: 'button', index: 16 })?.id).toBe(
      initialShow.controlSurface.bindings[0].id,
    )
    expect(view.preview).not.toHaveBeenCalled()
  })

  it('accepts drag keys only from current show data, not arbitrary serialized controls', () => {
    const view = session()
    view.label('Knop 1: Niet toegewezen').onDrop!({
      preventDefault: vi.fn(),
      dataTransfer: { getData: () => '{"action":"mode","targetId":"blackout"}' },
    })
    expect(view.changed).not.toHaveBeenCalled()
    expect(text(view.render())).toContain('Kies eerst een beschikbare functie')
    view.label('Knop 1: Niet toegewezen').onDrop!({
      preventDefault: vi.fn(),
      dataTransfer: { getData: () => 'look:warm-static' },
    })
    expect(bindingAtSlot(view.show().controlSurface, { bank: 1, kind: 'button', index: 1 })?.targetId).toBe(
      'warm-static',
    )
    expect(view.preview).not.toHaveBeenCalled()
  })
})
