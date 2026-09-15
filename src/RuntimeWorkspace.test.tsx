import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { RuntimeWorkspace } from './RuntimeWorkspace'
import { RuntimeLiveView } from './RuntimeLiveView'
import { RuntimeAudioPanel } from './RuntimeAudioPanel'
import type { useRuntimeLive } from './useRuntimeLive'
import { initialShow } from './seed'
import { Children, isValidElement, type ReactNode } from 'react'

const controller = vi.hoisted(() => ({ value: {} as ReturnType<typeof useRuntimeLive> }))
vi.mock('./useRuntimeLive', () => ({ useRuntimeLive: () => controller.value }))
function runtime() {
  return {
    show: undefined,
    preview: undefined,
    status: {
      version: 1,
      sessionId: 'test',
      status: 'stopped',
      mode: 'blackout',
      lookId: null,
      bpm: 120,
      atBeats: 0,
      frameCount: 0,
      universeCount: 0,
      outputSent: false,
      error: null,
    },
    pending: false,
    connected: false,
    error: '',
    start: vi.fn(),
    loadEditorShow: vi.fn(),
    attach: vi.fn(),
    stop: vi.fn(),
    command: vi.fn(),
    setLive: vi.fn(),
    refreshStatus: vi.fn(),
  } as ReturnType<typeof useRuntimeLive>
}
function find(node: ReactNode, type: unknown): ReactNode {
  for (const item of Children.toArray(node))
    if (isValidElement<{ children?: ReactNode }>(item)) {
      if (item.type === type) return item
      const child = find(item.props.children, type)
      if (child) return child
    }
  return null
}
it('exposes runtime, show, DMX and WING without starting or commanding anything on render', () => {
  const state = runtime()
  const html = renderToStaticMarkup(<RuntimeWorkspace show={initialShow} runtime={state} onNavigate={() => {}} />)
  for (const label of [
    'Start runtime',
    'Stop runtime',
    'Livesessie',
    'DMX-uitvoer',
    'Synchroniseren met WING',
    'Logging',
  ])
    expect(html).toContain(label)
  expect(state.start).not.toHaveBeenCalled()
  expect(state.command).not.toHaveBeenCalled()
  expect(state.stop).not.toHaveBeenCalled()
})
it('keeps the same WAV session component when switching Live to Runtime management', () => {
  // Inspect the shared owner tree: page navigation must not replace the audio coupling seam.
  controller.value = runtime()
  const props = { show: initialShow, onConfigure: vi.fn(), onNavigate: vi.fn(), audioSource: { current: null } }
  // Hooks are rendered through a wrapper to inspect child identity without mounting WebGL.
  const views: ReactNode[] = []
  function Capture({ management }: { management: boolean }) {
    const tree = RuntimeLiveView({ ...props, management })
    views.push(tree)
    return null
  }
  renderToStaticMarkup(<Capture management={false} />)
  renderToStaticMarkup(<Capture management />)
  const audio = views.map((view) => find(view, RuntimeAudioPanel))
  expect(audio[0]).toBeTruthy()
  for (const node of audio) expect(node).toHaveProperty('key', '.$audio-test')
  expect(audio[0]).toHaveProperty('props.sessionId', 'test')
  expect(audio[1]).toHaveProperty('props.sessionId', 'test')
})
