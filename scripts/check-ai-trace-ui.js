// One real, small request to the configured local Ollama model; no proposal acceptance.
async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: '2 · Ontwerp & repetitie', exact: true }).click()
  await page.getByRole('button', { name: 'Maak met AI', exact: true }).click()
  await page.getByRole('combobox', { name: 'Wat maken we?', exact: true }).selectOption('colorProfiles')
  await page.getByRole('spinbutton', { name: 'Aantal kleurprofielen', exact: true }).fill('1')
  await page.getByLabel('Beschrijf kleur, energie en ritme').fill('Maak één warm aards kleurprofiel voor een rustige akoestische folkband, met koperen hoofdkleur, zachte groene accentkleur, amber nevenskleur en warmwit. Geen animaties of looks.')
  const before = await page.evaluate(() => localStorage.getItem('lightlab-active-package-v1'))
  const response = page.waitForResponse(reply => reply.url().endsWith('/ai/propose'), { timeout: 930000 })
  await page.getByRole('button', { name: 'Maak voorstel', exact: true }).click()
  const reply = await response, body = await reply.json()
  assert(reply.headers()['cache-control'] === 'no-store', 'Trace must not be cached')
  assert(body.trace?.provider === 'ollama' && body.trace.attempts.length > 0, 'Real provider capture present on success or failure')
  const wire = body.trace.attempts[0]
  assert(wire.requestBody.includes('minimumCoverage') && wire.requestBody.includes('colorRoles') && wire.requestBody.includes('fixtures'), 'Actual request includes settings and setup')
  assert(wire.responseBody && wire.responseStatus, 'Raw real model response captured')
  if (!await page.locator('.ai-diagnostics').evaluate(el => el.open)) await page.locator('.ai-diagnostics > summary').click()
  await page.locator('.ai-diagnostics details > summary').first().click()
  const pres = page.locator('.ai-diagnostics pre')
  assert(await pres.first().textContent() === wire.requestBody, 'Rendered exact sent request')
  assert(await pres.nth(1).textContent() === wire.responseBody, 'Rendered exact raw response')
  await page.locator('.ai-diagnostics').screenshot({ path: 'output/playwright/ai-wire-trace-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.locator('.ai-diagnostics').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Trace wraps at mobile width')
  await page.getByRole('button', { name: 'Wis diagnose', exact: true }).click()
  assert(await page.locator('.ai-diagnostics pre').count() === 0, 'Clear removes captured text')
  assert(before === await page.evaluate(() => localStorage.getItem('lightlab-active-package-v1')), 'Diagnosis/generation does not change active show')
  return { status: reply.status(), attempts: body.trace.attempts.length, requestCharacters: wire.requestBody.length, responseCharacters: wire.responseBody.length, success: reply.ok(), note: 'Actual local Ollama wire capture/render/clear and mobile wrapping verified. Proposal not accepted.' }
}
