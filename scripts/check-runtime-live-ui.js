async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  const base = 'http://127.0.0.1:5188', errors = [], output = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (request.url().includes('/output/')) output.push(request.url()) })
  const read = async path => { const reply = await page.request.get(base + path); assert(reply.ok(), `GET ${path}: ${reply.status()}`); return reply.json() }
  assert(!['running', 'starting'].includes((await read('/playback/status')).status), 'Do not replace a user session')
  let id, commandCount = 0
  page.on('request', request => { if (request.url().endsWith('/playback/command') && request.method() === 'POST') commandCount++ })
  try {
    await page.evaluate(async () => {
      const { initialShow } = await import('/src/seed.ts')
      const { createShowPackage } = await import('/src/show-package.ts')
      const show = structuredClone(initialShow)
      show.controlSurface.bindings = [
        { id: 'test-look', label: 'Refrein', action: 'look', targetId: 'neon-chorus', slot: { bank: 1, kind: 'button', index: 1 } },
        { id: 'test-black', label: 'Donker', action: 'mode', targetId: 'blackout', slot: { bank: 1, kind: 'button', index: 2 } },
        { id: 'test-color', label: 'Kleur', action: 'color-lock', targetId: 'neon', slot: { bank: 1, kind: 'button', index: 3 } },
        { id: 'test-master', label: 'Wash', action: 'group-intensity', targetId: 'wash', slot: { bank: 1, kind: 'rotary', index: 1 } },
      ]
      for (const fixture of show.fixtures) if (fixture.groupId === 'front') fixture.patch.universe = 2
      show.routes.push({ id: 'test-second', universe: 2, protocol: 'sacn', host: '', enabled: false })
      localStorage.setItem('lightlab-active-package-v1', JSON.stringify(createShowPackage(show, [])))
    })
    await page.reload()
    const initialStored = await page.evaluate(() => localStorage.getItem('lightlab-active-package-v1'))
    const open = async () => { await page.getByRole('button', { name: '3 · Live', exact: true }).click(); await page.getByRole('button', { name: 'Lokale runtime', exact: true }).click() }
    const ready = () => page.waitForFunction(() => { const el = document.querySelector('.runtime-live-controls'); return el && !el.disabled })
    const command = async action => {
      await ready()
      const reply = page.waitForResponse(response => response.url().endsWith('/playback/command'))
      await action()
      const response = await reply; assert(response.status() === 200, `Command ${response.status()}`)
      await ready()
      return read(`/playback/preview?sessionId=${id}`)
    }
    await page.setViewportSize({ width: 1440, height: 1000 }); await open()
    const starting = page.waitForResponse(response => response.url().endsWith('/playback/start'))
    await page.getByRole('button', { name: 'Start huidige show in runtime', exact: true }).click()
    const started = await starting; assert(started.status() === 200, 'Runtime starts')
    id = (await started.json()).sessionId
    await ready(); await page.locator('.runtime-live .stage canvas').waitFor()
    const firstCanvas = await page.locator('.runtime-live .stage canvas').boundingBox()
    await page.getByLabel('Live runtime BPM', { exact: true }).fill('97')
    assert((await command(() => page.getByRole('button', { name: 'Tempo toepassen', exact: true }).click())).status.bpm === 97, 'Runtime owns BPM')
    assert((await command(() => page.getByLabel('Live knop 1: Refrein', { exact: true }).click())).status.lookId === 'neon-chorus', 'WING look command')
    await page.locator('.runtime-live .live-group-panel > summary').click()
    await page.getByLabel('Livegroep', { exact: true }).selectOption('wash')
    await page.locator('.runtime-live .live-group-links > summary').click()
    await page.locator('.runtime-live .live-group-links').getByRole('checkbox', { name: 'Front spots', exact: true }).check()
    assert((await command(() => page.getByRole('button', { name: 'Koppel selectie', exact: true }).click())).controls.links[0].includes('front'), 'Link stored runtime-side')
    const mastered = await command(async () => { await page.getByLabel('Live draaiknop 1: Wash', { exact: true }).fill('37'); await page.getByLabel('Live draaiknop 1: Wash', { exact: true }).press('Tab') })
    assert(mastered.groupIntensities.wash === .37 && mastered.groupIntensities.front === .37, 'Linked rotary changes both runtime masters')
    const slider = page.getByLabel('Live draaiknop 1: Wash', { exact: true })
    await slider.scrollIntoViewIfNeeded()
    const box = await slider.boundingBox(), beforeDrag = commandCount
    await page.mouse.move(box.x + box.width * .37, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * .82, box.y + box.height / 2, { steps: 14 })
    assert(commandCount === beforeDrag && !(await slider.isDisabled()), 'Continuous drag stays interactive without intermediate commands')
    const dragReply = page.waitForResponse(response => response.url().endsWith('/playback/command'))
    await page.mouse.up()
    assert((await dragReply).status() === 200, 'Completed drag commits once')
    await ready()
    const dragged = await read(`/playback/preview?sessionId=${id}`)
    assert(commandCount === beforeDrag + 1 && dragged.groupIntensities.wash > .75 && dragged.groupIntensities.front === dragged.groupIntensities.wash, 'Final linked drag value reaches runtime')
    await command(async () => { await slider.fill('37'); await slider.press('Tab') })
    await page.locator('.runtime-live .group-timing-controls > summary').click()
    await command(() => page.getByLabel('Groepsduur in beats', { exact: true }).selectOption('8'))
    const timed = await command(() => page.getByLabel('Groepsoffset preset', { exact: true }).selectOption('2'))
    assert(timed.controls.overrides.wash.rateBeats === 8 && timed.controls.overrides.front.offsetBeats === 2, 'Linked timing/offset reach runtime')
    // Compare one received atomic frame with the shared source engine at exactly its server beat.
    const parity = await page.evaluate(async id => {
      const [{ evaluateFrame }, { playbackLivePreview }, { fixtureProfiles }] = await Promise.all([import('/src/domain.ts'), import('/src/playback-live-state.ts'), import('/src/fixtures.ts')])
      const snapshot = await (await fetch(`http://127.0.0.1:5188/playback/show?sessionId=${id}`)).json()
      const p = await (await fetch(`http://127.0.0.1:5188/playback/preview?sessionId=${id}`)).json()
      const input = playbackLivePreview(snapshot.show, { mode: p.status.mode, activeLookId: p.status.lookId }, p)
      const expected = evaluateFrame(input.show, fixtureProfiles, input.state, p.frame.atBeats)
      const normalize = frame => frame.fixtures.map(f => ({ ...f, segments: f.segments ?? [] }))
      return JSON.stringify(normalize(expected)) === JSON.stringify(normalize(p.frame))
    }, id)
    assert(parity, 'Runtime frames exactly match shared group/timing engine')
    await command(() => page.getByLabel('Live knop 2: Donker', { exact: true }).click())
    const colored = await command(() => page.getByLabel('Live knop 3: Kleur', { exact: true }).click())
    assert(colored.status.mode === 'blackout' && colored.colorLockId === 'neon', 'Color does not resume blackout')
    const black = await read(`/playback/frame?sessionId=${id}`)
    assert(black.inspection.universes.length === 2 && black.inspection.universes.every(u => u.channels.every(x => x === 0)), 'Both universes remain black')
    const old = await read(`/playback/preview?sessionId=${id}`)
    const reset = await command(() => page.getByLabel('Live knop 1: Refrein', { exact: true }).click())
    assert(reset.colorLockId === null && Object.keys(reset.controls.overrides).length === 0 && reset.controls.links.length === 1 && reset.groupIntensities.wash === .37, 'Look resets overrides/color but keeps masters/links')
    const conflict = await page.request.post(base + '/playback/command', { data: { version: 1, sessionId: id, command: 'live', expectedRevision: old.revision, controls: old.controls, groupIntensities: old.groupIntensities, colorLockId: old.colorLockId } })
    assert(conflict.status() === 409, 'Stale control update cannot undo new Look')
    const invalid = await page.request.post(base + '/playback/command', { data: { version: 1, sessionId: id, command: 'live', expectedRevision: reset.revision, controls: reset.controls, groupIntensities: reset.groupIntensities, colorLockId: 'unknown-palette' } })
    assert(invalid.status() === 400 && (await read(`/playback/preview?sessionId=${id}`)).revision === reset.revision, 'Invalid reference is rejected without fault or state mutation')
    const snapshotResponse = await page.request.get(base + `/playback/show?sessionId=${id}`)
    assert(snapshotResponse.headers()['cache-control'] === 'no-store', 'Full snapshot is not browser-cacheable')
    assert(await page.evaluate(() => localStorage.getItem('lightlab-active-package-v1')) === initialStored, 'Runtime edits never change saved show')
    await page.locator('.runtime-live .live-group-panel > summary').click()
    const lastCanvas = await page.locator('.runtime-live .stage canvas').boundingBox()
    assert(Math.abs(firstCanvas.width - lastCanvas.width) < 1 && Math.abs(firstCanvas.height - lastCanvas.height) < 1, 'Control changes keep preview geometry stable')
    await page.screenshot({ path: 'output/playwright/runtime-live-desktop.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile has no horizontal overflow')
    await page.screenshot({ path: 'output/playwright/runtime-live-mobile.png', fullPage: true })
    // Fault injection is viewer-only: runtime continues, no stale or substitute canvas is displayed.
    await page.route('**/playback/preview?*', route => route.abort())
    await page.getByRole('heading', { name: 'Geen actueel runtimebeeld', exact: true }).waitFor()
    assert(await page.locator('.runtime-live .stage canvas').count() === 0, 'Disconnect removes stale renderer')
    assert((await read('/playback/status')).status === 'running', 'Viewer failure does not stop runtime')
    await page.unroute('**/playback/preview?*')
    await page.getByRole('button', { name: 'Verbind met runtimesessie', exact: true }).click(); await ready()
    await page.reload(); await open()
    await page.getByRole('button', { name: 'Verbind met runtimesessie', exact: true }).click(); await ready()
    assert((await read('/playback/status')).sessionId === id, 'Reload reconnects same session')
    await page.waitForFunction(() => document.querySelector('[aria-label="Live runtime BPM"]')?.value === '97')
    await page.getByLabel('Live runtime BPM', { exact: true }).fill('')
    const stopped = page.waitForResponse(response => response.url().endsWith('/playback/command'))
    await page.getByRole('button', { name: 'Stop runtimesessie', exact: true }).click()
    assert((await stopped).status() === 200 && (await read('/playback/status')).status === 'stopped', 'Stop remains reachable with invalid tempo')
    assert(output.length === 0, 'No physical-output endpoint called')
    assert(errors.length === 0, `Unexpected browser errors: ${errors.join('; ')}`)
    return 'Runtime Live actual-frame parity, WING actions, linked masters/timing, CAS, two-universe blackout, immutable storage, disconnect/reconnect/reload and desktop/mobile passed.'
  } finally {
    await page.unroute('**/playback/preview?*')
    if (id) await page.request.post(base + '/playback/command', { data: { version: 1, sessionId: id, command: 'stop' } })
  }
}
