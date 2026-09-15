// Requires the local app and Ollama-configured companion; does not generate or save a proposal.
// Run with playwright-cli run-code --filename scripts/check-design-alignment.js.
// Real layout assertions protect against multiline hints shifting controls; SSR cannot measure this.
async (page) => {
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button', { name: '2 · Ontwerp & repetitie' }).click();
  await page.getByRole('button', { name: 'Maak met AI', exact: true }).click();
  await page.getByRole('combobox', { name: 'Ollama-model', exact: true }).waitFor();
  for (const width of [1584, 1280, 900, 760, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const result = await page.evaluate(() => {
      const errors = [];
      const rows = [...document.querySelectorAll('.assistant-options')];
      for (const row of rows) {
        const fields = [...row.querySelectorAll(':scope > label')].map(label => ({
          label: label.getBoundingClientRect(),
          control: label.querySelector('input,select').getBoundingClientRect(),
        }));
        for (const field of fields) {
          for (const other of fields.filter(other => Math.abs(other.label.top - field.label.top) < 1)) {
            if (Math.abs(other.control.top - field.control.top) > 1 || Math.abs(other.control.bottom - field.control.bottom) > 1) errors.push('Controls in the same row are misaligned');
          }
        }
        const button = row.querySelector(':scope > button')?.getBoundingClientRect();
        if (button && innerWidth > 650 && fields.some(field => Math.abs(field.control.top - button.top) > 1 || Math.abs(field.control.bottom - button.bottom) > 1)) errors.push('Action button is misaligned');
      }
      if (document.documentElement.scrollWidth > innerWidth) errors.push('Horizontal page overflow');
      return { width: innerWidth, errors, rows: rows.length };
    });
    if (result.errors.length) throw new Error(JSON.stringify(result));
    console.log(JSON.stringify(result));
    await page.locator('.design-assistant').screenshot({ path: `output/playwright/design-alignment-${width}.png` });
  }
}
