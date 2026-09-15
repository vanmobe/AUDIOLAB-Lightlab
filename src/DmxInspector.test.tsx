import { Children, isValidElement, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { DmxFixtureDisclosure, DmxInspector } from './DmxInspector'
import { initialShow } from './seed'

const hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  effects: [] as (() => unknown)[],
  inspect: vi.fn(),
}))
vi.mock('./dmx-inspection', async (original) => ({
  ...(await original<typeof import('./dmx-inspection')>()),
  inspectDmx: hooks.inspect,
}))
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
  useEffect: (effect: () => unknown) => {
    hooks.effects.push(effect)
  },
}))
interface Props {
  children?: ReactNode
  disabled?: boolean
  'aria-label'?: string
  onClick?: () => unknown
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
      /* next */
    }
  }
  throw new Error('Control not found')
}
const result = {
  version: 1,
  requestId: 'test',
  catalogVersion: 'inspection-test',
  dryRun: true,
  outputSent: false,
  issues: [],
  universes: [],
}
beforeEach(() => {
  hooks.values = []
  hooks.cursor = 0
  hooks.effects = []
  hooks.inspect.mockReset()
})

it('mounts fixture channel rows only while its disclosure is open', () => {
  const fixture = { fixtureId: 'adj-1', address: 10, channels: [255, 42], channelLabels: ['Red', 'Green'] }
  const render = () => {
    hooks.cursor = 0
    return DmxFixtureDisclosure({ fixture, name: 'Test PAR' })
  }
  expect(text(render())).toContain('Test PAR · adres 10–11')
  expect(text(render())).not.toContain('Kanaal')
  render().props.onToggle({ currentTarget: { open: true } })
  expect(text(render())).toContain('KanaalFunctieWaarde10Red25511Green42')
  render().props.onToggle({ currentTarget: { open: false } })
  expect(text(render())).not.toContain('Kanaal')
  expect(fixture.channels).toEqual([255, 42])
})

it('blocks dirty/empty/invalid snapshots without a runtime call', () => {
  const render = (dirty = false, show = initialShow) => {
    hooks.cursor = 0
    return DmxInspector({ show, dirty })
  }
  const calculate = (node: ReactNode) =>
    find(node, (props) => !!props.onClick && text(props.children) === 'Bereken DMX-proef')
  expect(calculate(render(true)).disabled).toBe(true)
  expect(calculate(render(false, { ...initialShow, looks: [] })).disabled).toBe(true)
  find(render(), (props) => props['aria-label'] === 'Moment voor DMX-proef').onChange!({ target: { value: '65' } })
  expect(calculate(render()).disabled).toBe(true)
  calculate(render()).onClick!()
  expect(hooks.inspect).not.toHaveBeenCalled()
})

it.each(['show', 'beat', 'cancel'])(
  'discards late replies after %s change and preserves a newer request',
  async (change) => {
    let resolve!: (value: unknown) => void
    hooks.inspect
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done
          }),
      )
      .mockResolvedValueOnce(result)
    let show = initialShow
    const render = () => {
      hooks.cursor = 0
      hooks.effects = []
      return DmxInspector({ show })
    }
    const button = (name: string) => find(render(), (props) => !!props.onClick && text(props.children) === name)
    button('Bereken DMX-proef').onClick!()
    const signal = hooks.inspect.mock.calls[0][1] as AbortSignal
    if (change === 'cancel') button('Annuleer DMX-proef').onClick!()
    else {
      if (change === 'show') show = { ...show, name: 'Changed' }
      else
        find(render(), (props) => props['aria-label'] === 'Moment voor DMX-proef').onChange!({ target: { value: '2' } })
      render()
      hooks.effects[0]()
    }
    expect(signal.aborted).toBe(true)
    button('Bereken DMX-proef').onClick!()
    await Promise.resolve()
    await Promise.resolve()
    resolve({ ...result, catalogVersion: 'STALE' })
    await Promise.resolve()
    await Promise.resolve()
    expect(text(render())).toContain('inspection-test')
    expect(text(render())).not.toContain('STALE')
    expect(button('Bereken DMX-proef').disabled).toBe(false)
  },
)

it('shows actionable fixture names and collapses repeated verification warnings', async () => {
  hooks.inspect.mockResolvedValue({
    ...result,
    issues: [
      ...initialShow.fixtures.map((fixture) => ({
        severity: 'warning',
        code: 'unverified-personality',
        message: 'repeated',
        fixtureId: fixture.id,
      })),
      { severity: 'error', code: 'legacy-mode', message: 'Kies 2ch.', fixtureId: 'hazer-1' },
    ],
  })
  const render = () => {
    hooks.cursor = 0
    return DmxInspector({ show: initialShow })
  }
  find(render(), (props) => !!props.onClick && text(props.children) === 'Bereken DMX-proef').onClick!()
  await Promise.resolve()
  await Promise.resolve()
  const rendered = text(render())
  expect(rendered).toContain('19 fixtures niet fysiek geverifieerd')
  expect(rendered).toContain('Hz-200 Hazer')
  expect(rendered).toContain('Kies 2ch.')
  expect(rendered).not.toContain('repeated')
})
