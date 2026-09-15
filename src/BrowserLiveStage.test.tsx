import { createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { BrowserLiveStage } from './BrowserLiveStage'
import { evaluateFrame } from './domain'
import { fixtureProfiles } from './fixtures'
import { initialShow } from './seed'
import { rehearsalPreview } from './rehearsal'

it('keeps the extracted stage explicitly simulation-only', () => {
  const rehearsal = { mode: 'automation' as const, activeLookId: initialShow.activeLookId }
  const frame = evaluateFrame(initialShow, fixtureProfiles, rehearsal, 0)
  const markup = renderToStaticMarkup(
    <BrowserLiveStage
      show={initialShow}
      stageRef={createRef<HTMLDivElement>()}
      rehearsing={false}
      displayedState={rehearsal}
      displayedShow={initialShow}
      rehearsal={rehearsal}
      preview={rehearsalPreview(initialShow, rehearsal)}
      activeLook={initialShow.looks.find((look) => look.id === initialShow.activeLookId)}
      frame={frame}
      onRetryPreview={() => {}}
      simulationControls={{
        simulationSettings: { brightness: 100, hiddenGroupIds: [] },
        onSimulationSettingsChange: () => {},
      }}
      onCameraChange={() => {}}
    />,
  )

  expect(markup).toContain('SIMULATIE')
  expect(markup).toContain('Geen fysieke DMX-output.')
})
