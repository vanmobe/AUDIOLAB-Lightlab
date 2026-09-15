import { expect, test } from '@playwright/test'

test('saves, rehearses and exports a show without contacting playback or output APIs', async ({ page }) => {
  const outputRequests: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.includes('/playback/') || path.includes('/output/')) outputRequests.push(`${request.method()} ${path}`)
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Nieuwe lichtshow' })).toBeVisible()

  await page.locator('.show-menu > summary').click()
  await page.getByRole('button', { name: /Versie bewaren/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Versie opgeslagen om' })).toBeVisible()

  await page.getByRole('button', { name: 'Ontwerpen', exact: true }).click()
  await page.getByRole('button', { name: 'Testlab', exact: true }).click()
  await expect(page.getByText('SIMULATIE', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Conceptsimulatie: kleur, intensiteit, chase en haze. Geen fysieke DMX-output.', { exact: true }),
  ).toBeVisible()

  await page.getByLabel('Animatie uitproberen').selectOption({ label: 'Pulse' })
  await expect(page.getByText('Losse animatie actief:', { exact: false })).toBeVisible()

  await page.locator('.show-menu > summary').click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Show exporteren', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('nieuwe-lichtshow.lightflow.json')
  await expect(page.getByRole('status').filter({ hasText: 'Showpakket gedownload.' })).toBeVisible()
  expect(outputRequests).toEqual([])
})
