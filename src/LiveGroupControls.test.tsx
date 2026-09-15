import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { commonLayerValue, LiveGroupControls } from './LiveGroupControls'
import { emptyLiveControls, linkLiveGroups, updateLiveGroups } from './live-controls'
import { initialShow } from './seed'
import { resolveLookLayers, type RuntimeMode } from './domain'

function render(controls = emptyLiveControls(), mode: RuntimeMode = 'automation', show = initialShow) {
  return renderToStaticMarkup(<LiveGroupControls show={show} state={{ mode, activeLookId: show.activeLookId }} controls={controls} onChange={() => {}} />)
}

describe('live group controls', () => {
  it('labels selected scope, temporary level and the per-group Look load action', () => {
    const html = render()
    expect(html).toContain('Je bedient: Front spots')
    expect(html).toContain('Lookniveau (tijdelijk)')
    expect(html).toContain('Live groepslook laden')
    expect(html).toContain('haar eigen deel')
    expect(html.match(/aria-label="Live groepsgedrag"/g)).toHaveLength(1)
  })

  it('shows differences in linked groups rather than taking the first value', () => {
    const show = { ...initialShow, activeLookId: 'neon-pulse' }
    const controls = linkLiveGroups(show, emptyLiveControls(), ['front', 'wash'])
    const html = render(controls, 'automation', show)
    expect(html).toContain('Samen bedienen: Front spots + Wash')
    expect(html).toContain('Gemengd')
    expect(html).toContain('Een deel van deze groepen staat uit')
    expect(html).toContain('Bestaande koppelingen worden samengevoegd')
  })

  it('distinguishes mixed levels and fixed versus following palettes', () => {
    const layers = resolveLookLayers(initialShow, initialShow.looks[0])
    expect(commonLayerValue(layers, 'intensity')).toBe(1)
    expect(commonLayerValue([{ ...layers[0], intensity: 0.2 }, layers[1]], 'intensity')).toBe('__mixed__')
    expect(commonLayerValue([{ ...layers[0], colorProfileId: 'warm' }, layers[1]], 'colorProfileId')).toBe('__mixed__')
  })

  it.each(['blackout', 'safety', 'static'] as const)('shows retained edits notice during %s without callbacks', mode => {
    const controls = updateLiveGroups(initialShow, emptyLiveControls(), 'front', { intensity: 0.4 })
    const html = render(controls, mode)
    expect(html).toContain('deze bediening hervat de show niet')
    expect(html).toContain('Live aangepast')
    expect(html).toContain('40%')
  })

  it('handles no Looks or groups without bogus mixed ranges', () => {
    const noLooks = render(emptyLiveControls(), 'automation', { ...initialShow, looks: [] })
    expect(noLooks).toContain('Maak eerst een Look')
    expect(noLooks).not.toContain('Infinity')
    expect(noLooks).not.toContain('type="range"')
    expect(render(emptyLiveControls(), 'automation', { ...initialShow, groups: [] })).toContain('Voeg eerst groepen toe')
  })
})
