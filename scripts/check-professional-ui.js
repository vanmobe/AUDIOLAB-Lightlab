async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.evaluate(async () => { const { initialShow } = await import('/src/seed.ts'); localStorage.setItem('lightflow-show-v1', JSON.stringify(initialShow)) })
  await page.reload()
  const nav = name => page.getByRole('navigation', { name: 'Showworkflow', exact: true }).getByRole('button', { name, exact: true }).click()
  const check = async name => {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow`)
    await page.screenshot({ path: `output/playwright/pro-${name}.png`, fullPage: true })
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width > 500 ? 1000 : 844 })
    await nav('Start'); await check(`home-${width}`)
    await nav('1 · Setup'); await check(`stage-${width}`)
    assert(await page.locator('.map-fixture').first().evaluate(element => getComputedStyle(element).borderRadius) === '50%', 'Stage fixture markers retain their circular shape')
    await page.getByRole('button', { name: 'Patch & netwerk', exact: true }).click(); await check(`patch-${width}`)
    await page.getByRole('button', { name: 'Bediening & audio', exact: true }).click(); await check(`wing-${width}`)
    await nav('2 · Ontwerp & repetitie'); await page.getByRole('button', { name: /^Looks ·/ }).click(); await check(`studio-${width}`)
    await page.getByRole('button', { name: 'Maak met AI', exact: true }).click(); await check(`ai-${width}`)
    await nav('3 · Live'); await check(`live-${width}`)
    await page.getByRole('button', { name: 'Blackout', exact: true }).click()
    assert(await page.getByRole('button', { name: 'Blackout', exact: true }).getAttribute('aria-pressed') === 'true', 'Blackout exposes active state')
    await page.getByRole('button', { name: 'Show afspelen', exact: true }).click()
    await page.locator('.show-menu > summary').click()
    assert(await page.getByRole('button', { name: 'Show exporteren', exact: true }).isVisible(), 'File actions available in Live')
    await page.keyboard.press('Escape')
    assert(await page.locator('.show-menu').getAttribute('open') === null, 'Escape closes Show menu')
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await nav('1 · Setup')
  await page.getByRole('button', { name: 'Patch & netwerk', exact: true }).click()
  await page.locator('.patch-fixture').first().click()
  const address = page.locator('.patch-address input').last()
  await address.fill('200')
  page.once('dialog', dialog => dialog.dismiss())
  await nav('3 · Live')
  assert(await page.locator('main').getAttribute('data-workspace') === 'patch', 'Cancel keeps dirty patch open')
  assert(await address.inputValue() === '200', 'Draft retained on cancel')
  page.once('dialog', dialog => dialog.accept())
  await nav('3 · Live')
  assert(await page.locator('main').getAttribute('data-workspace') === 'live', 'Confirm leaves patch')
  await page.evaluate(async () => {
    const { initialShow } = await import('/src/seed.ts')
    const show = structuredClone(initialShow)
    show.name = 'Lange showtitel voor de tour — een uitgebreide repetitiesessie met de volledige band'
    show.looks = Array.from({ length: 32 }, (_, i) => ({ ...show.looks[0], id: `look-${i}`, name: `Look ${i + 1} — lange naam voor de liveset` }))
    show.activeLookId = 'look-0'
    show.controlSurface.bindings = []
    localStorage.setItem('lightflow-show-v1', JSON.stringify(show))
  })
  await page.reload(); await nav('3 · Live')
  await page.getByRole('searchbox', { name: 'Zoek een Look' }).fill('Look 32')
  assert(await page.locator('.live-look-library .look').count() === 1, 'Search filters 32 Looks')
  await page.locator('.live-look-library .look').click()
  assert(await page.locator('.live-look-library .look').getAttribute('aria-pressed') === 'true', 'Filtered Look activates')
  await page.setViewportSize({ width: 390, height: 844 }); await check('long-names-390')
  assert(errors.length === 0, `Runtime errors: ${errors.join('; ')}`)
  await page.evaluate(() => { window.__professionalUiQa = 'passed' })
  return 'All seven workspaces at desktop/mobile, Show menu/Escape, blackout, dirty patch leave/cancel and 32-Look search passed.'
}
