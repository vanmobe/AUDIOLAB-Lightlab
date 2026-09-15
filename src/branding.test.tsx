import { afterEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import App from './App'
import { initialShow } from './seed'
import { createShowPackage, parseShowPackage } from './show-package'

afterEach(() => vi.unstubAllGlobals())

it('renders Lightlab while retaining the user show from legacy storage', () => {
  const saved = { ...initialShow, name: 'Mijn bestaande tour' }
  const getItem = vi.fn((key: string) => (key === 'lightflow-show-v1' ? JSON.stringify(saved) : null))
  vi.stubGlobal('localStorage', { getItem })
  // Rendering the shell without effects protects the branding/storage seam, not WebGL.
  const markup = renderToStaticMarkup(<App />)
  expect(markup).toContain('LIGHTLAB')
  expect(markup).toContain('by Audiolab')
  expect(markup).toContain('Mijn bestaande tour')
  expect(markup).not.toContain('LIGHTFLOW')
  expect(markup).toContain('Ontwerpen')
  expect(markup).not.toContain('3 · Repetitie')
  expect(getItem).toHaveBeenCalledWith('lightflow-show-v1')
})

it('keeps old show-package identifiers compatible after the product rename', () => {
  const packaged = createShowPackage(initialShow, [])
  expect(packaged.format).toBe('lightflow-show')
  expect(parseShowPackage(JSON.stringify(packaged)).show).toEqual(initialShow)
})
