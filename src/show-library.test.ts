import { expect, it } from 'vitest'
import { createShowLibrary, libraryListing, libraryName, libraryPayload } from './show-library'
import { createShowPackage, createVersion } from './show-package'
import { initialShow } from './seed'

// Minimal asynchronous IDB transaction seam: reads/writes run in request callbacks,
// writes publish only at commit, and injected failures abort both object stores.
function database() {
  const stores = new Map<string, Map<string, unknown>>()
  let failWrites = false
  type Request = { result?: unknown; error?: DOMException; onsuccess?: () => void; onerror?: () => void; onupgradeneeded?: () => void }
  const db = {
    close() {}, objectStoreNames: { contains: (name: string) => stores.has(name) }, createObjectStore(name: string) { stores.set(name, new Map()) },
    transaction(_names: string[], mode: string) {
      const working = new Map([...stores].map(([name, values]) => [name, new Map(values)]))
      let pending = 0, aborted = false
      const tx = { oncomplete: undefined as (() => void) | undefined, onabort: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined, error: undefined as DOMException | undefined,
        abort() { if (!aborted) { aborted = true; queueMicrotask(() => tx.onabort?.()) } },
        objectStore(name: string) {
          const entries = working.get(name)!
          function request(action: () => unknown, write = false) {
            const req: Request = {}; pending++
            queueMicrotask(() => {
              if (aborted) return
              if (write && failWrites) { tx.error = new DOMException('Full', 'QuotaExceededError'); tx.abort(); return }
              req.result = action(); req.onsuccess?.(); pending--
              if (!pending) queueMicrotask(() => { if (!aborted && !pending) { if (mode === 'readwrite') for (const [name, values] of working) stores.set(name, values); tx.oncomplete?.() } })
            })
            return req
          }
          return { get: (id: string) => request(() => structuredClone(entries.get(id))), getAll: (_query: unknown, count: number) => request(() => structuredClone([...entries.values()].slice(0, count))), count: () => request(() => entries.size), put: (value: { id: string }) => request(() => entries.set(value.id, structuredClone(value)), true), delete: (id: string) => request(() => entries.delete(id), true) }
        },
      }
      return tx
    },
  }
  const factory = { open() { const request: Request = {}; queueMicrotask(() => { request.result = db; request.onupgradeneeded?.(); request.onsuccess?.() }); return request } } as unknown as IDBFactory
  return { library: createShowLibrary(factory), stores, fail: () => { failWrites = true } }
}
const bundle = () => createShowPackage(initialShow, [createVersion(initialShow, 'Original')])

it('saves, reloads, renames and removes complete packages without altering version snapshots', async () => {
  const { library } = database(), original = bundle(), before = structuredClone(original)
  const entry = await library.save('Concert A', original)
  expect((await library.list()).entries).toHaveLength(1)
  const loaded = await library.load(entry.id)
  expect(loaded.show.name).toBe('Concert A'); expect(loaded.versions).toEqual(original.versions)
  await library.rename(entry.id, 'Concert B')
  expect((await library.load(entry.id)).show.name).toBe('Concert B')
  expect((await library.list()).entries[0].name).toBe('Concert B')
  expect(original).toEqual(before)
  await library.remove(entry.id); expect((await library.list()).entries).toEqual([])
  await expect(library.load(entry.id)).rejects.toThrow('ontbreekt of is beschadigd')
})
it('rolls back metadata and payload together on quota failure', async () => {
  const { library, fail } = database(), saved = await library.save('Saved', bundle())
  fail()
  await expect(library.rename(saved.id, 'Must not persist')).rejects.toThrow('opslag is vol')
  expect((await library.list()).entries[0].name).toBe('Saved')
  expect((await library.load(saved.id)).show.name).toBe('Saved')
})
it('enforces show capacity but permits updating an existing slot', async () => {
  const { library } = database()
  const entries = []
  for (let i = 0; i < 32; i++) entries.push(await library.save(`Show ${i}`, bundle()))
  await expect(library.save('Overflow', bundle())).rejects.toThrow('Maximum van 32')
  await library.save('Updated', bundle(), entries[0].id)
  expect((await library.list()).entries).toHaveLength(32)
})
it('reserves one replaceable atomic recovery slot outside all 32 named shows', async () => {
  const { library, fail } = database()
  const recovery = await library.saveRecovery('Previous editor', bundle())
  for (let i = 0; i < 32; i++) await library.save(`Show ${i}`, bundle())
  await library.saveRecovery('Latest editor', bundle())
  const listing = await library.list()
  expect(listing.entries).toHaveLength(32); expect(listing.recovery?.name).toBe('Latest editor')
  expect((await library.load(recovery.id)).show.name).toBe('Latest editor')
  fail(); await expect(library.saveRecovery('Failed replacement', bundle())).rejects.toThrow('opslag is vol')
  expect((await library.load(recovery.id)).show.name).toBe('Latest editor')
  expect((await library.list()).entries).toHaveLength(32)
})
it('isolates damaged metadata and selected payloads rather than breaking all shows', async () => {
  const { library, stores } = database(), first = await library.save('Good', bundle()), second = await library.save('Bad payload', bundle())
  stores.get('metadata')!.set('bad', { id: 'bad', name: null })
  stores.get('packages')!.set(second.id, { id: second.id, raw: '{broken' })
  expect((await library.list()).damagedCount).toBe(1)
  expect((await library.list()).damagedIds).toEqual(['bad'])
  await library.remove('bad'); expect((await library.list()).damagedCount).toBe(0)
  await expect(library.load(second.id)).rejects.toThrow()
  expect((await library.load(first.id)).show.name).toBe('Good')
})
it('bounds names, versions and bytes before writing', () => {
  expect(libraryName('  Name  ')).toBe('Name')
  expect(() => libraryName(' '.repeat(2))).toThrow()
  expect(() => libraryName('x'.repeat(121))).toThrow()
  expect(() => libraryPayload('Large', { ...bundle(), unused: 'x'.repeat(20_000_001) } as ReturnType<typeof bundle>)).toThrow('te groot')
  expect(() => libraryPayload('Versions', { ...bundle(), versions: Array.from({ length: 101 }, () => createVersion(initialShow, 'x')) })).toThrow()
  expect(libraryListing([null, undefined, { id: 'x' }]).damagedCount).toBe(3)
})
