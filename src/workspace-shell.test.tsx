import { Children, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { ShowDashboard } from './ShowDashboard'
import { LiveLookLibrary } from './LiveLookLibrary'
import { initialShow } from './seed'
import { createShowPackage, createVersion, type ShowPackage } from './show-package'
import { saveLibraryRecovery } from './show-library'
import { activePackageKey } from './active-package'
vi.mock('./show-library', async (original) => ({
  ...(await original<typeof import('./show-library')>()),
  saveLibraryRecovery: vi.fn(async () => ({ id: 'recovery' })),
}))

// Exercise shell transitions without WebGL effects; native focus/dialog/layout gets browser QA.
const hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  effects: [] as { effect: () => void | (() => void); deps: unknown[] }[],
}))
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
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    hooks.effects.push({ effect, deps })
  },
  useCallback: (callback: unknown) => callback,
}))
interface Props {
  children?: ReactNode
  'data-workspace'?: string
  'aria-label'?: string
  'aria-pressed'?: boolean
  onClick?: () => void
  onDirtyChange?: (dirty: boolean) => void
  onChange?: (event: { target: { value: string } }) => void
  onOpen?: (bundle: ShowPackage) => Promise<boolean>
  onRestoreVersion?: (id: string) => Promise<boolean>
  versions?: ShowPackage['versions']
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
function buttonLabels(node: ReactNode): string[] {
  return Children.toArray(node).flatMap((child) =>
    !isValidElement<Props>(child)
      ? []
      : [...(child.props.onClick ? [text(child.props.children)] : []), ...buttonLabels(child.props.children)],
  )
}
function setup() {
  hooks.values = []
  hooks.cursor = 0
  vi.mocked(saveLibraryRecovery).mockReset()
  vi.mocked(saveLibraryRecovery).mockResolvedValue({
    id: 'recovery',
    name: 'Recovery',
    byteLength: 1,
    versionCount: 0,
    updatedAt: new Date().toISOString(),
  })
  const show = { ...structuredClone(initialShow), name: 'Tourshow behouden' }
  const stored = new Map<string, string>([[activePackageKey, JSON.stringify(createShowPackage(show, []))]])
  const setItem = vi.fn((key: string, value: string) => {
    stored.set(key, value)
  })
  const getItem = vi.fn((key: string) => stored.get(key) ?? null)
  vi.stubGlobal('localStorage', { getItem, setItem, removeItem: (key: string) => stored.delete(key) })
  const confirm = vi.fn(() => true)
  const addEventListener = vi.fn(),
    removeEventListener = vi.fn()
  vi.stubGlobal('window', { confirm, addEventListener, removeEventListener })
  const render = () => {
    hooks.cursor = 0
    hooks.effects = []
    return App()
  }
  const button = (name: string) =>
    find(render(), (props) => !!props.onClick && text(props.children) === name).onClick!()
  return { render, button, confirm, setItem, show, stored, getItem, addEventListener, removeEventListener }
}
afterEach(() => vi.unstubAllGlobals())
describe('professional workspace shell', () => {
  it('opens DMX runtime controls without implicitly starting or transmitting a show', () => {
    const view = setup()
    view.button('Live')
    view.button('Naar DMX-bediening')
    expect(
      find(view.render(), (props) => !!props.onClick && text(props.children) === 'Livesessie')['aria-pressed'],
    ).toBe(true)
    expect(view.confirm).not.toHaveBeenCalled()
  })
  it('preserves runtime warning after successful library opening and explains WAV detach', async () => {
    const view = setup()
    view.button('Live')
    view.button('Livesessie')
    view.button('Bibliotheek & versies')
    await find(view.render(), (props) => !!props.onOpen).onOpen!(createShowPackage(initialShow, []))
    expect(view.confirm).toHaveBeenCalledWith(expect.stringContaining('Een gekoppelde WAV wordt ontkoppeld'))
    expect(text(view.render())).toContain('Een livesessie kan nog actief zijn')
    expect(find(view.render(), (props) => !!props['data-workspace'])['data-workspace']).toBe('start')
  })
  it('warns before unload immediately after autosave fails and clears only after successful persistence', () => {
    const view = setup()
    view.render()
    const save = hooks.effects.find(
      ({ deps }) => deps.length === 3 && Array.isArray(deps[1]) && typeof deps[2] === 'boolean',
    )!.effect
    const cleanup = hooks.effects
      .find(
        ({ deps }) =>
          deps.length === 3 && deps.every((value) => !!value && typeof value === 'object' && 'current' in value),
      )!
      .effect()
    const warn = view.addEventListener.mock.calls.find(([name]) => name === 'beforeunload')![1] as (event: {
      preventDefault: () => void
      returnValue?: string
    }) => void
    const before = { preventDefault: vi.fn() }
    warn(before)
    expect(before.preventDefault).not.toHaveBeenCalled()
    view.setItem.mockImplementationOnce(() => {
      throw new Error('Quota')
    })
    save()
    const failed = { preventDefault: vi.fn(), returnValue: undefined as string | undefined }
    warn(failed)
    expect(failed.preventDefault).toHaveBeenCalledOnce()
    expect(failed.returnValue).toBe('')
    expect(text(view.render())).toContain('Niet opgeslagen:')
    // Other messages must not erase the independent unsaved-state warning.
    view.button('Bibliotheek & versies')
    expect(text(view.render())).toContain('Niet opgeslagen:')
    save()
    const saved = { preventDefault: vi.fn() }
    warn(saved)
    expect(saved.preventDefault).not.toHaveBeenCalled()
    expect(text(view.render())).not.toContain('Niet opgeslagen:')
    cleanup!()
    expect(view.removeEventListener).toHaveBeenCalledWith('beforeunload', warn)
  })
  it('also warns before unload when canonical storage was fenced at startup', () => {
    const view = setup()
    view.stored.set(activePackageKey, '{corrupt')
    view.render()
    hooks.effects
      .find(
        ({ deps }) =>
          deps.length === 3 && deps.every((value) => !!value && typeof value === 'object' && 'current' in value),
      )!
      .effect()
    const warn = view.addEventListener.mock.calls.find(([name]) => name === 'beforeunload')![1]
    const event = { preventDefault: vi.fn() }
    warn(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(view.setItem).not.toHaveBeenCalled()
  })
  it('migrates legacy show/history once during initialization, not on subsequent renders', () => {
    const view = setup()
    view.stored.delete(activePackageKey)
    view.stored.set('lightflow-show-v1', JSON.stringify(view.show))
    view.stored.set('lightflow-versions-v1', '[]')
    view.render()
    view.render()
    view.render()
    expect(view.getItem.mock.calls.filter(([key]) => key === 'lightflow-show-v1')).toHaveLength(1)
    expect(view.getItem.mock.calls.filter(([key]) => key === 'lightflow-versions-v1')).toHaveLength(1)
    expect(view.setItem).toHaveBeenCalledOnce()
    expect(view.setItem.mock.calls[0][0]).toBe(activePackageKey)
    expect(view.stored.get('lightflow-show-v1')).toBe(JSON.stringify(view.show))
  })
  it('awaits durable recovery before any active writes or show replacement', async () => {
    const view = setup()
    view.button('Bibliotheek & versies')
    let finish!: (value: Awaited<ReturnType<typeof saveLibraryRecovery>>) => void
    vi.mocked(saveLibraryRecovery).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const opening = find(view.render(), (props) => !!props.onOpen).onOpen!(createShowPackage(initialShow, []))
    expect(view.setItem).not.toHaveBeenCalled()
    expect(text(view.render())).toContain('Tourshow behouden')
    expect(vi.mocked(saveLibraryRecovery).mock.calls[0][1].show.name).toBe('Tourshow behouden')
    finish({ id: 'recovery', name: 'Recovery', byteLength: 1, versionCount: 0, updatedAt: new Date().toISOString() })
    expect(await opening).toBe(true)
    expect(JSON.parse(view.stored.get(activePackageKey)!).show.name).toBe(initialShow.name)
    expect(() => find(view.render(), (props) => !!props.onOpen)).toThrow()
  })
  it('retains active show and visible library when recovery backup rejects', async () => {
    const view = setup()
    view.button('Bibliotheek & versies')
    vi.mocked(saveLibraryRecovery).mockRejectedValueOnce(new Error('Backup quota'))
    await expect(
      find(view.render(), (props) => !!props.onOpen).onOpen!(createShowPackage(initialShow, [])),
    ).rejects.toThrow('Backup quota')
    expect(view.setItem).not.toHaveBeenCalled()
    expect(text(view.render())).toContain('Tourshow behouden')
    expect(find(view.render(), (props) => !!props.onOpen)).toBeDefined()
  })
  it('retains the entire canonical package and visible history when its atomic write fails', async () => {
    const view = setup(),
      history = [createVersion(view.show, 'Kept')]
    view.stored.set(activePackageKey, JSON.stringify(createShowPackage(view.show, history)))
    view.button('Bibliotheek & versies')
    const before = new Map(view.stored)
    view.setItem.mockImplementationOnce(() => {
      throw new Error('Quota')
    })
    await expect(
      find(view.render(), (props) => !!props.onOpen).onOpen!(createShowPackage(initialShow, [])),
    ).rejects.toThrow('huidige show blijft intact')
    expect(view.stored).toEqual(before)
    expect(text(view.render())).toContain('Tourshow behouden')
    expect(find(view.render(), (props) => !!props.onOpen).versions).toEqual(history)
  })
  it('restores a selected version only after full backup and adds the previous editor as recovery version', async () => {
    const view = setup(),
      version = createVersion(initialShow, 'Target')
    view.stored.set(activePackageKey, JSON.stringify(createShowPackage(view.show, [version])))
    view.button('Bibliotheek & versies')
    expect(await find(view.render(), (props) => !!props.onRestoreVersion).onRestoreVersion!(version.id)).toBe(true)
    expect(vi.mocked(saveLibraryRecovery).mock.calls[0][1].show.name).toBe('Tourshow behouden')
    const saved = JSON.parse(view.stored.get(activePackageKey)!).versions
    expect(saved).toHaveLength(2)
    expect(saved[0].show.name).toBe('Tourshow behouden')
    expect(saved[1].id).toBe(version.id)
    expect(JSON.parse(view.stored.get(activePackageKey)!).show.name).toBe(initialShow.name)
  })
  it('blocks opening the library while a patch draft is dirty', () => {
    const view = setup()
    view.button('Setup')
    view.button('Patch & netwerk')
    find(view.render(), (props) => !!props.onDirtyChange).onDirtyChange!(true)
    view.button('Bibliotheek & versies')
    expect(() => find(view.render(), (props) => !!props.onOpen)).toThrow()
    expect(saveLibraryRecovery).not.toHaveBeenCalled()
    expect(view.setItem).not.toHaveBeenCalled()
  })
  it('cancels reset without mutation and preserves recovery before confirmed replacement', () => {
    const view = setup()
    view.confirm.mockReturnValueOnce(false)
    view.button('Herstel startshow…')
    expect(text(view.render())).toContain('Tourshow behouden')
    expect(view.setItem).not.toHaveBeenCalled()
    view.button('Herstel startshow…')
    const [key, saved] = view.setItem.mock.calls[0]
    expect(key).toBe(activePackageKey)
    expect(JSON.parse(saved).versions[0].show.name).toBe('Tourshow behouden')
    expect(text(view.render())).toContain(initialShow.name)
  })
  it('keeps the current show if the reset recovery cannot be stored', () => {
    const view = setup()
    view.setItem.mockImplementation(() => {
      throw new Error('Quota exceeded')
    })
    view.button('Herstel startshow…')
    expect(text(view.render())).toContain('Tourshow behouden')
    expect(text(view.render())).toContain('Je huidige show is niet gewijzigd')
  })
  it('guards leaving a dirty patch and supports cancel then confirm', () => {
    const view = setup()
    view.button('Setup')
    view.button('Patch & netwerk')
    find(view.render(), (props) => !!props.onDirtyChange).onDirtyChange!(true)
    view.confirm.mockReturnValueOnce(false)
    view.button('Live')
    expect(find(view.render(), (props) => !!props['data-workspace'])['data-workspace']).toBe('patch')
    view.button('Live')
    expect(find(view.render(), (props) => !!props['data-workspace'])['data-workspace']).toBe('live')
  })
  it('keeps runtime controls on cancelled departure and warns after switching to simulation', () => {
    const view = setup()
    view.button('Live')
    view.button('Livesessie')
    view.confirm.mockReturnValueOnce(false)
    view.button('Simulatie')
    expect(
      find(view.render(), (props) => !!props.onClick && text(props.children) === 'Livesessie')['aria-pressed'],
    ).toBe(true)
    view.button('Simulatie')
    expect(text(view.render())).toContain('Een livesessie kan nog actief zijn')
    view.button('Terug naar livesessie')
    expect(text(view.render())).not.toContain('Een livesessie kan nog actief zijn')
    expect(
      find(view.render(), (props) => !!props.onClick && text(props.children) === 'Livesessie')['aria-pressed'],
    ).toBe(true)
  })
  it('does not discard a dirty patch when returning to a possibly active session', () => {
    const view = setup()
    view.button('Live')
    view.button('Livesessie')
    view.button('Setup')
    view.button('Patch & netwerk')
    find(view.render(), (props) => !!props.onDirtyChange).onDirtyChange!(true)
    view.confirm.mockReturnValueOnce(false)
    view.button('Terug naar livesessie')
    expect(find(view.render(), (props) => !!props['data-workspace'])['data-workspace']).toBe('patch')
    expect(text(view.render())).toContain('Een livesessie kan nog actief zijn')
  })
  it('does not report a saved version or change the version list when storage fails', () => {
    const view = setup()
    view.setItem.mockImplementation(() => {
      throw new Error('Quota exceeded')
    })
    view.button('Versie bewaren 0/100')
    expect(text(view.render())).toContain('Versie kon niet worden opgeslagen')
    expect(text(view.render())).not.toContain('Versie opgeslagen om')
    expect(text(view.render())).toContain('Tourshow behouden')
  })
  it('derives dashboard inventory and library totals from the current show', () => {
    const view = setup()
    const show = { ...view.show, fixtures: [], looks: [], programs: [] }
    const html = renderToStaticMarkup(
      <ShowDashboard
        show={show}
        versionCount={4}
        onSetup={vi.fn()}
        onDesign={vi.fn()}
        onLive={vi.fn()}
        onImport={vi.fn()}
        onExport={vi.fn()}
      />,
    )
    expect(html).toContain('Je podium is nog leeg')
    expect(html).toContain('4 bewaarde versies')
    expect(html).not.toContain('× 12')
    expect(html).not.toContain('24 lichtpunten')
  })
  it('orders design navigation from AI to Testlab and opens the safe test surface', () => {
    const view = setup()
    view.button('Ontwerpen')
    const labels = buttonLabels(view.render())
    const expected = ['Maak met AI', 'Kleuren · 2', 'Animaties · 3', 'Looks · 3', 'Testlab']
    expect(expected.map((label) => labels.indexOf(label))).toEqual(
      [...expected.keys()].map((index) => labels.indexOf(expected[0]) + index),
    )
    view.button('Testlab')
    expect(text(view.render())).toContain('Probeer een opgeslagen Look met een losse animatie')
    expect(text(view.render())).toContain('VRIJ COMBINEREN')
  })
  it('searches large Live libraries and selects the exact filtered Look', () => {
    hooks.values = []
    hooks.cursor = 0
    const show = {
      ...initialShow,
      looks: Array.from({ length: 32 }, (_, i) => ({ ...initialShow.looks[0], id: `look-${i}`, name: `Nummer ${i}` })),
    }
    const onSelect = vi.fn()
    const render = () => {
      hooks.cursor = 0
      return LiveLookLibrary({ show, onSelect, activeLookId: 'look-31' })
    }
    find(render(), (props) => !!props.onChange).onChange!({ target: { value: 'Nummer 31' } })
    const selected = find(render(), (props) => !!props.onClick && text(props.children).includes('Nummer 31'))
    expect(selected['aria-pressed']).toBe(true)
    selected.onClick!()
    expect(onSelect).toHaveBeenCalledWith('look-31')
    find(render(), (props) => !!props.onChange).onChange!({ target: { value: 'ontbreekt' } })
    expect(text(render())).toContain('Geen Looks gevonden')
  })
})
