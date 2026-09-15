import { expect, it, vi } from 'vitest'
import { activePackageKey, loadActivePackage, persistActivePackage } from './active-package'
import { createShowPackage, createVersion } from './show-package'
import { initialShow } from './seed'

function setup() {
  const values = new Map<string, string>()
  const storage = { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value) }) }
  return { storage, values }
}
it('commits show, history and catalog through exactly one key write', () => {
  const { storage, values } = setup(), bundle = createShowPackage(initialShow, [createVersion(initialShow, 'Saved')])
  persistActivePackage(storage, bundle)
  expect(storage.setItem).toHaveBeenCalledOnce(); expect(JSON.parse(values.get(activePackageKey)!)).toEqual(bundle)
})
it('keeps the entire prior package untouched if atomic write fails', () => {
  const { storage, values } = setup(), old = createShowPackage(initialShow, [])
  persistActivePackage(storage, old); storage.setItem.mockImplementationOnce(() => { throw new Error('Quota') })
  expect(() => persistActivePackage(storage, createShowPackage({ ...initialShow, name: 'New' }, [createVersion(initialShow, 'New')]))).toThrow('huidige show blijft intact')
  expect(JSON.parse(values.get(activePackageKey)!)).toEqual(old)
})
it('migrates legacy keys together once without changing or deleting the originals', () => {
  const { storage, values } = setup(), versions = [createVersion(initialShow, 'Old')]
  values.set('lightflow-show-v1', JSON.stringify(initialShow)); values.set('lightflow-versions-v1', JSON.stringify(versions))
  const before = new Map(values), result = loadActivePackage(storage, initialShow)
  expect(result.source).toBe('legacy'); expect(result.blocked).toBe(false); expect(result.bundle.versions).toEqual(versions)
  for (const [key, value] of before) expect(values.get(key)).toBe(value)
  expect(storage.setItem).toHaveBeenCalledOnce()
  storage.setItem.mockClear(); expect(loadActivePackage(storage, initialShow).source).toBe('canonical'); expect(storage.setItem).not.toHaveBeenCalled()
})
it.each(['', '{bad', JSON.stringify({ format: 'lightflow-show', version: 1, show: initialShow, versions: 'bad' })])('fences corrupt canonical %s without reverting to stale legacy or overwriting it', raw => {
  const { storage, values } = setup(); values.set(activePackageKey, raw); values.set('lightflow-show-v1', JSON.stringify({ ...initialShow, name: 'Stale' }))
  const result = loadActivePackage(storage, initialShow)
  expect(result.blocked).toBe(true); expect(result.source).toBe('canonical'); expect(result.bundle.show.name).not.toBe('Stale')
  expect(storage.setItem).not.toHaveBeenCalled(); expect(values.get(activePackageKey)).toBe(raw)
})
it('keeps valid legacy content readable but fences autosave if migration exceeds quota', () => {
  const { storage, values } = setup(); values.set('lightflow-show-v1', JSON.stringify({ ...initialShow, name: 'Legacy' }))
  storage.setItem.mockImplementation(() => { throw new Error('Quota') })
  const result = loadActivePackage(storage, initialShow)
  expect(result.bundle.show.name).toBe('Legacy'); expect(result.blocked).toBe(true); expect(result.message).toContain('Migratie')
  expect(values.has(activePackageKey)).toBe(false)
})
it('does not write during an empty read and fences inaccessible or corrupt legacy storage', () => {
  const { storage, values } = setup()
  expect(loadActivePackage(storage, initialShow)).toMatchObject({ source: 'empty', blocked: false }); expect(storage.setItem).not.toHaveBeenCalled()
  values.set('lightflow-versions-v1', '{bad'); expect(loadActivePackage(storage, initialShow).blocked).toBe(true)
  storage.getItem.mockImplementation(() => { throw new Error('Denied') }); expect(loadActivePackage(storage, initialShow).blocked).toBe(true)
  expect(storage.setItem).not.toHaveBeenCalled()
})
