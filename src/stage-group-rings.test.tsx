import { Children, isValidElement, type ReactNode, type CSSProperties } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { StageEditor } from './StageEditor'
import { initialShow } from './seed'

// Real editor handlers, with explicit rerenders; browser QA covers native focus and pointer behavior.
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
  useRef: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = { current: initial }
    return hooks.values[index]
  },
}))
interface Props {
  children?: ReactNode
  id?: string
  className?: string
  style?: CSSProperties & { '--group-ring'?: string }
  'aria-label'?: string
  'aria-pressed'?: boolean
  'data-group-highlighted'?: boolean
  'data-group-rings'?: boolean
  placeholder?: string
  onSubmit?: (event: { preventDefault: () => void }) => void
  disabled?: boolean
  checked?: boolean
  onClick?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onFocus?: () => void
  onBlur?: () => void
  onChange?: (event: { target: { checked?: boolean; value?: string } }) => void
}
const text = (node: ReactNode): string =>
  Children.toArray(node)
    .map((child) => (isValidElement<Props>(child) ? text(child.props.children) : String(child)))
    .join('')
function find(node: ReactNode, match: (props: Props) => boolean): Props {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Props>(child)) continue
    if (match(child.props)) return child.props
    try {
      return find(child.props.children, match)
    } catch {
      /* search siblings */
    }
  }
  throw new Error('Control not found')
}
function setup() {
  hooks.values = []
  hooks.cursor = 0
  let show = structuredClone(initialShow)
  const changed = vi.fn()
  const render = () => {
    hooks.cursor = 0
    return StageEditor({ show, onChange: changed })
  }
  const label = (name: string) => find(render(), (props) => props['aria-label'] === name)
  const group = (id: string) =>
    label(
      `Selecteer groep ${show.groups.find((g) => g.id === id)!.name} (${show.fixtures.filter((f) => f.groupId === id).length} lampen)`,
    )
  return {
    render,
    label,
    group,
    changed,
    show: () => show,
    replace: (next: typeof show) => {
      show = next
    },
  }
}
describe('stage group identification', () => {
  it('renders distinct group rings without replacing fixture types or changing the show', () => {
    const view = setup()
    const colors = view.show().groups.map((group) => view.group(group.id).style?.['--group-ring'])
    expect(new Set(colors).size).toBe(view.show().groups.length)
    for (const fixture of view.show().fixtures) {
      const marker = view.label(fixture.name)
      expect(marker.style?.['--group-ring']).toBe(view.group(fixture.groupId).style?.['--group-ring'])
      expect(marker.className).toContain('stage-fixture-type')
    }
    expect(view.changed).not.toHaveBeenCalled()
  })
  it('highlights on hover/focus without selecting and selects exactly the clicked group', () => {
    const view = setup()
    view.group('wash').onMouseEnter!()
    for (const fixture of view.show().fixtures) {
      expect(view.label(fixture.name)['data-group-highlighted']).toBe(fixture.groupId === 'wash')
      expect(view.label(fixture.name)['aria-pressed']).toBe(false)
    }
    view.group('wash').onMouseLeave!()
    view.group('front').onFocus!()
    view.group('front').onClick!()
    for (const fixture of view.show().fixtures)
      expect(view.label(fixture.name)['aria-pressed']).toBe(fixture.groupId === 'front')
    view.group('front').onBlur!()
    view.group('wash').onClick!()
    for (const fixture of view.show().fixtures)
      expect(view.label(fixture.name)['aria-pressed']).toBe(fixture.groupId === 'wash')
    expect(view.changed).not.toHaveBeenCalled()
  })
  it('switches rings off without clearing selection or mutating saved data', () => {
    const view = setup()
    view.group('wash').onClick!()
    find(view.render(), (props) => !!props.onClick && text(props.children) === 'Weergave').onClick!()
    find(view.render(), (props) => props.checked !== undefined).onChange!({ target: { checked: false } })
    expect(find(view.render(), (props) => props.id === 'stage-map')['data-group-rings']).toBe(false)
    expect(view.group('wash')['aria-pressed']).toBe(true)
    expect(text(view.render())).toContain('Groepsringen verborgen')
    expect(view.changed).not.toHaveBeenCalled()
  })
  it('keeps colors when groups are renamed/appended and follows reassignment', () => {
    const view = setup(),
      previousColor = view.group('wash').style?.['--group-ring']
    view.replace({
      ...view.show(),
      groups: [
        ...view.show().groups.map((g) => (g.id === 'wash' ? { ...g, name: 'Wash links' } : g)),
        { id: 'new', name: 'Nieuw', intensity: 1 },
      ],
    })
    expect(view.group('wash').style?.['--group-ring']).toBe(previousColor)
    expect(view.group('new').disabled).toBe(true)
    const moved = view.show().fixtures[0]
    view.replace({
      ...view.show(),
      fixtures: view.show().fixtures.map((f) => (f.id === moved.id ? { ...f, groupId: 'new' } : f)),
    })
    expect(view.label(moved.name).style?.['--group-ring']).toBe(view.group('new').style?.['--group-ring'])
    expect(view.group('new').disabled).toBe(false)
  })
  it.each([255, 256])('enforces the saved-document group limit from %i groups', (count) => {
    const view = setup()
    view.replace({
      ...view.show(),
      groups: [
        ...view.show().groups,
        ...Array.from({ length: count - view.show().groups.length }, (_, i) => ({
          id: `extra-${i}`,
          name: `Extra ${i}`,
          intensity: 1,
        })),
      ],
    })
    find(view.render(), (props) => !!props.onClick && text(props.children) === 'Groepen beheren').onClick!()
    find(view.render(), (props) => props.placeholder === 'Bijvoorbeeld wash links').onChange!({
      target: { value: 'New group' },
    })
    expect(
      find(view.render(), (props) => props.disabled !== undefined && text(props.children) === 'Maak lege groep')
        .disabled,
    ).toBe(count === 256)
    // Direct submit also must be guarded, independent of the disabled native button.
    find(view.render(), (props) => !!props.onSubmit).onSubmit!({ preventDefault: () => {} })
    if (count === 256) {
      expect(view.changed).not.toHaveBeenCalled()
      expect(text(view.render())).toContain('Maximum van 256 groepen bereikt.')
    } else {
      expect(view.changed).toHaveBeenCalledOnce()
      expect(view.changed.mock.calls[0][0].groups).toHaveLength(256)
    }
  })
})
