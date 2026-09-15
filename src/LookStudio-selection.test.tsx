import { Children, isValidElement, type ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { LookStudio } from './LookStudio'
import { initialShow } from './seed'

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = initial
    return [
      hooks.values[index],
      (next: unknown) => {
        hooks.values[index] = next
      },
    ]
  },
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: () => {},
}))
interface Props {
  children?: ReactNode
  'aria-label'?: string
  onChange?: (event: { target: { value: string } }) => void
  onClick?: () => void
}
function nodes(node: ReactNode): Props[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<Props>(child) ? [child.props, ...nodes(child.props.children)] : [],
  )
}
function text(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => (isValidElement<Props>(child) ? text(child.props.children) : String(child)))
    .join('')
}
it('filters only the desktop selection list and dispatches selection without editing the saved show', () => {
  hooks.values = []
  const onChange = vi.fn(),
    onSelectLook = vi.fn()
  const show = {
    ...initialShow,
    looks: Array.from({ length: 7 }, (_, i) => ({ ...initialShow.looks[0], id: `look-${i}`, name: `Look ${i + 1}` })),
  }
  const render = () => {
    hooks.cursor = 0
    return LookStudio({ show, onChange, onSelectLook, selectedLookId: 'look-0', bpm: 120, onBpmChange: vi.fn() })
  }
  const search = () => nodes(render()).find((props) => props['aria-label'] === 'Zoek studio-Look')!
  search().onChange!({ target: { value: 'Look 4' } })
  const selection = nodes(render()).find((props) => props['aria-label'] === 'Looks in de studio')!
  expect(nodes(selection.children).filter((props) => props.onClick)).toHaveLength(1)
  nodes(selection.children).find((props) => props.onClick)!.onClick!()
  expect(onSelectLook).toHaveBeenCalledExactlyOnceWith('look-3')
  expect(onChange).not.toHaveBeenCalled()
  search().onChange!({ target: { value: 'Missing' } })
  expect(text(render())).toContain('Geen Looks gevonden.')
})
