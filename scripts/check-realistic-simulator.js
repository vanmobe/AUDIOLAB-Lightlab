// Isolated presentation test: creates its own scene, never edits persisted show data or sends DMX.
// Run against Vite with playwright-cli run-code --filename scripts/check-realistic-simulator.js.
async (page) => {
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
  await page.goto('http://127.0.0.1:5173');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(async () => {
    const { StageSimulator } = await import('/src/simulator.ts');
    const { initialShow } = await import('/src/seed.ts');
    const { fixtureProfiles } = await import('/src/fixtures.ts');
    const { evaluateFrame } = await import('/src/domain.ts');
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    const host = document.createElement('div'); host.id = 'render-check';
    Object.assign(host.style, { position: 'fixed', inset: '20px auto auto 20px', width: '1000px', height: '650px', zIndex: '9999' });
    document.body.append(host);
    const show = structuredClone(initialShow);
    show.bandMembers = [-2, 0, 2].map((x, i) => ({ id: String(i), name: 'Bandlid ' + i, position: [x, 0, 0] }));
    show.fixtures = show.fixtures.map(f => f.groupId === 'front' ? { ...f, aim: [f.position[0] / 2, 1, 0] } : f);
    const view = new StageSimulator(host, show.fixtures, show.camera, show.bandMembers);
    const update = (mode, haze = 0) => {
      const frame = evaluateFrame(show, fixtureProfiles, { mode, activeLookId: show.activeLookId }, 1);
      frame.fixtures.forEach(f => { f.haze = haze; });
      view.update(frame);
    };
    update('automation');
    window.renderCheck = { view, host, show, update, StageSimulator };
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.locator('#render-check').screenshot({ path: 'output/playwright/realistic-stage-band.png' });
  const timing = await page.evaluate(async () => {
    const times = []; let previous = performance.now();
    for (let i = 0; i < 60; i++) await new Promise(resolve => requestAnimationFrame(now => { times.push(now - previous); previous = now; resolve(); }));
    times.sort((a, b) => a - b);
    const { renderer } = window.renderCheck.view;
    return { medianMs: times[30], p95Ms: times[57], textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries };
  });
  console.log(JSON.stringify(timing));
  await page.evaluate(value => { document.body.dataset.renderTiming = JSON.stringify(value); }, timing);
  await page.evaluate(() => window.renderCheck.update('blackout'));
  await page.locator('#render-check').screenshot({ path: 'output/playwright/realistic-blackout.png' });
  await page.evaluate(async () => {
    const { view, show } = window.renderCheck;
    const { fixtureProfiles } = await import('/src/fixtures.ts');
    const { evaluateFrame } = await import('/src/domain.ts');
    const frame = evaluateFrame(show, fixtureProfiles, { mode: 'automation', activeLookId: show.looks[1].id }, .25);
    view.update(frame);
  });
  await page.locator('#render-check').screenshot({ path: 'output/playwright/realistic-rgb.png' });
  await page.evaluate(() => { const { view, host, update } = window.renderCheck; update('automation', .8); view.setCamera({ position: [0, 4, 9], target: [0, 1.4, 0], fov: 48 }); host.style.width = '600px'; host.style.height = '350px'; });
  await page.locator('#render-check').screenshot({ path: 'output/playwright/realistic-haze.png' });
  await page.evaluate(() => { const { host, view } = window.renderCheck; view.setCamera({ position: [0, 13, 8], target: [0, 1.4, 0], fov: 48 }); host.style.width = '350px'; host.style.height = '260px'; });
  await page.locator('#render-check').screenshot({ path: 'output/playwright/realistic-small-preview.png' });
  const size = await page.locator('#render-check canvas').boundingBox();
  if (size.width !== 350 || size.height !== 260) throw new Error('Canvas does not follow host');
  const cleanup = await page.evaluate(() => {
    const { host, view, show, StageSimulator } = window.renderCheck;
    view.dispose();
    const textures = view.renderer.info.memory.textures;
    for (let i = 0; i < 3; i++) { const next = new StageSimulator(host, show.fixtures, show.camera, show.bandMembers); next.dispose(); }
    const canvases = host.querySelectorAll('canvas').length;
    host.remove(); delete window.renderCheck;
    return { textures, canvases };
  });
  if (cleanup.textures !== 0 || cleanup.canvases !== 0) throw new Error('Renderer resources retained: ' + JSON.stringify(cleanup));
  if (failures.length) throw new Error(failures.join('\n'));
}
