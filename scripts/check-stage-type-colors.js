// Run from Setup / Podium in an isolated playwright-cli session.
async (page) => {
  await page.setViewportSize({ width: 1584, height: 1000 });
  const readColors = () => page.locator('.map-fixture').evaluateAll(nodes => nodes.map(node => ({
    kind: node.dataset.fixtureKind, color: getComputedStyle(node).backgroundColor,
  })));
  const before = await readColors();
  const types = [...new Set(before.map(item => item.kind))];
  const colors = types.map(kind => {
    const values = [...new Set(before.filter(item => item.kind === kind).map(item => item.color))];
    if (values.length !== 1) throw new Error('Same type has different colors');
    return values[0];
  });
  if (types.length !== 4 || new Set(colors).size !== 4) throw new Error('Fixture types are not visually distinct');
  const fixture = page.locator('.map-fixture').first();
  await fixture.focus();
  await fixture.press('Enter');
  if (await fixture.getAttribute('aria-pressed') !== 'true') throw new Error('Selection failed');
  if (JSON.stringify(await readColors()) !== JSON.stringify(before)) throw new Error('Selection hid type color');
  await page.locator('.stage-editor').screenshot({ path: 'output/playwright/stage-type-colors.png' });
  await page.setViewportSize({ width: 390, height: 900 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile overflow');
  await page.locator('.stage-workspace').screenshot({ path: 'output/playwright/stage-type-colors-mobile.png' });
}
