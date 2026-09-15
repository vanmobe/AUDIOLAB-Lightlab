import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { RuntimeAudioPanel } from './RuntimeAudioPanel'

it('requires explicit WAV connection and keeps physical arming separate', () => {
  const html = renderToStaticMarkup(<RuntimeAudioPanel sessionId="session" running sourceRef={{ current: null }} />)
  expect(html).toContain('Koppel WAV aan runtime')
  expect(html).toContain('Schakel eerst fysieke uitvoer uit')
  expect(html).toContain('Ontkoppel audio &amp; schakel uitvoer uit')
  expect(html).toContain('Geen automatisch hervatten')
  expect(html).toContain('Native Dante/audio-ingang')
})
