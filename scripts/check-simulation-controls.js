async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: '3 · Live', exact: true }).click()
  const saved = await page.evaluate(() => localStorage.getItem('lightflow-show-v1'))
  const controls = page.locator('.simulation-controls:visible')
  const canvas = page.locator('.stage canvas')
  const size = await canvas.boundingBox()
  await controls.locator('summary').click()
  await controls.getByRole('button', { name: 'Herstel simulatieweergave', exact: true }).click()
  const brightness = controls.getByRole('slider', { name: /^Beeldhelderheid/ })
  await brightness.fill('50')
  await controls.getByRole('checkbox', { name: 'Wash', exact: true }).uncheck()
  assert(await controls.locator('summary').innerText().then(text => text.includes('50%') && text.includes('1 groep verborgen')), 'Collapsed summary reflects settings')
  assert(saved === await page.evaluate(() => localStorage.getItem('lightflow-show-v1')), 'Brightness and group visibility leave show unchanged')
  const after = await canvas.boundingBox()
  assert(size.width === after.width && size.height === after.height, 'Controls do not resize live canvas')
  const camera = controls.getByRole('combobox', { name: /Vast camerastandpunt/ })
  for (const name of ['Links', 'Rechts', 'Bovenaan', 'Zaal']) {
    await camera.selectOption(name)
    await page.locator('.stage-panel').screenshot({ path: `output/playwright/simulation-${name}.png` })
  }
  assert(saved === await page.evaluate(() => localStorage.getItem('lightflow-show-v1')), 'Returning to Zaal preserves all show values')
  await page.getByRole('button', { name: '2 · Ontwerp & repetitie', exact: true }).click()
  assert((await controls.locator('summary').innerText()).includes('50%'), 'Brightness shared with Look studio')
  await controls.locator('summary').click()
  await page.setViewportSize({ width: 1440, height: 800 })
  assert(await page.locator('.look-studio-preview').evaluate(node => getComputedStyle(node).position === 'static'), 'Expanded controls can scroll at limited desktop height')
  await page.getByRole('spinbutton', { name: 'Repetitietempo in BPM', exact: true }).scrollIntoViewIfNeeded()
  assert(!await controls.getByRole('checkbox', { name: 'Wash', exact: true }).isChecked(), 'Group visibility shared with Look studio')
  await controls.getByRole('button', { name: 'Alle groepen tonen', exact: true }).click()
  for (const checkbox of await controls.getByRole('checkbox').all()) await checkbox.uncheck()
  assert((await controls.locator('summary').innerText()).includes('4 groepen verborgen'), 'All-hidden state explicit')
  await controls.getByRole('button', { name: 'Alle groepen tonen', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile overflow')
  await page.locator('.look-studio-preview').screenshot({ path: 'output/playwright/simulation-controls-mobile.png' })
  await page.reload()
  await page.getByRole('button', { name: '3 · Live', exact: true }).click()
  assert((await controls.locator('summary').innerText()).includes('50%'), 'Brightness remembered after reload')
  assert((await controls.locator('summary').innerText()).includes('alle groepen zichtbaar'), 'Group hiding is temporary')

  // Independent GPU check: static evaluated frame, actual composited pixels, never hardware output.
  const pixels = await page.evaluate(async () => {
    const { StageSimulator } = await import('/src/simulator.ts')
    const { initialShow } = await import('/src/seed.ts')
    const { evaluateFrame } = await import('/src/domain.ts')
    const { fixtureProfiles } = await import('/src/fixtures.ts')
    const host = document.createElement('div')
    Object.assign(host.style, { position: 'fixed', width: '600px', height: '400px', top: '0', left: '0' })
    document.body.append(host)
    const sim = new StageSimulator(host, initialShow.fixtures, initialShow.camera)
    const frame = evaluateFrame(initialShow, fixtureProfiles, { mode: 'automation', activeLookId: initialShow.activeLookId }, 1)
    const sample = brightness => {
      sim.update(frame, { brightness, hiddenGroupIds: [] }); sim.composer.render()
      const copy = document.createElement('canvas'); copy.width = 600; copy.height = 400
      const context = copy.getContext('2d'); context.drawImage(sim.renderer.domElement, 0, 0, 600, 400)
      const data = context.getImageData(0, 0, 600, 400).data
      let total = 0; for (let i = 0; i < data.length; i += 4) total += data[i] + data[i + 1] + data[i + 2]
      return total
    }
    const full = sample(100), dim = sample(25)
    sim.dispose(); host.remove()
    return { full, dim }
  })
  assert(pixels.full > pixels.dim && pixels.dim > 0, 'Real composited pixels become darker')
  assert(errors.length === 0, errors.join('\n'))
  return { status: 'UI, persistence, group recovery, camera presets, layout, mobile and real GPU brightness passed', pixels }
}
