import { Children, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { BrowserLiveControls } from './BrowserLiveControls'
import { emptyLiveControls } from './live-controls'
import { rehearsalPreview } from './rehearsal'
import { RehearsalControls } from './RehearsalControls'
import { initialShow } from './seed'

interface NodeProps {
  children?: ReactNode
  'aria-label'?: string
  onChange?: (event: { target: { value: string } }) => void
}

function find(node: ReactNode, label: string): NodeProps {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<NodeProps>(child)) continue
    if (child.props['aria-label'] === label) return child.props
    try {
      return find(child.props.children, label)
    } catch {
      // Continue searching sibling nodes.
    }
  }
  throw new Error(`Missing ${label}`)
}

it('keeps Testlab combinations in preview state and labels masters as preview-only', () => {
  const rehearsal = { mode: 'automation' as const, activeLookId: initialShow.activeLookId }
  const onRehearsalChange = vi.fn()
  const controls = RehearsalControls({
    show: initialShow,
    rehearsal,
    preview: rehearsalPreview(initialShow, rehearsal),
    state: rehearsal,
    onRehearsalChange,
    onMode: vi.fn(),
  })

  const animation = find(controls, 'Animatie uitproberen')
  animation.onChange!({ target: { value: initialShow.programs[1].id } })
  const update = onRehearsalChange.mock.calls[0][0]
  expect(update(rehearsal).programId).toBe(initialShow.programs[1].id)
  expect(renderToStaticMarkup(controls)).toContain('Alleen preview')
  expect(renderToStaticMarkup(controls)).toContain('Je opgeslagen Looks blijven ongewijzigd.')
})

it('keeps saved browser masters with the browser Live controls', () => {
  const onIntensity = vi.fn()
  const controls = BrowserLiveControls({
    show: initialShow,
    state: { mode: 'automation', activeLookId: initialShow.activeLookId },
    controls: emptyLiveControls(),
    controller: 'looks',
    onControllerChange: vi.fn(),
    onLook: vi.fn(),
    onMode: vi.fn(),
    onColorLock: vi.fn(),
    onIntensity,
    onControlsChange: vi.fn(),
    onArm: vi.fn(),
    onConfigure: vi.fn(),
  })

  find(controls, `${initialShow.groups[0].name} intensity`).onChange!({ target: { value: '0.42' } })
  expect(onIntensity).toHaveBeenCalledWith(initialShow.groups[0].id, 0.42)
  expect(renderToStaticMarkup(controls)).toContain('Bewaard in show')
})
