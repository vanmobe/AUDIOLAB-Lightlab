;async (page) => {
  const assert = (ok, message) => {
    if (!ok) throw new Error(message)
  }
  await page.addInitScript(() => {
    if (location.search.includes('audit=storage')) {
      const read = Storage.prototype.getItem
      Storage.prototype.getItem = function (key) {
        if (key.startsWith('lightflow-')) throw new DOMException('Blocked for QA', 'SecurityError')
        return read.call(this, key)
      }
    }
    if (location.search.includes('audit=gpu')) {
      window.__auditBlockGpu = true
      const getContext = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        if (window.__auditBlockGpu && kind.startsWith('webgl')) return null
        return getContext.call(this, kind, ...args)
      }
    }
  })
  await page.goto('http://127.0.0.1:5173/?audit=storage')
  await page.getByText('Lokale opslag is niet toegankelijk.', { exact: false }).waitFor()
  assert(
    await page.getByRole('button', { name: '1 · Setup', exact: true }).isVisible(),
    'Storage failure retains the app',
  )
  await page.screenshot({ path: 'output/playwright/audit-storage.png', fullPage: true })
  await page.goto('http://127.0.0.1:5173/?audit=gpu')
  await page.getByRole('button', { name: '3 · Live', exact: true }).click()
  await page.getByRole('button', { name: '3D-weergave opnieuw starten', exact: true }).waitFor()
  assert(await page.getByRole('button', { name: 'Blackout', exact: true }).isVisible(), 'GPU failure retains controls')
  await page.screenshot({ path: 'output/playwright/audit-gpu-failure.png', fullPage: true })
  await page.evaluate(() => {
    window.__auditBlockGpu = false
  })
  await page.getByRole('button', { name: '3D-weergave opnieuw starten', exact: true }).click()
  await page.locator('.stage canvas').waitFor()
  assert(
    (await page.getByRole('button', { name: '3D-weergave opnieuw starten', exact: true }).count()) === 0,
    'GPU retry clears error',
  )
  await page.screenshot({ path: 'output/playwright/audit-gpu-recovered.png', fullPage: true })
  await page.evaluate(() => {
    window.__reviewRecoveryQa = 'passed'
  })
  return 'Storage denial retains app; WebGL failure is localized; retry restores canvas without losing controls.'
}
