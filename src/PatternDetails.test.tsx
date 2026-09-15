import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PatternDetails } from './PatternDetails'
import { type Pattern, type PatternStep } from './pattern-language'

const step = (changes: Partial<PatternStep> = {}): PatternStep => ({ selection: 'moving', direction: 'bounce', envelope: 'hold', width: 2, trail: .5, level: 1, weight: 1, ...changes })

describe('visible recipe explanation', () => {
  it('explains real step content, baseline and relative shares rather than model prose', () => {
    const pattern: Pattern = { version: 1, floor: .35, steps: [step(), step({ selection: 'random', envelope: 'fade-out', width: 3, weight: 3 })] }
    const html = renderToStaticMarkup(<PatternDetails pattern={pattern} />)
    expect(html).toContain('2 stappen')
    expect(html).toContain('basisniveau 35%')
    expect(html).toContain('heen en weer')
    expect(html).toContain('breedte 2')
    expect(html).toContain('lichtstaart 50%')
    expect(html).toContain('Willekeurige lampen (3), uitdovend')
    expect(html).toContain('25% van de groepscyclus')
    expect(html).toContain('75% van de groepscyclus')
    expect(html).toContain('Geen eigen tempo of kleuren in het patroon')
    expect(html.match(/<li>/g)).toHaveLength(2)
  })
  it('renders a single step as the full group cycle without animation-owned beats', () => {
    const html = renderToStaticMarkup(<PatternDetails pattern={{ version: 1, floor: 0, steps: [step({ weight: 8, level: .7 })] }} />)
    expect(html).toContain('1 stap')
    expect(html).toContain('100% van de groepscyclus')
    expect(html).toContain('op 70%')
    expect(html).not.toContain('8 beats')
  })
})
