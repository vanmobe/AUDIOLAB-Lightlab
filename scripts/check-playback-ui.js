async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  const outputCalls = [], errors = []
  page.on('request', request => { if (request.url().includes('/output/')) outputCalls.push(request.url()) })
  page.on('pageerror', error => errors.push(error.message))
  const read = async () => (await page.request.get('http://127.0.0.1:5188/playback/status')).json()
  assert(!['running', 'starting'].includes((await read()).status), 'Do not interfere with an existing session')
  let ownId
  try {
    await page.evaluate(async () => {
      const { initialShow } = await import('/src/seed.ts')
      localStorage.setItem('lightflow-show-v1', JSON.stringify(initialShow))
    })
    await page.reload()
    const open = async () => {
      await page.getByRole('button', { name: '1 · Setup', exact: true }).click()
      await page.getByRole('button', { name: 'Patch & netwerk', exact: true }).click()
      await page.locator('.runtime-playback > summary').click()
    }
    const command = async action => {
      const reply = page.waitForResponse(response => response.url().endsWith('/playback/command'))
      await action()
      const response = await reply
      assert(response.status() === 200, 'Runtime command succeeds')
      return response.json()
    }
    await page.setViewportSize({ width: 1440, height: 1000 }); await open()
    const started = page.waitForResponse(response => response.url().endsWith('/playback/start'))
    await page.getByRole('button', { name: 'Start opgeslagen snapshot', exact: true }).click()
    const response = await started
    assert(response.status() === 200, 'Actual worker starts from UI')
    const first = await response.json(); ownId = first.sessionId
    await page.getByRole('button', { name: 'Tempo toepassen op runtime', exact: true }).waitFor()
    await page.getByLabel('Tempo runtimeproef', { exact: true }).fill('90')
    assert((await command(() => page.getByRole('button', { name: 'Tempo toepassen op runtime', exact: true }).click())).bpm === 90, 'BPM reaches runtime')
    assert((await command(() => page.getByRole('button', { name: 'Beeld vasthouden', exact: true }).click())).mode === 'static', 'Static reaches runtime')
    assert((await command(() => page.getByRole('button', { name: 'Blackout', exact: true }).click())).mode === 'blackout', 'Blackout reaches runtime')
    await command(() => page.getByRole('button', { name: 'Afspelen', exact: true }).click())
    await page.locator('.runtime-playback').screenshot({ path: 'output/playwright/playback-desktop.png' })
    // Unmount/reload must discover, not replace or stop, the runtime session.
    await page.reload(); await open()
    await page.getByText('Deze sessie is eerder of vanuit een ander tabblad gestart.', { exact: false }).waitFor()
    const resumed = await read()
    assert(resumed.sessionId === ownId && resumed.frameCount > first.frameCount, 'Session advances across browser reload')
    assert(await page.getByLabel('Tempo runtimeproef', { exact: true }).inputValue() === '90', 'Reconnect shows the actual runtime BPM')
    await page.setViewportSize({ width: 390, height: 844 })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile overflow')
    await page.locator('.runtime-playback').screenshot({ path: 'output/playwright/playback-mobile.png' })
    await page.getByLabel('Tempo runtimeproef', { exact: true }).fill('')
    assert((await command(() => page.getByRole('button', { name: 'Stop runtimeproef', exact: true }).click())).status === 'stopped', 'Stop works with invalid BPM')
    assert(outputCalls.length === 0, 'No hardware output endpoints called')
    assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`)
    return 'Real UI start/BPM/static/blackout/reload/stop and desktop/mobile layout passed. No physical output.'
  } finally {
    if (ownId) await page.request.post('http://127.0.0.1:5188/playback/command', { data: { version: 1, sessionId: ownId, command: 'stop' } })
  }
}
