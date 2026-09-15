// Explicit cloud smoke test in an isolated browser with the public seed show only.
// Never accepts a proposal, touches hardware, or reads user browser storage.
async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Ververs modellen', exact: true }).click()
  const model = page.getByRole('combobox', { name: 'Copilot-model', exact: true })
  await page.waitForFunction(() => !document.querySelector('[aria-label="Copilot-model"]')?.disabled, null, { timeout: 30000 })
  assert(await model.inputValue() === '', 'Model must be explicitly selected')
  assert(!await model.locator('option[value="auto"]').count(), 'No automatic routing in model comparison')
  await model.selectOption('gpt-5-mini')
  const submit = page.getByRole('button', { name: 'Maak voorstel', exact: true })
  assert(await submit.isDisabled(), 'Cloud generation requires acknowledgement')
  await page.getByRole('checkbox', { name: 'Ik wil deze ontwerpgegevens via Copilot verwerken.' }).check()
  await page.getByRole('combobox', { name: 'Wat maken we?', exact: true }).selectOption('colorProfiles')
  await page.getByRole('spinbutton', { name: 'Aantal kleurprofielen', exact: true }).fill('1')
  await page.locator('.assistant-heading').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'output/playwright/copilot-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile overflow')
  await page.screenshot({ path: 'output/playwright/copilot-mobile.png' })
  const before = await page.evaluate(() => localStorage.getItem('lightlab-active-package-v1'))
  await submit.click()
  await page.waitForFunction(() => document.querySelector('.proposal-review') || document.querySelector('.design-assistant [role="alert"]'), null, { timeout: 60000 })
  const errors = await page.locator('.design-assistant [role="alert"]').allTextContents()
  assert(errors.length === 0, errors.join('; '))
  assert(await page.locator('.proposal-review').isVisible(), 'Validated proposal appears')
  assert(before === await page.evaluate(() => localStorage.getItem('lightlab-active-package-v1')), 'Cloud proposal never mutates show')
  return { model: 'gpt-5-mini', validatedProposal: true, unchangedShow: true, mobileOverflow: false }
}
