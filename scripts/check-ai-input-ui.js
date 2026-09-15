// Isolated test browser. Inject one invalid transport field; no model invocation or show changes.
async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  const before = await page.evaluate(() => localStorage.getItem('lightlab-active-package-v1'))
  await page.getByRole('spinbutton', { name: 'Aantal kleurprofielen', exact: true }).fill('1.5')
  const submit = page.getByRole('button', { name: 'Maak voorstel', exact: true })
  assert(await submit.isDisabled(), 'Invalid active count must block submit')
  await page.getByRole('combobox', { name: 'Wat maken we?', exact: true }).selectOption('programs')
  assert(await submit.isEnabled(), 'Inactive bad draft must not block another scope')
  let sent
  await page.route('**/ai/propose', async route => {
    sent = route.request().postDataJSON()
    assert(sent.options.profileCount === 0 && sent.options.lookCount === 0, 'Wire excludes invalid hidden drafts')
    // Reach the real runtime parser without invoking Ollama: simulate one bad active field in transit.
    const injected = { ...sent, options: { ...sent.options, programCount: 1.5 } }
    const response = await route.fetch({ postData: JSON.stringify(injected) })
    assert(response.status() === 400, 'Runtime rejects malformed active count')
    const result = await response.json()
    assert(result.code === 'invalid_ai_request' && result.stage === 'request' && !result.trace, 'Failure is explicitly pre-provider')
    await route.fulfill({ response })
  })
  try {
    await submit.click()
    await page.getByRole('alert').filter({ hasText: 'Aantal animaties is ongeldig' }).waitFor()
    assert((await page.getByRole('alert').textContent()).includes('niet naar het AI-model'), 'User can locate the problem and knows AI was not called')
    await page.locator('.assistant-submit').scrollIntoViewIfNeeded()
    await page.screenshot({ path: 'output/playwright/ai-input-error-desktop.png' })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('.assistant-submit').scrollIntoViewIfNeeded()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile overflow')
    await page.screenshot({ path: 'output/playwright/ai-input-error-mobile.png' })
    await page.getByRole('combobox', { name: 'Wat maken we?', exact: true }).selectOption('all')
    assert(await page.getByRole('spinbutton', { name: 'Aantal kleurprofielen', exact: true }).inputValue() === '1.5', 'Draft remains available to correct')
    assert(await submit.isDisabled(), 'Returning to bad active draft blocks submit')
    assert(before === await page.evaluate(() => localStorage.getItem('lightlab-active-package-v1')), 'Error never mutates stored show')
    assert(errors.length === 0, errors.join('; '))
    return 'Hidden draft normalization, real runtime field-specific400, pre-provider feedback, preserved show, desktop/mobile: passed. No AI invocation.'
  } finally { await page.unroute('**/ai/propose') }
}
