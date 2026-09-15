import { Children, isValidElement, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DesignAssistant } from './DesignAssistant'
import { initialShow } from './seed'

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => unknown)[] }))
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
  useMemo: (fn: () => unknown) => fn(),
  useEffect: (fn: () => unknown) => {
    hooks.effects.push(fn)
  },
}))
interface Props {
  children?: ReactNode
  disabled?: boolean
  value?: string
  type?: string
  'aria-label'?: string
  onClick?: () => Promise<void>
  onChange?: (event: { target: { value: string; checked?: boolean } }) => void
}
const text = (node: ReactNode): string =>
  Children.toArray(node)
    .map((child) => (isValidElement<Props>(child) ? text(child.props.children) : String(child)))
    .join('')
function find(node: ReactNode, predicate: (props: Props) => boolean): Props {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Props>(child)) continue
    if (predicate(child.props)) return child.props
    try {
      return find(child.props.children, predicate)
    } catch {
      /* next */
    }
  }
  throw new Error('Control not found')
}
const render = () => {
  hooks.cursor = 0
  hooks.effects = []
  return DesignAssistant({ show: initialShow, onAccept: vi.fn() })
}
const button = () => find(render(), (p) => !!p.onClick && text(p.children) === 'Maak voorstel')
const control = (label: string) => find(render(), (p) => p['aria-label'] === label)
let models: string[]
beforeEach(() => {
  hooks.values = []
  models = ['model-a', 'model-b']
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.endsWith('/status')
        ? Response.json({
            provider: 'ollama',
            providers: ['ollama', 'copilot'],
            model: 'local',
            aiConfigured: true,
            runtimeVersion: '0.1.0',
            aiContractVersion: 'test-contract',
          })
        : url.includes('/models')
          ? Response.json({ models, defaultModel: null })
          : Response.json({ error: 'test-stop' }, { status: 502 }),
    ),
  )
})
afterEach(() => vi.unstubAllGlobals())
async function chooseCopilot() {
  render()
  hooks.effects[0]()
  await vi.waitFor(() => expect(control('AI-provider').value).toBe('ollama'))
  control('AI-provider').onChange!({ target: { value: 'copilot' } })
  render()
  hooks.effects[1]()
  await vi.waitFor(() => expect(control('Copilot-model').disabled).toBe(false))
  expect(control('Copilot-model').value).toBe('')
  control('Copilot-model').onChange!({ target: { value: 'model-a' } })
}
it('requires cloud consent and sends the explicitly selected provider and model', async () => {
  await chooseCopilot()
  expect(button().disabled).toBe(true)
  await button().onClick!()
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith('/propose'))).toBe(false)
  find(render(), (p) => p.type === 'checkbox' && !!p.onChange).onChange!({ target: { value: '', checked: true } })
  control('Copilot-model').onChange!({ target: { value: 'model-b' } })
  expect(button().disabled).toBe(false)
  await button().onClick!()
  const sent = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/propose'))!
  expect(JSON.parse(String(sent[1]?.body))).toMatchObject({ provider: 'copilot', model: 'model-b' })
})
it('shows runtime and AI contract versions from status', async () => {
  render()
  hooks.effects[0]()
  await vi.waitFor(() => expect(text(render())).toContain('Runtime 0.1.0 · AI-contract test-contract'))
})
it('preserves an unavailable model on refresh instead of silently substituting', async () => {
  await chooseCopilot()
  models = ['model-b']
  render()
  hooks.effects[1]()
  await vi.waitFor(() => expect(text(render())).toContain('model-a — niet beschikbaar'))
  expect(control('Copilot-model').value).toBe('model-a')
  expect(button().disabled).toBe(true)
})
it('clears model availability and consent when switching providers', async () => {
  await chooseCopilot()
  find(render(), (p) => p.type === 'checkbox' && !!p.onChange).onChange!({ target: { value: '', checked: true } })
  control('AI-provider').onChange!({ target: { value: 'ollama' } })
  control('AI-provider').onChange!({ target: { value: 'copilot' } })
  expect(button().disabled).toBe(true)
  expect(control('Copilot-model').disabled).toBe(true)
})
