async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  const saved = await page.evaluate(() => localStorage.getItem('lightlab-active-package-v1'))
  const controls = page.locator('.simulation-controls:visible')
  await controls.locator('summary').click()
  const haze = controls.getByRole('slider', { name: /^Rook \/ haze/ })
  for (const amount of [0, 35, 100]) {
    await haze.fill(String(amount))
    assert((await controls.locator('summary').innerText()).includes(`rook ${amount}%`), 'Haze summary follows slider')
    await page.locator('.stage-panel').screenshot({ path: `output/playwright/haze-${amount}.png` })
  }
  await haze.focus()
  await page.keyboard.press('ArrowLeft')
  assert(await haze.inputValue() === '95', 'Keyboard adjusts haze')
  await page.getByRole('button', { name: '2 · Ontwerp & repetitie', exact: true }).click()
  assert((await controls.locator('summary').innerText()).includes('rook 95%'), 'Haze shared with Look studio')
  await page.setViewportSize({ width: 390, height: 844 })
  await controls.locator('summary').click()
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile controls fit')
  await controls.screenshot({ path: 'output/playwright/haze-controls-mobile.png' })
  await page.reload()
  await page.getByRole('button', { name: '3 · Live', exact: true }).click()
  assert((await controls.locator('summary').innerText()).includes('rook 95%'), 'Preference survives reload')
  await controls.locator('summary').click()
  await controls.getByRole('button', { name: 'Herstel simulatieweergave', exact: true }).click()
  assert(await controls.getByRole('slider', { name: /^Rook \/ haze/ }).inputValue() === '35', 'Reset restores moderate haze')
  assert(saved === await page.evaluate(() => localStorage.getItem('lightlab-active-package-v1')), 'Viewer haze never changes show package')
  assert(errors.length === 0, errors.join('\n'))
  return { status: 'Haze range, keyboard, shared previews, persistence, reset, show isolation and mobile passed' }
}
