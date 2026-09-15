async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  await page.evaluate(async () => {
    const { initialShow } = await import('/src/seed.ts')
    const show = structuredClone(initialShow)
    show.controlSurface.profileId = 'wing-rack'
    show.controlSurface.bindings = [
      { id: 'qa-look', label: 'Refrein', action: 'look', targetId: show.looks[1].id, slot: { bank: 1, kind: 'button', index: 1 } },
      { id: 'qa-mode', label: 'Donker', action: 'mode', targetId: 'blackout', slot: { bank: 1, kind: 'button', index: 2 } },
      { id: 'qa-color', label: 'Kleur', action: 'color-lock', targetId: show.colorProfiles[1].id, slot: { bank: 1, kind: 'button', index: 3 } },
      { id: 'qa-group', label: 'Wash', action: 'group-intensity', targetId: 'wash', slot: { bank: 1, kind: 'rotary', index: 1 } },
    ]
    localStorage.setItem('lightflow-show-v1', JSON.stringify(show))
  })
  await page.reload()
  await page.getByRole('button', { name: '3 · Live', exact: true }).click()
  await page.locator('.live-master-disclosure > summary').click()
  await page.setViewportSize({ width: 1584, height: 1100 })
  const canvas = page.locator('.stage canvas')
  const before = await canvas.boundingBox()
  await page.getByLabel('Live knop 1: Refrein', { exact: true }).click()
  assert(await page.getByLabel('Live knop 1: Refrein').getAttribute('aria-pressed') === 'true', 'Look activates')
  await page.getByLabel('Live knop 2: Donker').click()
  await page.getByLabel('Live knop 3: Kleur').click()
  assert(await page.getByLabel('Live knop 2: Donker').getAttribute('aria-pressed') === 'true', 'Color retains blackout')
  await page.getByRole('button', { name: 'Volg Lookkleur', exact: true }).click()
  await page.getByLabel('Live draaiknop 1: Wash').fill('37')
  assert(await page.getByLabel('Wash intensity', { exact: true }).inputValue() === '0.37', 'Master synchronizes')
  assert(await page.getByLabel('Live knop 2: Donker').getAttribute('aria-pressed') === 'true', 'Master retains blackout')
  await page.getByLabel('Live WING bank').selectOption('16')
  assert(await page.getByLabel('Live knop 1: Niet toegewezen').isDisabled(), 'Empty bank disabled')
  const after = await canvas.boundingBox()
  assert(Math.abs(before.height - after.height) < 1 && Math.abs(before.width - after.width) < 1, 'Bank switch preserves canvas')
  await page.getByLabel('Live WING bank').selectOption('1')
  await page.getByLabel('Live knop 1: Refrein').click()
  await page.locator('.live-group-panel > summary').click()
  await page.getByLabel('Livegroep', { exact: true }).selectOption('wash')
  await page.locator('.live-group-links > summary').click()
  await page.locator('.live-group-links').getByRole('checkbox', { name: 'Front spots', exact: true }).check()
  await page.getByRole('button', { name: 'Koppel selectie', exact: true }).click()
  await page.getByLabel('Live draaiknop 1: Wash').fill('64')
  assert(await page.getByLabel('Front spots intensity', { exact: true }).inputValue() === '0.64', 'Linked master follows rotary')
  await page.locator('.live-group-panel > summary').click()
  await page.screenshot({ path: 'output/playwright/live-wing-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile no horizontal overflow')
  await page.screenshot({ path: 'output/playwright/live-wing-mobile.png', fullPage: true })
  await page.reload()
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('lightflow-show-v1')).groups.find(group => group.id === 'wash').intensity) === .64, 'Master persisted')
  return 'Live actions, blackout retention, color release, empty banks, linked masters, canvas stability, mobile overflow and persistence passed.'
}
