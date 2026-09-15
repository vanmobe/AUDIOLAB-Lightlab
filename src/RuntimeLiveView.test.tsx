import { Children, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { RuntimeLiveView } from './RuntimeLiveView'
import { LiveControlSurface } from './LiveControlSurface'
import { LiveGroupControls } from './LiveGroupControls'
import { LiveLookLibrary } from './LiveLookLibrary'
import { LiveTransportBar } from './LiveTransportBar'
import { SidePanel } from './SidePanel'
import { RuntimeOutputPanel } from './RuntimeOutputPanel'
import { initialShow } from './seed'
import type { RuntimeLivePreview } from './runtime-live-client'

const mocked = vi.hoisted(() => ({ value: {} as Record<string, unknown>, controller: 'looks' }))
vi.mock('./useRuntimeLive', () => ({ useRuntimeLive: () => mocked.value }))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (value: unknown) => [
    value === 'looks' ? mocked.controller : typeof value === 'function' ? value() : value,
    vi.fn(),
  ],
  useRef: (value: unknown) => ({ current: value }),
  useMemo: (factory: () => unknown) => factory(),
  useEffect: vi.fn(),
}))
const status = {
  version: 1 as const,
  sessionId: 'test',
  status: 'running' as const,
  mode: 'automation' as const,
  lookId: initialShow.activeLookId,
  bpm: 90,
  atBeats: 17,
  frameCount: 80,
  universeCount: 1,
  outputSent: false as const,
  error: null,
}
const makePreview = (): RuntimeLivePreview => ({
  version: 1,
  sessionId: 'test',
  status,
  frame: { atBeats: 17, mode: 'automation', fixtures: [] },
  controls: { overrides: {}, links: [['front', 'wash']] },
  groupIntensities: Object.fromEntries(initialShow.groups.map((group) => [group.id, group.intensity])),
  colorLockId: null,
  revision: 8,
})
beforeEach(() => {
  mocked.controller = 'looks'
  mocked.value = {
    show: initialShow,
    preview: makePreview(),
    status,
    connected: true,
    pending: false,
    error: '',
    start: vi.fn(),
    loadEditorShow: vi.fn(),
    stop: vi.fn(),
    attach: vi.fn(),
    command: vi.fn(),
    setLive: vi.fn(),
  }
})
function componentProps<T>(
  node: ReactNode,
  type: unknown,
  match: (props: Record<string, unknown>) => boolean = () => true,
): T {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue
    if (child.type === type && match(child.props)) return child.props as T
    try {
      return componentProps(child.props.children, type, match)
    } catch {
      /* inspect next sibling */
    }
  }
  throw new Error('Component missing')
}
it('shows actual runtime beat and never presents an unavailable frame as live', () => {
  const connected = renderToStaticMarkup(<RuntimeLiveView show={initialShow} onConfigure={() => {}} />)
  expect(connected).toContain('Liveweergave')
  expect(connected).not.toContain('Runtimeframe')
  expect(connected).not.toContain('Verbinding vernieuwen')
  expect(connected).toContain('alleen runtimesessie')
  mocked.value.connected = false
  mocked.value.preview = undefined
  const disconnected = renderToStaticMarkup(<RuntimeLiveView show={initialShow} onConfigure={() => {}} />)
  expect(disconnected).toContain('Livesessie verbinden')
  expect(disconnected).not.toContain('WING schermbediening')
  expect(mocked.value.start).not.toHaveBeenCalled()
})
it('routes linked rotary masters to transient runtime state without mutating the editor', () => {
  mocked.controller = 'wing'
  const before = JSON.stringify(initialShow)
  const view = RuntimeLiveView({ show: initialShow, onConfigure: () => {} })
  const surface = componentProps<{ onIntensity: (id: string, value: number) => void; runtimeSession: boolean }>(
    view,
    LiveControlSurface,
  )
  surface.onIntensity('wash', 0.27)
  expect(surface.runtimeSession).toBe(true)
  expect(mocked.value.setLive).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ wash: 0.27, front: 0.27 }),
    null,
  )
  expect(JSON.stringify(initialShow)).toBe(before)
})
it('routes group controls and WING color/look actions to the same runtime', () => {
  mocked.controller = 'wing'
  const view = RuntimeLiveView({ show: initialShow, onConfigure: () => {} })
  const surface = componentProps<{ onLook: (id: string) => void; onColor: (id?: string) => void }>(
    view,
    LiveControlSurface,
  )
  surface.onLook('neon-chorus')
  surface.onColor('neon')
  expect(mocked.value.command).toHaveBeenCalledWith({ command: 'look', lookId: 'neon-chorus' })
  expect(mocked.value.setLive).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 'neon')
  const groups = componentProps<{ onChange: (value: unknown) => void }>(view, LiveGroupControls)
  const change = { overrides: { wash: { offsetBeats: 2, rateBeats: 8 } }, links: [] }
  groups.onChange(change)
  expect(mocked.value.setLive).toHaveBeenLastCalledWith(change, expect.anything(), null)
})
it('shows one main controller at a time and keeps target/mode/output visible independently', () => {
  const view = RuntimeLiveView({ show: initialShow, onConfigure: () => {} })
  expect(componentProps(view, LiveLookLibrary)).toBeDefined()
  expect(componentProps(view, LiveControlSurface)).toBeDefined()
  expect(
    componentProps<{ hidden: boolean }>(view, 'div', (props) => props.className === 'runtime-controller-view').hidden,
  ).toBe(true)
  const transport = componentProps<{ target: string; disabled: boolean; onMode: (mode: string) => void }>(
    view,
    LiveTransportBar,
  )
  expect(transport.target).toBe('Lokale runtime')
  expect(transport.disabled).toBe(false)
  transport.onMode('blackout')
  expect(mocked.value.command).toHaveBeenCalledWith({ command: 'mode', mode: 'blackout' })
  const html = renderToStaticMarkup(view)
  expect(html).toContain('WAV koppelen aan de livesessie')
  expect(html).toContain('DMX UIT')
  expect(mocked.value.start).not.toHaveBeenCalled()
  mocked.controller = 'wing'
  const wing = RuntimeLiveView({ show: initialShow, onConfigure: () => {} })
  expect(componentProps(wing, LiveControlSurface)).toBeDefined()
  expect(
    componentProps<{ hidden: boolean }>(wing, 'div', (props) => props.className === 'runtime-controller-view').hidden,
  ).toBe(false)
  expect(componentProps(wing, LiveLookLibrary)).toBeDefined()
})
it.each(['stopped', 'running', 'unavailable'] as const)('offers one deliberate preparation action for %s', (phase) => {
  mocked.value.connected = false
  mocked.value.preview = undefined
  mocked.value.status = phase === 'unavailable' ? undefined : { ...status, status: phase }
  mocked.value.error = phase === 'unavailable' ? 'Runtime niet bereikbaar' : ''
  const open = vi.fn()
  const view = RuntimeLiveView({ show: initialShow, onConfigure: () => {}, onOpenConnections: open })
  const action = componentProps<{ onClick: () => void; children: string }>(
    view,
    'button',
    (props) => props.className === 'primary',
  )
  expect(renderToStaticMarkup(view).match(/class="primary"/g)).toHaveLength(1)
  expect(mocked.value.start).not.toHaveBeenCalled()
  expect(mocked.value.attach).not.toHaveBeenCalled()
  action.onClick()
  if (phase !== 'unavailable') expect(mocked.value.loadEditorShow).toHaveBeenCalledWith(initialShow, 90)
  else expect(open).toHaveBeenCalledOnce()
})
it('loads the editor rather than the existing runtime snapshot and keeps attach separate', () => {
  const editor = { ...initialShow, name: 'Nieuwe editorversie', looks: initialShow.looks.slice(0, 1) }
  mocked.value.connected = false
  mocked.value.preview = undefined
  const view = RuntimeLiveView({ show: editor, onConfigure: () => {} })
  const html = renderToStaticMarkup(view)
  expect(html).toContain('In de editor: Nieuwe editorversie')
  expect(html).toContain('DMX en de WAV-koppeling gaan uit')
  componentProps<{ onClick: () => void }>(
    view,
    'button',
    (props) => props.children === 'Laad editorshow in runtime',
  ).onClick()
  expect(mocked.value.loadEditorShow).toHaveBeenCalledWith(editor, 90)
  expect(mocked.value.attach).not.toHaveBeenCalled()
  componentProps<{ onClick: () => void }>(
    view,
    'button',
    (props) => props.children === 'Verbind met bestaande sessie',
  ).onClick()
  expect(mocked.value.attach).toHaveBeenCalledOnce()
})
it('keeps loading available when already connected, but disables it while busy or without Looks', () => {
  const editor = { ...initialShow, name: 'Gewijzigd' }
  const button = (show = editor) =>
    componentProps<{ disabled: boolean }>(
      RuntimeLiveView({ show, onConfigure: () => {} }),
      'button',
      (props) => props.children === 'Laad editorshow in runtime',
    )
  expect(button().disabled).toBe(false)
  mocked.value.pending = true
  expect(button().disabled).toBe(true)
  mocked.value.pending = false
  expect(button({ ...editor, looks: [] }).disabled).toBe(true)
  expect(mocked.value.loadEditorShow).not.toHaveBeenCalled()
})
it('marks disconnected output unknown and fences mode commands', () => {
  mocked.value.connected = false
  const view = RuntimeLiveView({ show: initialShow, onConfigure: () => {} })
  const transport = componentProps<{ disabled: boolean; mode?: string }>(view, LiveTransportBar)
  expect(transport.disabled).toBe(true)
  expect(transport.mode).toBeUndefined()
  expect(renderToStaticMarkup(view)).toContain('Uitvoerstatus onbekend')
})
it('keeps navigation available while fencing only pending runtime changes', () => {
  mocked.value.pending = true
  const html = renderToStaticMarkup(<RuntimeLiveView show={initialShow} onConfigure={() => {}} />)
  expect(html).toContain('class="runtime-live-controls" aria-busy="true"')
  expect(html).toContain('class="runtime-live-change-controls" disabled=""')
  expect(html).toContain('<button class="lab-danger">Stop runtimesessie</button>')
})
it('keeps DMX control mounted in its drawer and reachable during a pending show command', () => {
  mocked.value.pending = true
  const view = RuntimeLiveView({ show: initialShow, onConfigure: () => {} })
  const drawer = componentProps<{ open: boolean; children: ReactNode }>(view, SidePanel)
  expect(drawer.open).toBe(false)
  expect(componentProps(drawer.children, RuntimeOutputPanel)).toMatchObject({ sessionId: 'test', running: true })
  const transport = componentProps<{ children: ReactNode }>(view, LiveTransportBar)
  expect(componentProps(transport.children, 'button', (props) => props.children === 'DMX-uitvoer')).not.toHaveProperty(
    'disabled',
    true,
  )
  expect(mocked.value.start).not.toHaveBeenCalled()
})
it('explains patch, session and confirmation when no DMX session exists', () => {
  mocked.value.status = undefined
  mocked.value.preview = undefined
  mocked.value.connected = false
  const view = RuntimeLiveView({ show: initialShow, onConfigure: () => {} })
  const drawer = componentProps<{ children: ReactNode }>(view, SidePanel)
  expect(() => componentProps(drawer.children, RuntimeOutputPanel)).toThrow('Component missing')
  expect(renderToStaticMarkup(view)).toContain('Van show naar echte lampen')
  expect(mocked.value.start).not.toHaveBeenCalled()
})
it('shows the reopened editor collection before starting instead of suggesting it is missing', () => {
  mocked.value.connected = false
  mocked.value.preview = undefined
  mocked.value.status = { ...status, status: 'stopped' }
  const imported = { ...structuredClone(initialShow), name: 'Heropende show' }
  const html = renderToStaticMarkup(<RuntimeLiveView show={imported} onConfigure={() => {}} />)
  expect(html).toContain('Show klaar om te starten')
  expect(html).toContain('Heropende show')
  expect(html).toContain(`${imported.looks.length} Looks`)
  expect(html).not.toContain('Geen verbonden show')
  expect(mocked.value.start).not.toHaveBeenCalled()
})
