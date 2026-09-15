import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StageEditor } from './StageEditor'
import { initialShow } from './seed'
import { fixtureProfiles } from './fixtures'

it('identifies each fixture by its catalog type and renders the matching legend without changing the show', () => {
  const before = JSON.stringify(initialShow)
  const markup = renderToStaticMarkup(<StageEditor show={initialShow} onChange={() => { throw new Error('Rendering must not change show colors') }} />)
  for (const profile of fixtureProfiles) {
    const count = initialShow.fixtures.filter(fixture => fixture.profileId === profile.id).length
    expect(markup.match(new RegExp(`data-fixture-kind="${profile.kind}"`, 'g'))).toHaveLength(count + 1)
    expect(markup).toContain(profile.model)
  }
  expect(markup).toContain('niet de uitgestraalde lichtkleur')
  expect(JSON.stringify(initialShow)).toBe(before)
})

it('opens the podium without selecting the first fixture or exposing irrelevant editors', () => {
  const markup = renderToStaticMarkup(<StageEditor show={initialShow} onChange={() => {}} />)
  expect(markup).not.toContain('map-fixture selected')
  expect(markup).not.toContain('Montagehoogte')
  expect(markup).not.toContain('Achteruit omlaag')
  expect(markup).not.toContain('Naam of instrument')
  expect(markup).toContain('Selecteer')
  expect(markup).toContain('>Bandlid toevoegen</button>')
  expect(markup).not.toContain('>Toevoegen</button>')
})

it('keeps placed fixtures and band members accessible without duplicating edit forms', () => {
  const show = { ...initialShow, bandMembers: [{ id: 'singer', name: 'Zang', position: [0, 0, 0] as [number, number, number] }] }
  const markup = renderToStaticMarkup(<StageEditor show={show} onChange={() => {}} />)
  expect(markup).toContain('Bandlid Zang')
  expect(markup).toContain(initialShow.fixtures[0].name)
  expect(markup).not.toContain('Naam bandlid Zang')
  expect(markup).not.toContain('Groepsnaam Front spots')
})
