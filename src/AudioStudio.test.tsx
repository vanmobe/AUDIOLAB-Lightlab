import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { AudioStudio } from './AudioStudio'
import { initialShow } from './seed'
it('explains local-only audio and offers source, detection and group controls', () => {
  const html = renderToStaticMarkup(<AudioStudio show={initialShow} />)
  expect(html).toContain('geen DMX-uitvoer')
  expect(html).toContain('type="file"')
  expect(html).toContain('Analyseer opnieuw')
  expect(html).toContain('Puls bij elke kick')
  expect(html).toContain('Uitgeschakelde Look-groepen blijven uit')
  expect(html).not.toContain('autoplay')
})
it('offers tempo and kick follow in Live without a second stage or Look selector', () => {
  const html = renderToStaticMarkup(
    <AudioStudio show={initialShow} live selectedLiveLookId={initialShow.activeLookId} />,
  )
  expect(html).toContain('Live-simulatie volgt deze WAV')
  expect(html).toContain('Stabiel tempo')
  expect(html).toContain('Losse kicks')
  expect(html).not.toContain('Lichtshow op de WAV-tijdlijn')
  expect(html).not.toContain('<label>Look<select')
})
