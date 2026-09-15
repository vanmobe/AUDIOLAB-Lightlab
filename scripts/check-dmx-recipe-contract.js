async (page) => {
  await page.goto('http://127.0.0.1:5173')
  const result = await page.evaluate(async () => {
    const { initialShow } = await import('/src/seed.ts')
    const { inspectionRequest, inspectDmx } = await import('/src/dmx-inspection.ts')
    const { assertShowDocument } = await import('/src/show-validation.ts')
    const show = structuredClone(initialShow)
    // A real recipe produces one-segment frame entries for ordinary PARs, not just TRI heads.
    show.programs[0].pattern = {
      version: 1, floor: .2,
      steps: [{ selection: 'moving', direction: 'bounce', envelope: 'hold', width: 1, trail: .4, level: 1, weight: 1 }],
    }
    assertShowDocument(show)
    const body = inspectionRequest(show, show.looks[0].id, 'automation', .375, 'browser-real-recipe')
    const one = body.frame.fixtures.filter(fixture => fixture.segments?.length === 1)
    const four = body.frame.fixtures.filter(fixture => fixture.segments?.length === 4)
    if (!one.length || !four.length) throw new Error('Fixture does not exercise both single and multi-head recipes')
    const health = () => fetch('http://127.0.0.1:5188/health').then(response => response.json())
    if ((await health()).armed) throw new Error('Do not test against armed runtime')
    const encoded = await inspectDmx(body, new AbortController().signal)
    if ((await health()).armed || encoded.outputSent) throw new Error('Inspection affected output state')
    if (encoded.issues.some(issue => issue.severity === 'error')) throw new Error(JSON.stringify(encoded.issues))
    const rows = new Map(encoded.universes.flatMap(universe => universe.fixtures).map(fixture => [fixture.fixtureId, fixture]))
    const rgb = output => [1, 3, 5].map(start => Math.round(parseInt(output.color.slice(start, start + 2), 16) * output.intensity))
    for (const output of [...one, ...four]) {
      const physical = show.fixtures.find(fixture => fixture.id === output.fixtureId)
      const channels = rows.get(output.fixtureId).channels
      const expected = physical.profileId === 'varytec-theater-spot-100'
        ? [Math.round(output.intensity * 255), 0]
        : output.segments.length === 4 ? [...output.segments.flatMap(rgb), 0, 255]
        : [...rgb(output), 0]
      if (JSON.stringify(channels) !== JSON.stringify(expected)) throw new Error(`Recipe mismatch: ${output.fixtureId}`)
    }
    return { oneHeadFixtures: one.length, fourHeadFixtures: four.length, universes: encoded.universes.length, outputSent: encoded.outputSent }
  })
  console.log(JSON.stringify(result))
}
