;async (page) => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message)
  }
  const errors = [],
    writes = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes(':5188/')) writes.push(request.url())
  })
  const readShow = () => page.evaluate(() => JSON.parse(localStorage.getItem('lightlab-active-package-v1')).show)
  const original = await readShow()
  const panel = page.getByRole('region', { name: 'Banken automatisch vullen', exact: true })
  await page.setViewportSize({ width: 1440, height: 1100 })
  await panel.getByRole('combobox', { name: 'Volgorde', exact: true }).selectOption('character')
  await panel.locator('summary').click()
  for (const [name, value] of [
    ['Warm static', 'calm'],
    ['Neon chorus', 'movement'],
    ['Neon pulse', 'energetic'],
  ]) {
    await panel.getByRole('combobox', { name: `Karakter van ${name}`, exact: true }).selectOption(value)
  }
  await panel.getByRole('button', { name: 'Bekijk bankindeling', exact: true }).click()
  assert(await panel.getByRole('alert').isVisible(), 'One bank cannot silently mix three character categories')
  assert(
    (await panel.getByRole('button', { name: 'Pas bankindeling toe', exact: true }).count()) === 0,
    'Capacity error has no apply',
  )
  assert(JSON.stringify(await readShow()) === JSON.stringify(original), 'Preview/error never mutates show')
  for (const bank of [3, 6]) await panel.getByRole('checkbox', { name: `Vul bank ${bank}`, exact: true }).check()
  await panel.getByRole('combobox', { name: 'Vaste groep draaiknop 1', exact: true }).selectOption('wash')
  await panel.getByRole('combobox', { name: 'Vaste groep draaiknop 2', exact: true }).selectOption('front')
  await panel.getByRole('button', { name: 'Bekijk bankindeling', exact: true }).click()
  assert((await panel.getByRole('alert').count()) === 0, 'Three banks fit all categories')
  assert(JSON.stringify(await readShow()) === JSON.stringify(original), 'Ready proposal still does not mutate')
  await panel.screenshot({ path: 'output/playwright/bank-autofill-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal mobile overflow')
  await panel.screenshot({ path: 'output/playwright/bank-autofill-mobile.png' })
  await panel.getByRole('button', { name: 'Pas bankindeling toe', exact: true }).click()
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem('lightlab-active-package-v1')).show.controlSurface.bindings.some(
      (binding) => binding.slot?.bank === 6,
    ),
  )
  const applied = await readShow()
  const surface = applied.controlSurface
  assert(
    surface.bankNames['1'] === 'Rustig' &&
      surface.bankNames['3'] === 'In beweging' &&
      surface.bankNames['6'] === 'Energiek',
    'Named category banks',
  )
  for (const bank of [1, 3, 6]) {
    assert(
      surface.bindings.some(
        (binding) =>
          binding.slot?.bank === bank &&
          binding.slot.kind === 'rotary' &&
          binding.slot.index === 1 &&
          binding.targetId === 'wash',
      ),
      'Same R1 across banks',
    )
    assert(
      surface.bindings.some(
        (binding) =>
          binding.slot?.bank === bank &&
          binding.slot.kind === 'rotary' &&
          binding.slot.index === 2 &&
          binding.targetId === 'front',
      ),
      'Same R2 across banks',
    )
  }
  const stripSurface = (show) => {
    const { controlSurface, ...rest } = show
    return rest
  }
  assert(
    JSON.stringify(stripSurface(applied)) === JSON.stringify(stripSurface(original)),
    'Show/patch/masters remain identical',
  )
  await page.getByRole('button', { name: 'Ongedaan maken', exact: true }).click()
  await page.waitForFunction(
    (surface) =>
      JSON.stringify(JSON.parse(localStorage.getItem('lightlab-active-package-v1')).show.controlSurface) === surface,
    JSON.stringify(original.controlSurface),
  )
  // Reapply in existing order for persistence/live parity without triggering any Look or rotary.
  await page.getByRole('button', { name: 'Banken automatisch vullen', exact: true }).click()
  await panel.getByRole('button', { name: 'Bekijk bankindeling', exact: true }).click()
  await panel.getByRole('button', { name: 'Pas bankindeling toe', exact: true }).click()
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('lightlab-active-package-v1')).show.controlSurface.bindings.filter(
        (b) => b.slot?.kind === 'button',
      ).length === 3,
  )
  await page.reload()
  await page.getByRole('button', { name: '3 · Live', exact: true }).click()
  assert(await page.getByRole('button', { name: /^Live knop 1:/ }).isEnabled(), 'Persisted auto mapping is live usable')
  assert(writes.length === 0 && errors.length === 0, JSON.stringify({ writes, errors }))
  return {
    status:
      'Capacity, review-before-apply, character overrides, noncontiguous banks, fixed rotaries, undo, persistence, live mapping, mobile and no runtime writes passed',
  }
}
