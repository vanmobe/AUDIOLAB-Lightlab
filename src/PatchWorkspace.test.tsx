import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PatchWorkspace } from './PatchWorkspace'
import { initialShow } from './seed'

it('starts with grouped overview, honest output status and no open editing forms', () => {
  const html = renderToStaticMarkup(<PatchWorkspace show={initialShow} onChange={() => {}} />)
  expect(html).toContain('Wash')
  expect(html).toContain('Front spots')
  expect(html).toContain('1–4')
  expect(html).toContain('geen live output')
  expect(html).not.toContain('Patch opslaan')
  expect(html).toContain('Selecteer een fixture')
  expect(html).not.toContain('DMX-proef')
  expect(html).not.toContain('Autonome runtimeproef')
})

it('identifies both conflicting rows without blocking the overview', () => {
  const fixtures = initialShow.fixtures.slice(0, 2).map(fixture => ({ ...fixture, patch: { universe: 1, address: 1 } }))
  const html = renderToStaticMarkup(<PatchWorkspace show={{ ...initialShow, fixtures }} onChange={() => {}} />)
  expect(html).toContain('Overlap met ADJ TriPar 1')
  expect(html).toContain('Overlap met ADJ TriPar 2')
})
