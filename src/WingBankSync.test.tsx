import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { WingBankSync } from './WingBankSync'
import { initialShow } from './seed'

describe('WING sync side panel', () => {
  it('starts read-only with configurable address, explicit bank selection and no implicit traffic', () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    try {
      const html = renderToStaticMarkup(<WingBankSync show={initialShow} initialBank={3} />)
      expect(html).toContain('Synchroniseren met WING')
      expect(html).toContain('value="10.0.0.10"')
      expect(html).toContain('Bank 16')
      expect(html).toContain('Huidige bank (3)')
      expect(html).toContain('aparte MIDI-verbinding')
      expect(html).not.toContain('Verstuur bevestigde wijzigingen')
      expect(html).toContain('aria-haspopup="dialog" aria-expanded="false"')
      expect(html).toContain('<dialog')
      expect(html).not.toContain('<dialog open')
      expect(fetcher).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it('explicitly discloses Compact unsupported without offering bank selection', () => {
    const show = { ...initialShow, controlSurface: { ...initialShow.controlSurface, profileId: 'wing-compact' } }
    const html = renderToStaticMarkup(<WingBankSync show={show} initialBank={1} />)
    expect(html).toContain('Compact USER-indeling is nog niet ondersteund')
    expect(html).not.toContain('Alle banken</button>')
    expect(html).not.toContain('Verstuur bevestigde wijzigingen')
  })
})
