import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LookStudio } from './LookStudio'
import { initialShow } from './seed'

const defaults = { onChange: () => {}, bpm: 120, onBpmChange: () => {}, onSelectLook: () => {} }

describe('combined Look studio', () => {
  it('places the saved Look editor beside a preview with one Look picker and temporary tempo', () => {
    const html = renderToStaticMarkup(
      <LookStudio {...defaults} show={initialShow} selectedLookId={initialShow.looks[0].id} />,
    )
    expect(html).toContain('Look bewerken en repeteren')
    expect(html.match(/aria-label="Look in de studio"/g)).toHaveLength(1)
    expect(html).toContain('Repetitietempo in BPM')
    expect(html).toContain('min="30" max="240"')
    expect(html).toContain('Alleen voor dit voorbeeld · geen live-uitvoer')
    expect(html).toContain('Groepen in deze Look')
    expect(html).not.toContain('Bekijk deze Look in repetitie')
  })
  it('falls back to a valid Look when the old selection has disappeared', () => {
    const html = renderToStaticMarkup(<LookStudio {...defaults} show={initialShow} selectedLookId="removed" />)
    expect(html).toContain(`Simulatie van ${initialShow.looks[0].name}`)
  })
  it('provides a concise desktop Look list with search for larger libraries and the same selected Look', () => {
    const looks = Array.from({ length: 7 }, (_, index) => ({
      ...initialShow.looks[0],
      id: `look-${index}`,
      name: `Look ${index + 1}`,
    }))
    const html = renderToStaticMarkup(
      <LookStudio {...defaults} show={{ ...initialShow, looks }} selectedLookId="look-3" />,
    )
    expect(html).toContain('aria-label="Looks in de studio"')
    expect(html).toContain('aria-label="Zoek studio-Look"')
    expect(html).toContain('aria-pressed="true">Look 4</button>')
    expect(html).toContain('Simulatie van Look 4')
    expect(html).toContain('look-studio-mobile-picker')
  })
  it('omits search for a short Look list', () => {
    const html = renderToStaticMarkup(
      <LookStudio
        {...defaults}
        show={{ ...initialShow, looks: initialShow.looks.slice(0, 6) }}
        selectedLookId={initialShow.looks[0].id}
      />,
    )
    expect(html).not.toContain('Zoek studio-Look')
  })
  it('offers a clear empty state without tempo or dangling group controls', () => {
    const html = renderToStaticMarkup(
      <LookStudio {...defaults} show={{ ...initialShow, looks: [] }} selectedLookId="removed" />,
    )
    expect(html).toContain('Maak eerst een Look')
    expect(html).not.toContain('Repetitietempo in BPM')
  })
  it('keeps a Look without groups editable and explains how to populate it', () => {
    const html = renderToStaticMarkup(
      <LookStudio {...defaults} show={{ ...initialShow, groups: [] }} selectedLookId={initialShow.looks[0].id} />,
    )
    expect(html).toContain('Voeg eerst groepen toe')
    expect(html).toContain('Lookkleur')
  })
})
