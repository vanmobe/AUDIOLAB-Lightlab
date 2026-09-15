import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ReactNode } from 'react'
import { ShowLibrary } from './ShowLibrary'
import { initialShow } from './seed'
import { createShowPackage, createVersion } from './show-package'
import { recoveryEntryId, type LibraryListing } from './show-library'

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => void | (() => void))[] }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const index = hooks.cursor++; if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial; return [hooks.values[index], (next: unknown) => { hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next }] },
  useRef: (initial: unknown) => { const index = hooks.cursor++; if (!(index in hooks.values)) hooks.values[index] = { current: initial }; return hooks.values[index] },
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect) },
}))
beforeEach(() => { hooks.values = []; hooks.cursor = 0; hooks.effects = []; vi.stubGlobal('document', { activeElement: null }); vi.stubGlobal('HTMLElement', class {}); vi.stubGlobal('window', { confirm: vi.fn(() => false) }) })
afterEach(() => vi.unstubAllGlobals())
interface NodeProps { children?: ReactNode; disabled?: boolean; onClick?: () => void; onSubmit?: (event: { preventDefault: () => void }) => void; role?: string }
function nodes(node: ReactNode): Array<{ type: unknown; props: NodeProps }> {
  return Children.toArray(node).flatMap(child => isValidElement<NodeProps>(child) ? [child, ...nodes(child.props.children)] : [])
}
function content(node: ReactNode): string { return Children.toArray(node).map(child => isValidElement<NodeProps>(child) ? content(child.props.children) : String(child)).join('') }
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve() }
async function setup() {
  const bundle = createShowPackage(initialShow, [createVersion(initialShow, 'Original')])
  const entry = { id: 'saved', name: 'Concert', updatedAt: new Date().toISOString(), versionCount: 1, byteLength: 1000 }
  const store = { list: vi.fn(async (): Promise<LibraryListing> => ({ entries: [entry], damagedCount: 0 })), load: vi.fn(async () => bundle), save: vi.fn(async () => entry), saveRecovery: vi.fn(async () => entry), rename: vi.fn(async () => entry), remove: vi.fn(async () => {}) }
  const props = { show: initialShow, versions: bundle.versions, store, onClose: vi.fn(), onOpen: vi.fn(async () => true), onRestoreVersion: vi.fn(async () => true), onDeleteVersion: vi.fn(async () => true) }
  const render = () => { hooks.cursor = 0; hooks.effects = []; return ShowLibrary(props) }
  render(); const cleanup = hooks.effects[0](); await flush()
  const button = (label: string) => nodes(render()).find(node => node.type === 'button' && content(node.props.children) === label)!.props
  return { props, store, render, button, cleanup }
}
it('only reads on mount and opens a validated package through the parent callback', async () => {
  const view = await setup()
  expect(view.store.save).not.toHaveBeenCalled(); expect(view.props.onOpen).not.toHaveBeenCalled()
  view.button('Openen').onClick!(); await flush()
  expect(view.props.onOpen).toHaveBeenCalledExactlyOnceWith(await view.store.load.mock.results[0].value)
  expect(view.props.onClose).toHaveBeenCalledOnce()
})
it('preserves the editor and dialog when storage or parent backup fails', async () => {
  const view = await setup()
  view.store.load.mockRejectedValueOnce(new Error('Beschadigde show'))
  view.button('Openen').onClick!(); await flush()
  expect(view.props.onOpen).not.toHaveBeenCalled(); expect(content(view.render())).toContain('Beschadigde show')
  view.props.onOpen.mockResolvedValueOnce(false)
  view.button('Openen').onClick!(); await flush()
  expect(view.props.onClose).not.toHaveBeenCalled(); expect(content(view.render())).toContain('huidige editor blijft behouden')
})
it('discards a late loaded package after unmount and never opens it', async () => {
  const view = await setup()
  let resolve!: (value: ReturnType<typeof createShowPackage>) => void
  view.store.load.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  view.button('Openen').onClick!(); view.cleanup!()
  resolve(createShowPackage(initialShow, [])); await flush()
  expect(view.props.onOpen).not.toHaveBeenCalled(); expect(view.props.onClose).not.toHaveBeenCalled()
})
it('serializes same-tick save submissions and exposes quota failure without replacing the editor', async () => {
  const view = await setup(); view.store.save.mockRejectedValueOnce(new Error('Lokale opslag is vol'))
  const submit = nodes(view.render()).find(node => node.type === 'form')!.props.onSubmit!
  submit({ preventDefault() {} }); submit({ preventDefault() {} }); await flush()
  expect(view.store.save).toHaveBeenCalledOnce(); expect(content(view.render())).toContain('Lokale opslag is vol')
  expect(view.props.onOpen).not.toHaveBeenCalled()
})
it('requires confirmation for deletion and routes version restore through the parent', async () => {
  const view = await setup()
  view.button('Verwijderen').onClick!(); expect(view.store.remove).not.toHaveBeenCalled()
  vi.mocked(window.confirm).mockReturnValueOnce(true)
  view.button('Verwijderen').onClick!(); await flush(); expect(view.store.remove).toHaveBeenCalledExactlyOnceWith('saved')
  view.button('Versies van huidige show · 1/100').onClick!()
  view.button('Herstellen').onClick!(); await flush()
  expect(view.props.onRestoreVersion).toHaveBeenCalledExactlyOnceWith(view.props.versions[0].id)
  expect(view.props.onOpen).not.toHaveBeenCalled()
})
it('shows reserved recovery export-only without opening or overwriting its sole durable copy', async () => {
  const view = await setup()
  const entry = (await view.store.list()).entries[0]
  view.store.list.mockResolvedValue({ entries: [], damagedCount: 0, recovery: { ...entry, id: recoveryEntryId } })
  view.button('Bibliotheek vernieuwen').onClick!(); await flush()
  expect(content(view.render())).toContain('Herstelplaats · Concert')
  expect(content(view.render())).toContain('Shows · 0/32')
  expect(view.button('Exporteren')).toBeDefined()
  expect(nodes(view.render()).filter(node => node.type === 'button' && content(node.props.children) === 'Openen')).toHaveLength(0)
  expect(content(view.render())).toContain('Exporteer haar eerst')
  expect(content(view.render())).not.toContain('Bijwerken vanuit editor')
})
