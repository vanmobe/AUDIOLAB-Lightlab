import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { LiveLookLibrary } from './LiveLookLibrary'
import { initialShow } from './seed'

it('keeps the current Look visible and exposes an independently queued next Look', () => {
  const html = renderToStaticMarkup(<LiveLookLibrary show={initialShow} activeLookId={initialShow.activeLookId} currentLookId={initialShow.activeLookId} armedLookId="neon-chorus" onArm={vi.fn()} onSelect={vi.fn()} />)
  expect(html).toContain('NU ACTIEF')
  expect(html).toContain('Start klaar:')
  expect(html).toContain('Neon chorus')
  expect(html).toContain('Zet volgende Look klaar')
  expect(html).toContain('Volg bibliotheekvolgorde')
  expect(html).toContain('value="neon-chorus" selected=""')
})

it('labels a retained Look accurately while blackout is active', () => {
  const html = renderToStaticMarkup(<LiveLookLibrary show={initialShow} activeLookId={initialShow.activeLookId} currentLookId={initialShow.activeLookId} mode="blackout" onArm={vi.fn()} onSelect={vi.fn()} />)
  expect(html).toContain('LAATSTE LOOK · BLACKOUT')
  expect(html).toContain('Start en hef blackout op:')
  expect(html).not.toContain('NU ACTIEF')
})
