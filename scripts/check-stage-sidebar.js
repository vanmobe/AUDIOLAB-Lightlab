// Use an isolated browser session: playwright-cli run-code --filename scripts/check-stage-sidebar.js.
// Checks actual map geometry, not just markup: opening tools must not push the stage down.
async (page) => {
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button', { name: '1 · Setup', exact: true }).click();
  const toolbar = page.locator('.stage-toolbar');
  const geometry = () => page.locator('#stage-map').evaluate(el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height };
  });
  for (const width of [1584, 1024, 800, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const before = await geometry();
    for (const name of ['Bandlid toevoegen', 'Selecteren', 'Weergave', 'Groepen beheren']) {
      await toolbar.getByRole('button', { name, exact: true }).click();
      if (await page.locator('.stage-inspector > .stage-tool-panel').count() !== 1) throw new Error('Tool is not inside sidebar');
      const after = await geometry();
      if (Object.keys(before).some(key => Math.abs(before[key] - after[key]) > 1)) throw new Error(`${width}/${name}: stage moved ${JSON.stringify({ before, after })}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (overflow) throw new Error(`${width}/${name}: horizontal overflow`);
    }
    await page.getByRole('button', { name: 'Gereedschap sluiten', exact: true }).click();
    await toolbar.getByRole('button', { name: 'Weergave', exact: true }).click();
    await page.locator('.stage-editor').screenshot({ path: `output/playwright/stage-sidebar-${width}.png` });
    await page.getByRole('button', { name: 'Gereedschap sluiten', exact: true }).click();
  }
  await page.setViewportSize({ width: 1584, height: 1000 });
  await toolbar.getByRole('button', { name: 'Selecteren', exact: true }).click();
  await page.getByRole('button', { name: 'Alle lampen', exact: true }).click();
  const count = await page.locator('.map-fixture').count();
  if (await page.locator('.map-fixture.selected').count() !== count) throw new Error('Batch selection failed');
  await page.getByRole('button', { name: 'Gereedschap sluiten', exact: true }).click();
  await page.getByRole('combobox', { name: /^Hoogte/ }).waitFor({ state: 'visible' });
  if (await page.locator('.map-fixture.selected').count() !== count) throw new Error('Closing tool cleared selection');
}
