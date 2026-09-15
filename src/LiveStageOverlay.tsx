import type { RuntimeMode } from './domain'
import './LiveStageOverlay.css'

const labels: Record<RuntimeMode, string> = {
  automation: 'SHOW ACTIEF',
  static: 'BEELD VAST',
  safety: 'VEILIGHEIDSMODUS',
  blackout: 'BLACKOUT',
}

export function LiveStageOverlay({ mode, output }: { mode: RuntimeMode; output: string }) {
  return (
    <div className={`live-stage-state is-${mode}`} role="status">
      <span>{output}</span>
      <strong>{labels[mode]}</strong>
    </div>
  )
}
