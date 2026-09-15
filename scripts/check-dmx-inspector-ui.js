async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  const outputCalls = [], errors = []
  page.on('request', request => { if (request.url().includes('/output/')) outputCalls.push(request.url()) })
  page.on('pageerror', error => errors.push(error.message))
  await page.evaluate(async () => {
    const { initialShow } = await import('/src/seed.ts')
    localStorage.setItem('lightflow-show-v1', JSON.stringify(initialShow))
  })
  await page.reload()
  const open = async () => {
    await page.getByRole('button', { name: '1 · Setup', exact: true }).click()
    await page.getByRole('button', { name: 'Patch & netwerk', exact: true }).click()
    await page.locator('.dmx-inspector > summary').click()
  }
  const calculate = async () => {
    const reply = page.waitForResponse(response => response.url().endsWith('/output/inspect'))
    await page.getByRole('button', { name: 'Bereken DMX-proef', exact: true }).click()
    const response = await reply
    assert(response.status() === 200, 'Real runtime returns inspection contract')
    const data = await response.json()
    await page.locator('.dmx-inspector-result').waitFor()
    assert(data.outputSent === false && data.dryRun === true, 'Dry-run response cannot imply transmission')
    return data
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await open()
  const normal = await calculate()
  assert(!normal.issues.some(issue => issue.severity === 'error'), 'New show has encodable personalities')
  assert(normal.universes.length === 1 && normal.universes[0].fixtures.length === 19, 'All 19 fixtures compile')
  assert(normal.universes[0].fixtures.find(f => f.fixtureId === 'hazer-1').channels.length === 2, 'New hazer uses two channels')
  await page.locator('.dmx-universe > summary').first().click()
  await page.locator('.dmx-universe details > summary').first().click()
  await page.locator('.dmx-universe table').first().waitFor()
  await page.screenshot({ path: 'output/playwright/dmx-inspector-desktop.png', fullPage: true })
  await page.getByLabel('Showstand voor DMX-proef').selectOption('blackout')
  assert(await page.locator('.dmx-inspector-result').count() === 0, 'Changing input removes stale results')
  const black = await calculate()
  assert(black.universes.every(universe => universe.channels.every(value => value === 0)), 'Actual runtime zeroes every blackout channel')
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile overflow')
  await page.screenshot({ path: 'output/playwright/dmx-inspector-mobile.png', fullPage: true })
  // Legacy personality migration must not silently occupy another fixture's address.
  await page.evaluate(async () => {
    const { initialShow } = await import('/src/seed.ts')
    const show = structuredClone(initialShow)
    show.fixtures.find(f => f.id === 'hazer-1').modeId = '1ch'
    show.fixtures[0].patch.address = 78
    localStorage.setItem('lightflow-show-v1', JSON.stringify(show))
  })
  await page.reload(); await open()
  const legacy = await calculate()
  assert(legacy.universes.length === 0 && legacy.issues.some(issue => issue.code === 'unsupported-mode'), 'Unsupported saved mode fails closed')
  await page.locator('.patch-fixture').filter({ hasText: 'Hz-200 Hazer' }).click()
  await page.getByRole('combobox', { name: 'DMX-modus', exact: true }).selectOption('2ch')
  assert(await page.getByRole('button', { name: 'Patch opslaan', exact: true }).isDisabled(), 'New fan channel overlap blocks patch save')
  assert(await page.getByRole('button', { name: 'Bereken DMX-proef', exact: true }).isDisabled(), 'Dirty patch cannot be inspected as current')
  await page.getByLabel('Startadres', { exact: true }).fill('100')
  await page.getByRole('button', { name: 'Patch opslaan', exact: true }).click()
  const repaired = await calculate()
  assert(repaired.universes[0].fixtures.find(f => f.fixtureId === 'hazer-1').address === 100, 'Explicit repaired patch is used')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lightflow-show-v1')))
  assert(saved.fixtures.find(f => f.id === 'hazer-1').modeId === '2ch', 'Explicit mode correction persists')
  assert(outputCalls.length > 0 && outputCalls.every(url => url.endsWith('/output/inspect')), 'No arm or raw-frame calls occurred')
  assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`)
  await page.evaluate(() => { window.__dmxInspectorQa = 'passed' })
  return 'Real runtime inspection, all fixtures, blackout, stale input, mobile, legacy hazer correction and dirty-patch guard passed; no sends.'
}
