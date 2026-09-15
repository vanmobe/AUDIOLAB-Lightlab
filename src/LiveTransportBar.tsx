import { useState, type ReactNode } from 'react'
import type { RuntimeMode } from './domain'
import './LiveTransportBar.css'

export interface LiveTransportBarProps {
  mode?: RuntimeMode
  onMode: (mode: RuntimeMode) => void
  safetyLabel: string
  lookName: string
  target: string
  disabled?: boolean
  status?: ReactNode
  output?: { state: 'simulation' | 'off' | 'active' | 'unknown'; label: string }
  onShortcutHelp?: () => void
  children?: ReactNode
}

/** The displayed target is explicit; this component never selects a runtime or sends commands itself. */
export function LiveTransportBar({ mode, onMode, safetyLabel, lookName, target, disabled, status, output, onShortcutHelp, children }: LiveTransportBarProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const modes: Pick<Record<RuntimeMode, string>, 'automation' | 'static' | 'safety'> = { automation: 'Show afspelen', static: 'Beeld vasthouden', safety: safetyLabel }
  return <section className="live-transport" aria-label="Vaste livebediening">
    <div className="live-transport-context"><span>{target}</span><strong title={lookName}>{lookName}</strong>{status && <span className="live-transport-status" role="status">{status}</span>}</div>
    {output && <span className="live-output-badge" data-state={output.state} role="status">{output.label}</span>}
    <div className="live-transport-modes" role="group" aria-label="Afspeelmodus">{Object.entries(modes).map(([value, label]) =>
      <button type="button" key={value} disabled={disabled} aria-pressed={mode === value} onClick={() => onMode(value as RuntimeMode)}>{label}</button>)}</div>
    <button type="button" className="live-transport-blackout" disabled={disabled} aria-pressed={mode === 'blackout'} onClick={() => onMode('blackout')}>Blackout</button>
    {(onShortcutHelp || children) && <div className={`live-transport-more${moreOpen ? ' is-open' : ''}`}>
      <button type="button" className="live-transport-more-toggle" aria-expanded={moreOpen} aria-controls="live-transport-extra-actions" onClick={() => setMoreOpen(open => !open)}>{moreOpen ? 'Sluit' : 'Meer'}</button>
      <div id="live-transport-extra-actions">{onShortcutHelp && <button type="button" onClick={onShortcutHelp} aria-haspopup="dialog">Toetsen</button>}{children}</div>
    </div>}
  </section>
}
