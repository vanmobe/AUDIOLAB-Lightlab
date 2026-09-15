import { Children, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LiveControlSurface, liveBindingAvailable } from './LiveControlSurface'
import { initialShow } from './seed'
import type { ControlBinding } from './domain'

const hooks = vi.hoisted(() => ({ bank: 1 }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useState: () => [hooks.bank, (value: number) => { hooks.bank = value }] }))
interface NodeProps { children?: ReactNode; 'aria-label'?: string; 'aria-pressed'?: boolean; disabled?: boolean; value?: number; onClick?: () => void; onChange?: (event: { target: { value: string } }) => void }
function find(node: ReactNode, label: string): NodeProps {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<NodeProps>(child)) continue
    if (child.props['aria-label'] === label) return child.props
    try { return find(child.props.children, label) } catch { /* search siblings */ }
  }
  throw new Error(`Missing ${label}`)
}
function session() {
  hooks.bank = 1
  const show = structuredClone(initialShow)
  show.controlSurface.bindings = [
    { id: 'a', label: 'Look', action: 'look', targetId: show.looks[0].id, slot: { bank: 1, kind: 'button', index: 1 } },
    { id: 'b', label: 'Donker', action: 'mode', targetId: 'blackout', slot: { bank: 1, kind: 'button', index: 2 } },
    { id: 'c', label: 'Kleur', action: 'color-lock', targetId: show.colorProfiles[0].id, slot: { bank: 1, kind: 'button', index: 3 } },
    { id: 'd', label: 'Volg Look', action: 'color-lock', slot: { bank: 1, kind: 'button', index: 4 } },
    { id: 'e', label: 'Wash', action: 'group-intensity', targetId: show.groups[0].id, slot: { bank: 1, kind: 'rotary', index: 1 } },
  ]
  const props = { show, state: { mode: 'automation' as const, activeLookId: show.looks[0].id }, modified: false, linkedGroups: [], onLook: vi.fn(), onMode: vi.fn(), onColor: vi.fn(), onIntensity: vi.fn(), onConfigure: vi.fn() }
  return { props, render: () => LiveControlSurface(props) }
}
describe('Live WING surface', () => {
  it('dispatches assigned actions without changing assignments or inventing mappings', () => {
    const view = session(), before = structuredClone(view.props.show)
    find(view.render(), 'Live knop 1: Look').onClick!()
    find(view.render(), 'Live knop 2: Donker').onClick!()
    find(view.render(), 'Live knop 3: Kleur').onClick!()
    find(view.render(), 'Live knop 4: Volg Look').onClick!()
    expect(view.props.onLook).toHaveBeenCalledWith(before.looks[0].id)
    expect(view.props.onMode).toHaveBeenCalledWith('blackout')
    expect(view.props.onColor.mock.calls).toEqual([[before.colorProfiles[0].id], [undefined]])
    expect(view.props.show).toEqual(before)
    expect(find(view.render(), 'Live knop 8: Niet toegewezen').disabled).toBe(true)
  })
  it('uses stored master values and dispatches normalized rotary levels including zero', () => {
    const view = session()
    view.props.show.groups[0].intensity = .37
    const rotary = find(view.render(), 'Live draaiknop 1: Wash')
    expect(rotary.value).toBe(37)
    rotary.onChange!({ target: { value: '0' } })
    rotary.onChange!({ target: { value: '100' } })
    expect(view.props.onIntensity.mock.calls).toEqual([[view.props.show.groups[0].id, 0], [view.props.show.groups[0].id, 1]])
  })
  it('changes banks without executing actions, respects Compact capacity and modified Look status', () => {
    const view = session()
    expect(find(view.render(), 'Live knop 1: Look')['aria-pressed']).toBe(true)
    view.props.modified = true
    expect(find(view.render(), 'Live knop 1: Look')['aria-pressed']).toBe(false)
    find(view.render(), 'Live WING bank').onChange!({ target: { value: '16' } })
    expect(renderToStaticMarkup(view.render())).toContain('Deze bank is leeg')
    expect(view.props.onLook).not.toHaveBeenCalled()
    view.props.show.controlSurface.profileId = 'wing-compact'
    const html = renderToStaticMarkup(view.render())
    expect(html).toContain('Live knop 16: Niet toegewezen')
    expect(html).not.toContain('Live draaiknop')
    expect(html).toContain('geen verbinding of synchronisatie')
  })
  it('rejects stale references, incompatible and hidden slots and unsupported legacy actions', () => {
    const { props } = session()
    const binding = props.show.controlSurface.bindings[0]
    expect(liveBindingAvailable(props.show, binding)).toBe(true)
    const invalid: ControlBinding[] = [
      { ...binding, targetId: 'missing' }, { ...binding, slot: undefined },
      { ...binding, slot: { bank: 17, kind: 'button', index: 1 } },
      { ...binding, slot: { bank: 1, kind: 'rotary', index: 1 } },
      { ...binding, action: 'tap-tempo' }, { ...binding, action: 'mode', targetId: 'toString' },
    ]
    invalid.forEach(item => expect(liveBindingAvailable(props.show, item)).toBe(false))
    props.show.controlSurface.profileId = 'unknown'
    expect(liveBindingAvailable(props.show, binding)).toBe(false)
  })
})
