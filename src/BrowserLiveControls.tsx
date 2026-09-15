import { LiveControlSurface } from './LiveControlSurface'
import { LiveGroupControls } from './LiveGroupControls'
import { LiveLookLibrary } from './LiveLookLibrary'
import type { RuntimeMode, RuntimeState, ShowDocument } from './domain'
import { linkedGroupIds, type LiveControls } from './live-controls'

interface BrowserLiveControlsProps {
  show: ShowDocument
  state: RuntimeState
  controls: LiveControls
  controller: 'looks' | 'wing'
  armedLookId?: string
  onControllerChange: (controller: 'looks' | 'wing') => void
  onLook: (id: string) => void
  onMode: (mode: RuntimeMode) => void
  onColorLock: (id?: string) => void
  onIntensity: (groupId: string, intensity: number) => void
  onControlsChange: (controls: LiveControls) => void
  onArm: (id: string | undefined) => void
  onConfigure: () => void
}

/** Browser-source Live controls only; runtime sessions remain owned by RuntimeLiveView. */
export function BrowserLiveControls({
  show,
  state,
  controls,
  controller,
  armedLookId,
  onControllerChange,
  onLook,
  onMode,
  onColorLock,
  onIntensity,
  onControlsChange,
  onArm,
  onConfigure,
}: BrowserLiveControlsProps) {
  const modified = Object.keys(controls.overrides).length > 0
  const linkedGroups = show.groups
    .filter((group) => linkedGroupIds(show, controls, group.id).length > 1)
    .map((group) => group.id)

  return (
    <>
      <div className="controller-switch" role="group" aria-label="Schermbediening">
        <button aria-pressed={controller === 'looks'} onClick={() => onControllerChange('looks')}>
          Looks
        </button>
        <button aria-pressed={controller === 'wing'} onClick={() => onControllerChange('wing')}>
          WING-banken
        </button>
      </div>
      <div hidden={controller !== 'wing'}>
        <LiveControlSurface
          show={show}
          state={state}
          modified={modified}
          linkedGroups={linkedGroups}
          onLook={onLook}
          onMode={onMode}
          onColor={onColorLock}
          onIntensity={onIntensity}
          onConfigure={onConfigure}
        />
      </div>
      <details className="live-group-panel">
        <summary>
          Groepen apart bedienen / koppelen
          {modified ? ` · ${Object.keys(controls.overrides).length} aangepast` : ''}
        </summary>
        <LiveGroupControls show={show} state={state} controls={controls} onChange={onControlsChange} />
      </details>
      <div hidden={controller !== 'looks'}>
        <LiveLookLibrary
          show={show}
          activeLookId={state.mode === 'automation' && !state.colorLockId && !modified ? state.activeLookId : undefined}
          currentLookId={state.activeLookId}
          armedLookId={armedLookId}
          mode={state.mode}
          onArm={onArm}
          onSelect={onLook}
        />
      </div>
    </>
  )
}
