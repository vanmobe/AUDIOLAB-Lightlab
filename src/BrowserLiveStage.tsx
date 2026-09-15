import type { RefObject } from 'react'
import { CoverageStatus } from './CoverageStatus'
import { animationLabel, type EvaluatedFrame, type RuntimeState, type ShowDocument } from './domain'
import type { LookTransitionStatus } from './look-transitions'
import { rehearsalPreview, type RehearsalState } from './rehearsal'
import { SimulationControls, type SimulationControlProps } from './SimulationControls'
import { stageCameraMarker } from './stage-camera'
import { LiveStageOverlay } from './LiveStageOverlay'
import { TransitionStatus } from './TransitionStatus'

interface BrowserLiveStageProps {
  show: ShowDocument
  stageRef: RefObject<HTMLDivElement | null>
  rehearsing: boolean
  displayedState: RuntimeState
  displayedShow: ShowDocument
  rehearsal: RehearsalState
  preview: ReturnType<typeof rehearsalPreview>
  activeLook?: ShowDocument['looks'][number]
  frame: EvaluatedFrame
  transition?: LookTransitionStatus
  previewError?: string
  onRetryPreview: () => void
  simulationControls: Required<Pick<SimulationControlProps, 'simulationSettings' | 'onSimulationSettingsChange'>>
  onCameraChange: (camera: ShowDocument['camera']) => void
}

/**
 * Browser-only stage presentation for Live and Testlab. The parent owns evaluated
 * state and simulator lifecycle so this component cannot activate runtime output.
 */
export function BrowserLiveStage({
  show,
  stageRef,
  rehearsing,
  displayedState,
  displayedShow,
  rehearsal,
  preview,
  activeLook,
  frame,
  transition,
  previewError,
  onRetryPreview,
  simulationControls,
  onCameraChange,
}: BrowserLiveStageProps) {
  return (
    <div className={rehearsing ? undefined : 'live-stage-column'}>
      <div className="stage-panel">
        <div className="stage-label">
          <span>{stageCameraMarker(show.camera).label}</span>
          <span>
            {displayedState.mode === 'automation'
              ? rehearsing
                ? `${rehearsal.programId && preview.program ? animationLabel(preview.program) : (preview.look?.name ?? 'Geen Look')} · ${preview.profile?.name ?? 'Geen kleurprofiel'}`
                : activeLook?.name
              : displayedState.mode}
          </span>
        </div>
        <div className="stage" ref={stageRef} />
        <LiveStageOverlay mode={displayedState.mode} output="SIMULATIE" />
        <p className="caption">Conceptsimulatie: kleur, intensiteit, chase en haze. Geen fysieke DMX-output.</p>
      </div>
      <SimulationControls show={show} {...simulationControls} onCameraChange={onCameraChange} />
      <TransitionStatus show={displayedShow} transition={transition} />
      <CoverageStatus show={displayedShow} frame={frame} transitioning={transition?.phase === 'fading'} />
      {previewError && (
        <div role="alert" className="app-notice">
          <p>{previewError}</p>
          <button onClick={onRetryPreview}>3D-weergave opnieuw starten</button>
        </div>
      )}
    </div>
  )
}
