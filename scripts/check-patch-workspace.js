// Isolated browser only: edits fixture patch and route settings in that session's local show.
// playwright-cli run-code --filename scripts/check-patch-workspace.js
async (page) => {
  const outputRequests = [];
  page.on('request', request => { if (request.url().includes('/output/')) outputRequests.push(request.url()); });
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button', { name: '1 · Setup', exact: true }).click();
  await page.getByRole('button', { name: 'Patch & netwerk', exact: true }).click();
  await page.setViewportSize({ width: 1584, height: 1000 });
  await page.locator('.patch-fixture').first().click();
  const inspector = page.locator('.patch-inspector');
  await inspector.getByLabel('Startadres', { exact: true }).fill('5');
  if (!await inspector.getByRole('button', { name: 'Patch opslaan' }).isDisabled()) throw new Error('Overlap is not blocked');
  await inspector.getByLabel('Startadres', { exact: true }).fill('510');
  if (!await inspector.getByRole('button', { name: 'Patch opslaan' }).isDisabled()) throw new Error('Channel overflow is not blocked');
  await inspector.getByLabel('Startadres', { exact: true }).fill('300');
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('.patch-fixture').nth(1).click();
  if (await inspector.getByLabel('Startadres', { exact: true }).inputValue() !== '300') throw new Error('Cancelled switch lost draft');
  await inspector.getByRole('button', { name: 'Patch opslaan' }).click();
  await page.getByRole('combobox', { name: 'Groepeer op' }).selectOption('universe');
  if (await page.locator('.patch-group').count() !== 1) throw new Error('Universe grouping failed');
  await page.locator('.patch-studio').screenshot({ path: 'output/playwright/patch-desktop.png' });
  await page.getByRole('button', { name: 'Universes & netwerk', exact: true }).click();
  await page.getByRole('button', { name: 'Universe met route toevoegen', exact: true }).click();
  const route = page.locator('.patch-route').last();
  await route.getByRole('combobox', { name: 'Protocol', exact: true }).selectOption('sacn');
  await route.getByLabel('Bestemming (IP of hostnaam)', { exact: true }).fill('192.168.0.51');
  await route.getByRole('button', { name: 'Route opslaan', exact: true }).click();
  await page.locator('.patch-studio').screenshot({ path: 'output/playwright/patch-network.png' });
  await page.reload();
  await page.getByRole('button', { name: '1 · Setup', exact: true }).click();
  await page.getByRole('button', { name: 'Patch & netwerk', exact: true }).click();
  await page.locator('.patch-fixture').first().click();
  if (await inspector.getByLabel('Startadres', { exact: true }).inputValue() !== '300') throw new Error('Patch not persisted');
  await page.getByRole('button', { name: 'Universes & netwerk', exact: true }).click();
  if (await page.locator('.patch-route').last().getByRole('combobox', { name: 'Protocol', exact: true }).inputValue() !== 'sacn') throw new Error('Route not persisted');
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Network overflows');
    await page.getByRole('button', { name: 'Fixturepatch', exact: true }).click();
    await page.locator('.patch-fixture').nth(1).click();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Patch overflows');
    await inspector.screenshot({ path: `output/playwright/patch-inspector-${width}.png` });
    await page.getByRole('button', { name: 'Universes & netwerk', exact: true }).click();
  }
  if (outputRequests.length) throw new Error('Patch editor called hardware output');
}
