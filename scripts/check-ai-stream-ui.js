// Isolated browser, real local Ollama; never accept a proposal or enable output.
;async (page) => {
  const assert = (ok, message) => {
    if (!ok) throw new Error(message)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('combobox', { name: 'Wat maken we?', exact: true }).selectOption('colorProfiles')
  await page.getByRole('spinbutton', { name: 'Aantal kleurprofielen', exact: true }).fill('1')
  const before = await page.evaluate(() => localStorage.getItem('lightlab-active-package-v1'))
  await page.getByRole('button', { name: 'Maak voorstel', exact: true }).click()
  const panel = page.locator('.ai-progress')
  await panel.waitFor()
  await page.waitForFunction(
    () =>
      /Model denkt na|Voorstel wordt geschreven/.test(
        document.querySelector('.ai-progress [role="status"]')?.textContent || '',
      ),
    null,
    { timeout: 60000 },
  )
  assert((await panel.locator('details').getAttribute('open')) === null, 'Raw output must start collapsed')
  await panel.locator('summary').click()
  await panel.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'output/playwright/ai-stream-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await panel.scrollIntoViewIfNeeded()
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'No horizontal overflow on mobile',
  )
  await page.screenshot({ path: 'output/playwright/ai-stream-mobile.png' })
  assert(
    before === (await page.evaluate(() => localStorage.getItem('lightlab-active-package-v1'))),
    'Provisional output must not change show',
  )
  return 'Live local model phase observed before result; collapsed raw output, desktop/mobile and unchanged show verified. Request remains running for completion check.'
}
