import { Children, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { BandProfileEditor } from './BandProfileEditor'
import { defaultBandProfile, type BandProfile } from './band-profile'

const hooks = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[] }))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = initial
    return [
      hooks.values[index],
      (next: unknown) => {
        hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next
      },
    ]
  },
}))
interface Props {
  children?: ReactNode
  'aria-label'?: string
  onChange?: (event: { target: { value: string } }) => void
  onClick?: () => void
  open?: boolean
  onToggle?: (event: { currentTarget: { open: boolean } }) => void
}
function words(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => (isValidElement<Props>(child) ? words(child.props.children) : String(child)))
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
function session(initial?: BandProfile, disabled = false) {
  hooks.values = []
  hooks.cursor = 0
  let value = initial ? structuredClone(initial) : undefined
  const changed = vi.fn((profile: BandProfile | undefined) => {
    value = profile
  })
  const render = () => {
    hooks.cursor = 0
    return BandProfileEditor({ value, onChange: changed, disabled })
  }
  return {
    render,
    changed,
    value: () => value,
    label: (name: string) => find(render(), (props) => props['aria-label'] === name)!,
    button: (name: string) => find(render(), (props) => !!props.onClick && words(props.children) === name)!,
  }
}

describe('band profile editor workflow', () => {
  it('opens an absent profile with automatic choices and no numerical preference inputs', () => {
    const view = session()
    expect(view.render().props.open).toBe(true)
    const html = renderToStaticMarkup(view.render())
    expect(html.match(/AI kiest/g)?.length).toBeGreaterThanOrEqual(4)
    expect(html).not.toContain('type="number"')
    expect(html).toContain('bestaande Looks, animaties en kleuren veranderen niet')
    expect(view.changed).not.toHaveBeenCalled()
    expect(view.value()).toBeUndefined()
  })
  it('keeps the profile open after typing its first character creates the stored value', () => {
    const view = session()
    view.label('Bandnaam').onChange!({ target: { value: 'B' } })
    expect(view.value()?.name).toBe('B')
    expect(view.render().props.open).toBe(true)
    view.label('Genres / muziekstijl').onChange!({ target: { value: 'Soul' } })
    view.label('Karakter van de show').onChange!({ target: { value: 'Warm en intiem' } })
    expect(view.value()).toMatchObject({ name: 'B', genres: 'Soul', character: 'Warm en intiem', energy: 'auto' })
  })
  it('preserves user expansion state while editing an existing profile', () => {
    const view = session({ ...defaultBandProfile, name: 'Existing' })
    expect(view.render().props.open).toBe(false)
    find(view.render(), (props) => !!props.onToggle)!.onToggle!({ currentTarget: { open: true } })
    view.label('Bandnaam').onChange!({ target: { value: 'New name' } })
    expect(view.render().props.open).toBe(true)
  })
  it('writes explicit qualitative choices and explains resulting new-output limits', () => {
    const view = session()
    for (const [label, value] of [
      ['Kleurgevoel', 'warm'],
      ['Energie', 'high'],
      ['Complexiteit', 'simple'],
      ['Bewegingstempo', 'slow'],
    ])
      view.label(label).onChange!({ target: { value } })
    expect(view.value()).toMatchObject({ colorMood: 'warm', energy: 'high', complexity: 'simple', motion: 'slow' })
    const html = renderToStaticMarkup(view.render())
    expect(html).toContain('Maximaal 2 stappen per nieuw patroon')
    expect(html).toContain('8–32 beats per ronde')
    expect(html).toContain('Energiek hoeft niet snel of donker te zijn')
  })
  it('adds colors only explicitly, caps them at four, and supports edits and removal', () => {
    const view = session()
    view.label('Nieuwe voorkeurskleur').onChange!({ target: { value: '#ff6600' } })
    expect(view.changed).not.toHaveBeenCalled()
    view.button('Voeg kleur toe').onClick!()
    expect(view.value()?.preferredColors).toEqual(['#ff6600'])
    view.label('Voorkeurskleur 1').onChange!({ target: { value: '#00ff88' } })
    expect(view.value()?.preferredColors).toEqual(['#00ff88'])
    for (let i = 0; i < 3; i++) view.button('Voeg kleur toe').onClick!()
    expect(view.value()?.preferredColors).toHaveLength(4)
    expect(view.button('Voeg kleur toe')).toBeUndefined()
    view.label('Verwijder voorkeurskleur 2').onClick!()
    expect(view.value()?.preferredColors).toHaveLength(3)
    expect(view.button('Voeg kleur toe')).toBeDefined()
    expect(defaultBandProfile.preferredColors).toEqual([])
  })
  it('clears only the optional profile and opens the blank automatic editor', () => {
    const view = session({ ...defaultBandProfile, name: 'Band' })
    view.button('Bandprofiel wissen').onClick!()
    expect(view.changed).toHaveBeenCalledExactlyOnceWith(undefined)
    expect(view.value()).toBeUndefined()
    expect(view.render().props.open).toBe(true)
  })
  it('blocks saved changes and clearing while disabled', () => {
    const view = session({ ...defaultBandProfile, name: 'Band' }, true)
    expect(renderToStaticMarkup(view.render())).toContain('<fieldset disabled=""')
    view.label('Bandnaam').onChange!({ target: { value: 'Changed' } })
    view.button('Bandprofiel wissen').onClick!()
    view.button('Voeg kleur toe').onClick!()
    expect(view.changed).not.toHaveBeenCalled()
  })
})
