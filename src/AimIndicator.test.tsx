import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AimIndicator } from './AimIndicator'
import { initialShow } from './seed'
import { aimFixtures, aimPresets } from './stage-operations'

it.each(['forward', 'left-up', 'right-down', 'up'])('shows arrow projections for %s', id => {
  const fixtures = aimFixtures(initialShow.fixtures.slice(0, 2), initialShow.fixtures.slice(0, 2).map(f => f.id), aimPresets.find(p => p.id === id)!)
  const markup = renderToStaticMarkup(<AimIndicator fixtures={fixtures} />)
  expect(markup).toContain('Hoogte en bundelrichting')
  expect(markup).toContain('ZIJAANZICHT')
  expect(markup).toContain('VANUIT DE ZAAL')
  expect(markup).toContain('marker-end=')
  expect(markup).not.toContain('NaN')
})
