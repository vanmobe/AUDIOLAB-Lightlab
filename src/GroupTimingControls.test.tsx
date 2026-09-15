import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { commonTiming, GroupTimingControls, layerAnimationLabel, validOffset } from './GroupTimingControls'
import { initialShow } from './seed'
import { resolveLookLayers } from './domain'

const layer = resolveLookLayers(initialShow, initialShow.looks[1])[0]

describe('group timing controls', () => {
  it('normalizes omitted and explicit default timing while retaining real mixed values', () => {
    expect(commonTiming([layer, { ...layer, rateBeats: null }], 'rateBeats')).toBe('__mixed__')
    expect(commonTiming([layer, { ...layer, offsetBeats: 0 }], 'offsetBeats')).toBe(0)
    expect(commonTiming([layer, { ...layer, rateBeats: 2 }], 'rateBeats')).toBe('__mixed__')
    expect(commonTiming([layer, { ...layer, offsetBeats: -1 }], 'offsetBeats')).toBe('__mixed__')
  })

  it('preserves custom imported values rather than rounding to presets', () => {
    const html = renderToStaticMarkup(
      <GroupTimingControls
        show={initialShow}
        layers={[{ ...layer, rateBeats: 3.375, offsetBeats: -1.234 }]}
        onChange={() => {}}
      />,
    )
    expect(html).toContain('value="3.375" selected=""')
    expect(html).toContain('3.375 beats (aangepast)')
    expect(html).toContain('value="-1.234"')
    expect(html).toContain('min="-64" max="64"')
  })

  it('shows effective duration and signed beat offset without changing the source program', () => {
    const program = initialShow.programs[1]
    expect(layerAnimationLabel(program, { ...layer, rateBeats: 4, offsetBeats: 0.5 })).toContain(
      '4 beats · offset +0.5 beats',
    )
    expect(layerAnimationLabel(program, { ...layer, offsetBeats: -2 })).toContain('offset -2 beats')
    expect(layerAnimationLabel(program, layer)).not.toContain('offset')
    expect(program.rateBeats).toBe(0.5)
  })

  it.each(['', ' ', 'no', 'Infinity', '-64.1', '64.1'])('rejects invalid offset %j', (value) => {
    expect(validOffset(value)).toBeUndefined()
  })

  it.each([-64, -0.125, 0, 0.12345, 64])('accepts exact offset %s without rounding', (value) => {
    expect(validOffset(String(value))).toBe(value)
  })

  it('explains retained inactive timing and mixed selections without invoking changes', () => {
    let changes = 0
    const html = renderToStaticMarkup(
      <GroupTimingControls
        show={initialShow}
        layers={[
          { ...layer, mode: 'off' },
          { ...layer, rateBeats: 8, offsetBeats: 1 },
        ]}
        onChange={() => {
          changes++
        }}
      />,
    )
    expect(html).toContain('Gemengd')
    expect(html).toContain('timing niet actief')
    expect(html).toContain('wijzigen schakelt geen animatie in')
    expect(html).toContain('Geen startvertraging')
    expect(changes).toBe(0)
  })
})
