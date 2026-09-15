import { afterEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import App from './App'
import { activePackageKey } from './active-package'
import { initialShow } from './seed'
import { createShowPackage } from './show-package'

afterEach(() => vi.unstubAllGlobals())
it('keeps the editor available when browser storage access itself is denied', () => {
  const setItem = vi.fn()
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new DOMException('Denied', 'SecurityError')
    },
    setItem,
  })
  const html = renderToStaticMarkup(<App />)
  expect(html).toContain('Lokale showopslag is ongeldig of ontoegankelijk')
  expect(html).toContain('Showoverzicht')
  expect(setItem).not.toHaveBeenCalled()
})
it('fences corrupt canonical storage and does not silently load or overwrite stale legacy data', () => {
  const setItem = vi.fn(),
    getItem = vi.fn((key: string) =>
      key === activePackageKey
        ? '{broken'
        : key === 'lightflow-show-v1'
          ? JSON.stringify({ ...initialShow, name: 'Stale legacy show' })
          : null,
    )
  vi.stubGlobal('localStorage', { getItem, setItem })
  const html = renderToStaticMarkup(<App />)
  expect(html).toContain('automatisch bewaren is geblokkeerd')
  expect(html).not.toContain('Stale legacy show')
  expect(setItem).not.toHaveBeenCalled()
  expect(getItem).not.toHaveBeenCalledWith('lightflow-show-v1')
})
it('reads canonical show and history together without touching legacy keys', () => {
  const bundle = createShowPackage({ ...initialShow, name: 'Canonical show' }, [])
  const setItem = vi.fn(),
    getItem = vi.fn((key: string) => (key === activePackageKey ? JSON.stringify(bundle) : null))
  vi.stubGlobal('localStorage', { getItem, setItem })
  expect(renderToStaticMarkup(<App />)).toContain('Canonical show')
  expect(getItem).toHaveBeenCalledWith(activePackageKey)
  expect(getItem).not.toHaveBeenCalledWith('lightflow-show-v1')
  expect(setItem).not.toHaveBeenCalled()
})
