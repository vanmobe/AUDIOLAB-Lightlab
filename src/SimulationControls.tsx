import type { ShowDocument, SimulationCamera } from './domain'
import { matchesStageCamera, stageCameraPresets } from './stage-camera'
import {
  defaultSimulationHaze,
  validSimulationHaze,
  validSimulationBrightness,
  type SimulationSettings,
} from './simulation-settings'
import './SimulationControls.css'

export interface SimulationControlProps {
  cameraPersistence?: 'show' | 'viewer'
  simulationSettings?: SimulationSettings
  onSimulationSettingsChange?: (settings: SimulationSettings) => void
  onCameraChange?: (camera: SimulationCamera) => void
}

export function SimulationControls({
  show,
  simulationSettings,
  onSimulationSettingsChange,
  onCameraChange,
  cameraPersistence = 'show',
}: SimulationControlProps & { show: ShowDocument }) {
  if (!simulationSettings || !onSimulationSettingsChange) return null
  const { brightness, hiddenGroupIds } = simulationSettings
  const haze = validSimulationHaze(simulationSettings.haze ?? defaultSimulationHaze)
  const hiddenCount = show.groups.filter((group) => hiddenGroupIds.includes(group.id)).length
  const cameraLabel =
    stageCameraPresets.find((preset) => matchesStageCamera(show.camera, preset.camera))?.label ?? 'Eigen standpunt'
  return (
    <details className="simulation-controls">
      <summary>
        Simulatieweergave{' '}
        <span>
          {brightness}% · rook {haze}% · {cameraLabel} ·{' '}
          {hiddenCount
            ? `${hiddenCount} ${hiddenCount === 1 ? 'groep' : 'groepen'} verborgen`
            : 'alle groepen zichtbaar'}
        </span>
      </summary>
      <div className="simulation-controls-body">
        <p>Alleen het beeld: geen wijziging aan Looks, groepsmasters of DMX.</p>
        <label className="simulation-brightness">
          Beeldhelderheid · {brightness}%
          <input
            type="range"
            min="10"
            max="200"
            step="5"
            value={brightness}
            onChange={(event) =>
              onSimulationSettingsChange({
                ...simulationSettings,
                brightness: validSimulationBrightness(Number(event.target.value)),
              })
            }
          />
        </label>
        <small>
          100% = oorspronkelijke weergave, geen luxmeting. Stem visueel af op je podium. Helderheid wordt op deze
          computer onthouden.
        </small>
        <label>
          Rook / haze · {haze}%
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={haze}
            onChange={(event) =>
              onSimulationSettingsChange({
                ...simulationSettings,
                haze: validSimulationHaze(Number(event.target.value)),
              })
            }
          />
        </label>
        <small>
          0% = heldere lucht · 100% = dichte haze. Bewegende rookstructuren maken lichtbundels zichtbaar. Beweging volgt
          je systeemvoorkeur voor verminderde beweging. Alleen de simulatie, ook zonder hazer; stuurt de echte
          rookmachine niet aan. Wordt op deze computer onthouden.
        </small>
        <fieldset>
          <legend>Groepslicht in de simulatie</legend>
          <div className="simulation-groups">
            {show.groups.map((group) => (
              <label key={group.id}>
                <input
                  type="checkbox"
                  checked={!hiddenGroupIds.includes(group.id)}
                  onChange={(event) =>
                    onSimulationSettingsChange({
                      ...simulationSettings,
                      hiddenGroupIds: event.target.checked
                        ? hiddenGroupIds.filter((id) => id !== group.id)
                        : [...hiddenGroupIds, group.id],
                    })
                  }
                />
                {group.name}
              </label>
            ))}
          </div>
          <button
            disabled={!hiddenCount}
            onClick={() => onSimulationSettingsChange({ ...simulationSettings, hiddenGroupIds: [] })}
          >
            Alle groepen tonen
          </button>
          <small>Tijdelijk, gedeeld tussen previews. Lampbehuizingen blijven zichtbaar.</small>
        </fieldset>
        {onCameraChange && (
          <label>
            Vast camerastandpunt
            <select
              value={cameraLabel}
              onChange={(event) => {
                const preset = stageCameraPresets.find((item) => item.label === event.target.value)
                if (preset)
                  onCameraChange({
                    ...preset.camera,
                    position: [...preset.camera.position],
                    target: [...preset.camera.target],
                  })
              }}
            >
              {cameraLabel === 'Eigen standpunt' && <option>Eigen standpunt</option>}
              {stageCameraPresets.map((preset) => (
                <option key={preset.label}>{preset.label}</option>
              ))}
            </select>
            <small>
              {cameraPersistence === 'viewer'
                ? 'Alleen dit beeld; de geladen show blijft intact.'
                : 'Standpunt wordt in de show bewaard en volgt mee op de podiumtekening.'}{' '}
              Links/rechts vanuit de zaal gezien.
            </small>
          </label>
        )}
        <button
          onClick={() =>
            onSimulationSettingsChange({ brightness: 100, haze: defaultSimulationHaze, hiddenGroupIds: [] })
          }
        >
          Herstel simulatieweergave
        </button>
      </div>
    </details>
  )
}
