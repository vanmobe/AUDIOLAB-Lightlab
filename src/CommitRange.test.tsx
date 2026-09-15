import { beforeEach, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ReactNode } from 'react'
import { CommitRange } from './CommitRange'
import { GroupTimingControls } from './GroupTimingControls'
import { initialShow } from './seed'
import { resolveLookLayers } from './domain'

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => void)[] }))
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
  useEffect: (effect: () => void) => {
    hooks.effects.push(effect)
  },
}))
beforeEach(() => {
  hooks.values = []
  hooks.cursor = 0
  hooks.effects = []
})
function setup() {
  let value = 0.5
  const onCommit = vi.fn()
  const render = () => {
    hooks.cursor = 0
    hooks.effects = []
    return CommitRange({ value, onCommit, min: 0, max: 1, step: 0.01 })
  }
  return {
    render,
    onCommit,
    update: (next: number) => {
      value = next
      render()
      hooks.effects.forEach((effect) => effect())
    },
  }
}
const pointer = { pointerId: 1, currentTarget: { setPointerCapture: vi.fn() } }
const keyboard = (key: string) => ({ key, preventDefault: vi.fn() })
it('commits once after a full pointer gesture, not while dragging or on subsequent blur', () => {
  const view = setup()
  view.render().props.onPointerDown(pointer)
  for (const value of ['0.4', '0.3', '0.2']) view.render().props.onChange({ target: { value } })
  expect(view.render().props.value).toBe(0.2)
  expect(view.onCommit).not.toHaveBeenCalled()
  view.render().props.onPointerUp(pointer)
  view.render().props.onBlur({})
  expect(view.onCommit).toHaveBeenCalledExactlyOnceWith(0.2)
})
it('commits held keyboard changes once on keyup and supports blur-only edits', () => {
  const view = setup()
  view.render().props.onKeyDown(keyboard('ArrowRight'))
  view.render().props.onChange({ target: { value: '0.6' } })
  view.render().props.onChange({ target: { value: '0.7' } })
  view.render().props.onKeyUp(keyboard('ArrowRight'))
  view.render().props.onBlur({})
  expect(view.onCommit).toHaveBeenCalledExactlyOnceWith(0.7)
  view.render().props.onChange({ target: { value: '0.9' } })
  view.render().props.onBlur({})
  expect(view.onCommit).toHaveBeenLastCalledWith(0.9)
})
it.each(['pointer', 'escape'])('cancels %s without committing and restores latest server value', (kind) => {
  const view = setup()
  view.render().props.onPointerDown(pointer)
  view.render().props.onChange({ target: { value: '0.1' } })
  view.update(0.8)
  expect(view.render().props.value).toBe(0.1)
  if (kind === 'pointer') view.render().props.onPointerCancel(pointer)
  else view.render().props.onKeyDown(keyboard('Escape'))
  view.render().props.onBlur({})
  expect(view.render().props.value).toBe(0.8)
  expect(view.onCommit).not.toHaveBeenCalled()
  view.update(0.3)
  expect(view.render().props.value).toBe(0.3)
})

interface InputProps {
  children?: ReactNode
  'aria-label'?: string
  onChange?: (event: { target: { value: string } }) => void
  onBlur?: () => void
  onKeyDown?: (event: ReturnType<typeof keyboard>) => void
}
function offset(node: ReactNode): InputProps {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<InputProps>(child)) continue
    if (child.props['aria-label'] === 'Exacte groepsoffset in beats') return child.props
    try {
      return offset(child.props.children)
    } catch {
      /* next */
    }
  }
  throw new Error('Offset not found')
}
it('defers runtime exact offsets until Enter/blur and avoids duplicate commit on blur', () => {
  const onChange = vi.fn(),
    layer = { ...resolveLookLayers(initialShow, initialShow.looks[0])[0], offsetBeats: 0 }
  const render = () => {
    hooks.cursor = 0
    return GroupTimingControls({ show: initialShow, layers: [layer], onChange, deferCommit: true })
  }
  offset(render()).onChange!({ target: { value: '1' } })
  offset(render()).onChange!({ target: { value: '1.25' } })
  expect(onChange).not.toHaveBeenCalled()
  offset(render()).onKeyDown!(keyboard('Enter'))
  offset(render()).onBlur!()
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ offsetBeats: 1.25 })
})
