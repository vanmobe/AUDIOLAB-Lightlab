;async (page) => {
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const result = await page.evaluate(async () => {
    const { StageSimulator } = await import('/src/simulator.ts')
    const { initialShow } = await import('/src/seed.ts')
    const { evaluateFrame } = await import('/src/domain.ts')
    const { fixtureProfiles } = await import('/src/fixtures.ts')
    const host = document.createElement('div')
    Object.assign(host.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '900px',
      height: '600px',
      zIndex: '9999',
    })
    document.body.append(host)
    const sim = new StageSimulator(host, initialShow.fixtures, initialShow.camera)
    cancelAnimationFrame(sim.animationFrame)
    const frame = evaluateFrame(
      initialShow,
      fixtureProfiles,
      { mode: 'automation', activeLookId: initialShow.activeLookId },
      1,
    )
    const source = JSON.stringify(frame)
    const sample = (time, haze, currentFrame = frame) => {
      sim.smokeTime.value = time
      sim.update(currentFrame, { brightness: 100, haze, hiddenGroupIds: [] })
      sim.composer.render()
      const canvas = document.createElement('canvas')
      canvas.width = 900
      canvas.height = 600
      const ctx = canvas.getContext('2d')
      ctx.drawImage(sim.renderer.domElement, 0, 0, 900, 600)
      return { pixels: ctx.getImageData(0, 0, 900, 600).data, url: canvas.toDataURL() }
    }
    const delta = (a, b) => a.pixels.reduce((sum, value, i) => sum + Math.abs(value - b.pixels[i]), 0)
    const a = sample(0, 80),
      b = sample(8, 80)
    const clearDelta = delta(sample(0, 0), sample(8, 0))
    const black = {
      ...frame,
      fixtures: frame.fixtures.map((f) => ({
        ...f,
        intensity: 0,
        segments: f.segments?.map((s) => ({ ...s, intensity: 0 })),
      })),
    }
    const blackDelta = delta(sample(0, 80, black), sample(8, 80, black))
    sim.smokeTime.value = 0
    sim.previousRenderTime = 1000
    sim.render(1050)
    cancelAnimationFrame(sim.animationFrame)
    const advanced = sim.smokeTime.value
    sim.reducedMotion = { matches: true }
    sim.render(1100)
    cancelAnimationFrame(sim.animationFrame)
    const frozen = sim.smokeTime.value === advanced
    sim.reducedMotion = { matches: false }
    sim.render(100000)
    cancelAnimationFrame(sim.animationFrame)
    const bounded = sim.smokeTime.value - advanced <= 0.101
    sim.dispose()
    host.remove()
    return {
      motionDelta: delta(a, b),
      clearDelta,
      blackDelta,
      advanced,
      frozen,
      bounded,
      immutable: JSON.stringify(frame) === source,
      images: [a.url, b.url],
    }
  })
  for (let i = 0; i < result.images.length; i++) {
    await page.evaluate((url) => {
      const img = document.createElement('img')
      img.id = 'smoke-proof'
      img.src = url
      document.body.append(img)
    }, result.images[i])
    await page.locator('#smoke-proof').screenshot({ path: `output/playwright/smoke-motion-${i}.png` })
    await page.locator('#smoke-proof').evaluate((node) => node.remove())
  }
  delete result.images
  if (
    !(
      result.motionDelta > 10000 &&
      result.clearDelta === 0 &&
      result.blackDelta === 0 &&
      result.advanced > 0 &&
      result.frozen &&
      result.bounded &&
      result.immutable
    ) ||
    errors.length
  )
    throw new Error(JSON.stringify({ result, errors }))
  return result
}
