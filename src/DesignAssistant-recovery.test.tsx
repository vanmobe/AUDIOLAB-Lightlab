import { Children, isValidElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesignAssistant } from './DesignAssistant'
import { initialShow } from './seed'

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
  useMemo: (factory: () => unknown) => factory(),
  useEffect: () => {},
}))
interface Props {
  children?: ReactNode
  disabled?: boolean
  onClick?: () => Promise<void> | void
  onChange?: (event: { target: { value: string } }) => void
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
      /* next sibling */
    }
  }
  throw new Error('Recovery control not found')
}
afterEach(() => vi.unstubAllGlobals())
describe('AI duplicate rejection recovery', () => {
  it('offers a corrective retry with the same settings and an unchanged show', async () => {
    hooks.values = []
    hooks.cursor = 0
    const show = structuredClone(initialShow),
      saved = structuredClone(show),
      onAccept = vi.fn()
    const fetch = vi.fn().mockImplementation(async () =>
      Response.json(
        {
          error: 'Voorstel afgewezen: Dubbel animatierecept: naam, snelheid, kleur of groep maken geen nieuw patroon.',
        },
        { status: 502 },
      ),
    )
    vi.stubGlobal('fetch', fetch)
    const render = () => {
      hooks.cursor = 0
      return DesignAssistant({ show, onAccept })
    }
    const button = (name: string) => find(render(), (props) => !!props.onClick && text(props.children) === name)
    await button('Maak voorstel').onClick!()
    expect(text(render())).toContain('Dubbel animatierecept')
    const retry = button('Opnieuw met correctie')
    expect(retry.disabled).toBe(false)
    await retry.onClick!()
    const first = JSON.parse(fetch.mock.calls[0][1].body),
      second = JSON.parse(fetch.mock.calls[1][1].body)
    expect(second.intent).toContain('minder unieke patronen')
    expect(second.options).toEqual(first.options)
    expect(second.show).toEqual(first.show)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(show).toEqual(saved)
    expect(onAccept).not.toHaveBeenCalled()
    expect(button('Opnieuw met correctie').disabled).toBe(false)
  })
})
