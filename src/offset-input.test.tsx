import { Children, isValidElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { GroupTimingControls } from './GroupTimingControls'
import { editLookLayer } from './LookEditor'
import { initialShow } from './seed'
import { resolveLookLayers } from './domain'

// Exercise the actual input callback without blur. Browser validation separately
// covers React rerenders, focus changes and persistence across navigation/reload.
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (value: unknown) => [value, vi.fn()],
  useRef: (value: unknown) => ({ current: value }),
  useEffect: () => {},
}))

function exactInput(node: ReactNode): { onChange: (event: { target: { value: string } }) => void } | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; 'aria-label'?: string; onChange: (event: { target: { value: string } }) => void }>(child)) continue
    if (child.props['aria-label'] === 'Exacte groepsoffset in beats') return child.props
    const found = exactInput(child.props.children)
    if (found) return found
  }
}

describe('exact offset input commit', () => {
  it.each(['1.25', '-0.5', '0', '64', '-64'])('writes %s into the Look without leaving the field', value => {
    const show = structuredClone(initialShow)
    const original = editLookLayer(show, show.looks[2], 'wash', { offsetBeats: 2 })
    let saved = original
    const layer = resolveLookLayers(show, original).find(item => item.groupId === 'wash')!
    const control = GroupTimingControls({ show, layers: [layer], onChange: change => { saved = editLookLayer(show, saved, 'wash', change) } })
    exactInput(control)!.onChange({ target: { value } })
    expect(JSON.parse(JSON.stringify(saved)).layers.find((item: { groupId: string }) => item.groupId === 'wash').offsetBeats).toBe(Number(value))
  })

  it.each(['', '-', '65', '-65', 'Infinity'])('does not replace stored timing with invalid/incomplete %j', value => {
    const onChange = vi.fn()
    const layer = { ...resolveLookLayers(initialShow, initialShow.looks[2])[0], offsetBeats: 2 }
    const control = GroupTimingControls({ show: initialShow, layers: [layer], onChange })
    exactInput(control)!.onChange({ target: { value } })
    expect(onChange).not.toHaveBeenCalled()
  })
})
