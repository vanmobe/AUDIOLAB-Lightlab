import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { animationForLayer, editLookLayer, LookEditor, lookLayerSummary } from './LookEditor'
import { initialShow } from './seed'
import { resolveLookLayers } from './domain'

describe('Look group editor', () => {
  it('embeds the selected Look directly without a collapsed card or navigation away', () => {
    const html = renderToStaticMarkup(
      <LookEditor embedded show={initialShow} look={initialShow.looks[0]} onChange={() => {}} />,
    )
    expect(html).toContain('aria-label="Bewerk Look Warm static"')
    expect(html).toContain('Front spots Lookniveau')
    expect(html).not.toContain('Bekijk deze Look in repetitie')
    expect(html).not.toContain('design-card look-editor')
  })
  it('materializes legacy group behavior without changing untouched groups or input', () => {
    const look = initialShow.looks[2]
    const before = resolveLookLayers(initialShow, look)
    const edited = editLookLayer(initialShow, look, 'front', { mode: 'static', programId: null, intensity: 0.9 })
    expect(look.layers).toBeUndefined()
    expect(edited.layers?.find((layer) => layer.groupId === 'front')).toMatchObject({ mode: 'static', intensity: 0.9 })
    expect(edited.layers?.filter((layer) => layer.groupId !== 'front')).toEqual(
      before.filter((layer) => layer.groupId !== 'front'),
    )
  })

  it('keeps fixed palettes and levels when changing another group', () => {
    const original = editLookLayer(initialShow, initialShow.looks[0], 'front', {
      colorProfileId: 'warm',
      intensity: 0.4,
    })
    const edited = editLookLayer(initialShow, original, 'wash', { mode: 'off', programId: null })
    expect(edited.layers?.find((layer) => layer.groupId === 'front')).toEqual(
      original.layers?.find((layer) => layer.groupId === 'front'),
    )
  })

  it('summarizes layers by actual behavior, never AI animation names', () => {
    const summary = lookLayerSummary(initialShow, initialShow.looks[1])
    expect(summary).toContain('Front spots:')
    expect(summary).toContain('Effects / haze:')
    expect(summary).not.toContain('Chorus chase')
    expect(summary).toContain('100%')
    expect(summary).toContain('Lookkleur: Neon violet')
  })

  it('chooses actual motion for animation mode while preserving an existing moving pattern', () => {
    const layer = resolveLookLayers(initialShow, initialShow.looks[0])[0]
    expect(animationForLayer(initialShow, layer)?.effect).not.toBe('static')
    expect(animationForLayer(initialShow, { ...layer, programId: 'pulse' })?.id).toBe('pulse')
    expect(
      animationForLayer(
        { ...initialShow, programs: initialShow.programs.filter((program) => program.effect === 'static') },
        layer,
      ),
    ).toBeUndefined()
  })

  it('shows fixed group palettes separately from the overall Look palette', () => {
    const look = editLookLayer(initialShow, initialShow.looks[1], 'front', {
      mode: 'static',
      colorProfileId: 'warm',
      intensity: 0.4,
    })
    expect(lookLayerSummary(initialShow, look)).toContain('40% (Warm amber, vast)')
    expect(lookLayerSummary(initialShow, look)).toContain('Lookkleur: Neon violet')
  })

  it('keeps an existing static animation visible without offering a new one', () => {
    const show = { ...initialShow, programs: initialShow.programs.filter((program) => program.effect === 'static') }
    const look = editLookLayer(show, show.looks[0], 'front', { mode: 'animation', programId: 'ambient' })
    const html = renderToStaticMarkup(<LookEditor show={show} look={look} onChange={() => {}} onPreview={() => {}} />)
    expect(html).toContain('value="animation" disabled="" selected=""')
    expect(html).toContain('value="ambient" selected=""')
    expect(html).toContain('Maak eerst een bewegend patroon')
  })

  it('renders a compact accessible group selector and contextual inspector', () => {
    const html = renderToStaticMarkup(
      <LookEditor show={initialShow} look={initialShow.looks[0]} onChange={() => {}} onPreview={() => {}} />,
    )
    expect(html).toContain('<summary>')
    expect(html).toContain('aria-label="Groepen in deze Look"')
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html).toContain('Front spots Lookniveau')
    expect(html).toContain('Volgt Lookkleur / kleurwissel')
  })
})
