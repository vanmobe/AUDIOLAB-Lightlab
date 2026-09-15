import { useId } from 'react'
import type { FixtureDeployment } from './domain'

/** Two projections keep both sideward beams and vertical tilt visible. */
export function AimIndicator({ fixtures }: { fixtures: FixtureDeployment[] }) {
  const marker = useId()
  const maxHeight = Math.max(5, ...fixtures.map((f) => f.position[1] + 1))
  return (
    <svg
      className="height-preview aim-indicator"
      viewBox="0 0 300 150"
      role="img"
      aria-label="Hoogte en bundelrichting van de geselecteerde lampen"
    >
      <defs>
        <marker id={marker} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
          <path d="M0 0 L5 2.5 L0 5" fill="currentColor" />
        </marker>
      </defs>
      {[
        { axis: 2, x: 0, title: 'ZIJAANZICHT', left: 'Achter', right: 'Publiek' },
        { axis: 0, x: 150, title: 'VANUIT DE ZAAL', left: 'Links', right: 'Rechts' },
      ].map((view) => (
        <g key={view.axis} transform={`translate(${view.x},0)`}>
          <text x="75" y="16" textAnchor="middle">
            {view.title}
          </text>
          <path d="M12 118 H138" stroke="#526171" />
          <text x="12" y="140">
            {view.left}
          </text>
          <text x="138" y="140" textAnchor="end">
            {view.right}
          </text>
          {fixtures.map((f, i) => {
            const x = fixtures.length === 1 ? 75 : 38 + (i * 74) / (fixtures.length - 1)
            const y = 110 - (f.position[1] / maxHeight) * 68
            const direction = f.aim.map((v, axis) => v - f.position[axis])
            const length = Math.hypot(...direction) || 1
            const dx = (direction[view.axis] / length) * 25
            const dy = (-direction[1] / length) * 25
            return (
              <g key={f.id}>
                <title>{f.name}</title>
                <path d={`M${x} 118 V${y}`} stroke="#526171" />
                <circle cx={x} cy={y} r="3" fill="currentColor" />
                {Math.hypot(dx, dy) > 0.01 ? (
                  <line
                    x1={x}
                    y1={y}
                    x2={x + dx}
                    y2={y + dy}
                    stroke="currentColor"
                    strokeWidth="2"
                    markerEnd={`url(#${marker})`}
                  />
                ) : (
                  <circle cx={x} cy={y} r="6" stroke="currentColor" fill="none" />
                )}
              </g>
            )
          })}
        </g>
      ))}
    </svg>
  )
}
