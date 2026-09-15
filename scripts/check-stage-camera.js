;async (page) => {
  const assert = (ok, message) => {
    if (!ok) throw new Error(message)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: '1 · Setup', exact: true }).click()
  await page.getByRole('button', { name: /^Selecteer groep Wash \(/ }).click()
  const selected = await page.locator('.map-fixture[aria-pressed=true]').count()
  const saved = await page.evaluate(() => localStorage.getItem('lightflow-show-v1'))
  const marker = page.getByRole('button', { name: /^Camerastandpunt:/ })
  const bounds = () =>
    page.locator('.stage-map').evaluate((node) => {
      const r = node.getBoundingClientRect()
      return { top: r.top + scrollY, height: r.height }
    })
  const before = await bounds()
  await marker.focus()
  await marker.press('Enter')
  assert(
    (await page.getByRole('button', { name: 'Zaal', exact: true }).getAttribute('aria-pressed')) === 'true',
    'Camera opens view controls',
  )
  assert((await page.locator('.map-fixture[aria-pressed=true]').count()) === selected, 'Camera retains selection')
  assert(
    saved === (await page.evaluate(() => localStorage.getItem('lightflow-show-v1'))),
    'Opening camera does not mutate show',
  )
  assert(JSON.stringify(before) === JSON.stringify(await bounds()), 'Sidebar keeps map stable')
  for (const label of ['Dichtbij', 'Overzicht', 'Zaal']) {
    await page.getByRole('button', { name: label, exact: true }).click()
    assert((await marker.getAttribute('aria-label')).includes(label), 'Marker follows preset')
    assert(
      (await page.getByRole('button', { name: label, exact: true }).getAttribute('aria-pressed')) === 'true',
      'Preset selected',
    )
  }
  await page.locator('.stage-workspace').screenshot({ path: 'output/playwright/stage-camera.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile overflow')
  assert((await marker.boundingBox()).width === 32, 'Camera remains compact')
  await page.locator('.stage-workspace').screenshot({ path: 'output/playwright/stage-camera-mobile.png' })
  await page.getByRole('button', { name: 'Gereedschap sluiten', exact: true }).click()
  await page.getByText('Geavanceerd: doelpunt op vloer', { exact: true }).click()
  await page.getByRole('button', { name: 'Klik een doelpunt', exact: true }).click()
  const beforeAim = await page.evaluate(() => localStorage.getItem('lightflow-show-v1'))
  await marker.click()
  assert(
    beforeAim === (await page.evaluate(() => localStorage.getItem('lightflow-show-v1'))),
    'Camera click does not aim fixtures at the marker',
  )
  assert(
    (await page.getByRole('button', { name: 'Annuleren', exact: true }).count()) === 0,
    'Camera cancels targeting tool',
  )
  return 'Camera keyboard activation, retained selection, unchanged show on open, stable map, presets, floor-target safety, desktop and mobile passed.'
}
