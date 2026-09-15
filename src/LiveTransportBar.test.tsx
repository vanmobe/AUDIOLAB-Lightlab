import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { LiveTransportBar } from './LiveTransportBar'

it('labels the actual destination and keeps mode buttons pending-fenced without disabling explicit stop', () => {
  const html = renderToStaticMarkup(<LiveTransportBar target="Lokale runtime" lookName="Blue set" mode="static" safetyLabel="Alleen front" disabled onMode={() => {}}><button>Stop sessie</button></LiveTransportBar>)
  expect(html).toContain('Lokale runtime')
  expect(html).toContain('Blue set')
  expect(html.match(/disabled=""/g)).toHaveLength(4)
  expect(html).toContain('<button>Stop sessie</button>')
  expect(html).toContain('aria-pressed="true"')
})
it('renders extra desktop actions outside a closed disclosure', () => {
  const html = renderToStaticMarkup(<LiveTransportBar target="Simulatie" lookName="Blue" safetyLabel="Front" onMode={() => {}} onShortcutHelp={() => {}}><button>Naar DMX-bediening</button></LiveTransportBar>)
  expect(html).toContain('Toetsen')
  expect(html).toContain('Naar DMX-bediening')
  expect(html).not.toContain('<details')
})
