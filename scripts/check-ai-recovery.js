// Isolated browser transport fixtures: never sends a generation request to a real model.
;async (page) => {
  const assert = (ok, message) => {
    if (!ok) throw new Error(message)
  }
  const requests = []
  await page.route('http://127.0.0.1:5188/ai/status', (route) =>
    route.fulfill({ json: { provider: 'ollama', model: 'test-local', aiConfigured: true } }),
  )
  await page.route('http://127.0.0.1:5188/ai/models', (route) =>
    route.fulfill({ json: { models: ['test-local'], defaultModel: 'test-local' } }),
  )
  await page.route('http://127.0.0.1:5188/ai/propose', async (route) => {
    const request = route.request().postDataJSON()
    requests.push(request)
    if (requests.length === 1)
      return route.fulfill({
        status: 502,
        json: {
          error: 'Voorstel afgewezen: Dubbel animatierecept: naam, snelheid, kleur of groep maken geen nieuw patroon.',
        },
      })
    return route.fulfill({
      json: {
        provider: 'ollama',
        model: 'test-local',
        summary: 'Een uniek testpatroon na correctie.',
        colorProfiles: [],
        looks: [],
        programs: [
          {
            id: 'recovery-pattern',
            name: 'Spiegelstaart',
            effect: 'chase',
            rateBeats: 1,
            defaultColorProfileId: request.show.colorProfiles[0].id,
            targetGroupIds: [request.show.groups[0].id],
            pattern: {
              version: 1,
              floor: 0.3,
              steps: [
                {
                  selection: 'moving',
                  direction: 'inward',
                  envelope: 'fade-out',
                  width: 1,
                  trail: 0.6,
                  level: 1,
                  weight: 1,
                },
              ],
            },
          },
        ],
      },
    })
  })
  await page.reload()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: '2 · Ontwerp & repetitie', exact: true }).click()
  await page.getByRole('button', { name: 'Maak met AI', exact: true }).click()
  await page.getByRole('combobox', { name: 'Wat maken we?', exact: true }).selectOption('programs')
  await page.getByRole('spinbutton', { name: 'Aantal animaties', exact: true }).fill('1')
  const before = await page.evaluate(() => localStorage.getItem('lightflow-show-v1'))
  await page.getByRole('button', { name: 'Maak voorstel', exact: true }).click()
  const retry = page.getByRole('button', { name: 'Opnieuw met correctie', exact: true })
  await retry.waitFor()
  assert(await retry.isEnabled(), 'Duplicate error offers enabled recovery')
  assert(
    before === (await page.evaluate(() => localStorage.getItem('lightflow-show-v1'))),
    'Rejection leaves show intact',
  )
  await page.locator('.design-assistant').screenshot({ path: 'output/playwright/ai-duplicate-recovery.png' })
  await retry.click()
  await page.getByRole('heading', { name: 'Bekijk je voorstel', exact: true }).waitFor()
  assert(
    requests.length === 2 && requests[1].intent.includes('minder unieke patronen'),
    'Retry adds targeted correction without a loop',
  )
  assert(
    JSON.stringify(requests[0].options) === JSON.stringify(requests[1].options) &&
      requests[1].model === requests[0].model,
    'Chosen counts, scope and model retained',
  )
  assert(
    before === (await page.evaluate(() => localStorage.getItem('lightflow-show-v1'))),
    'Corrected proposal still requires acceptance',
  )
  await page.getByRole('button', { name: 'Accepteer en bewaar versie', exact: true }).click()
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('lightflow-show-v1')))
  assert(
    after.programs.some((program) => program.id === 'recovery-pattern'),
    'Corrected proposal can be accepted',
  )
  return 'Duplicate rejection → corrective retry → preview → accept passed; no real model request or hardware output.'
}
