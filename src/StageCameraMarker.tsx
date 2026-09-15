import type { SimulationCamera } from './domain'
import { stageCameraMarker } from './stage-camera'

export function StageCameraMarker({ camera, onOpen }: { camera: SimulationCamera; onOpen: () => void }) {
  const { position, tip, direction, label, outside, clamped, vertical } = stageCameraMarker(camera)
  const description = `${label} · ${camera.position[1].toLocaleString('nl-BE')} m hoog${outside ? ' · buiten het podium, schematisch aan de rand' : clamped ? ' · schematisch aan de rand' : ''}${vertical ? ` · ${vertical}` : ''}`
  return (
    <>
      {tip && direction && (
        <svg className="stage-camera-direction" viewBox="0 0 140 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1={position.x} y1={position.y} x2={tip.x} y2={tip.y} />
          <polygon
            points={`${tip.x},${tip.y} ${tip.x - direction.x * 3 - direction.y * 1.6},${tip.y - direction.y * 3 + direction.x * 1.6} ${tip.x - direction.x * 3 + direction.y * 1.6},${tip.y - direction.y * 3 - direction.x * 1.6}`}
          />
        </svg>
      )}
      <button
        className="stage-camera-marker"
        style={{ left: `${(position.x / 140) * 100}%`, top: `${position.y}%` }}
        title={`${description}. Open weergave-instellingen.`}
        aria-label={`Camerastandpunt: ${description}. Open weergave-instellingen.`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onOpen}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 7h4l2-3h5l2 3h3v13H4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
    </>
  )
}
