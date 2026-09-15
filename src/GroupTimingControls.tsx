import { useEffect, useRef, useState } from 'react'
import { animationLabel, type AutomationProgram, type LookLayer, type ShowDocument } from './domain'
import './GroupTimingControls.css'

export const mixedTiming = '__mixed__'
export type TimingChange = Pick<LookLayer, 'rateBeats' | 'offsetBeats'>

export function commonTiming(layers: LookLayer[], key: 'rateBeats'): number | null | typeof mixedTiming
export function commonTiming(layers: LookLayer[], key: 'offsetBeats'): number | typeof mixedTiming
export function commonTiming(layers: LookLayer[], key: 'rateBeats' | 'offsetBeats') {
  const values = layers.map(layer => layer[key] ?? (key === 'rateBeats' ? null : 0))
  return values.length && values.every(value => value === values[0]) ? values[0] : mixedTiming
}

export function layerAnimationLabel(program: AutomationProgram, layer: LookLayer) {
  const offset = layer.offsetBeats ?? 0
  const duration = layer.rateBeats ?? program.rateBeats
  return animationLabel(program) + (program.pattern || program.effect !== 'static' ? ` · ${duration} ${duration === 1 ? 'beat' : 'beats'}` : '')
    + ((program.pattern || program.effect !== 'static') && offset !== 0 ? ` · offset ${offset > 0 ? '+' : ''}${offset} beats` : '')
}

const durations = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64]
const offsets = [-4, -2, -1, -0.5, 0, 0.5, 1, 2, 4]

export function validOffset(value: string): number | undefined {
  if (!value.trim()) return undefined
  const result = Number(value)
  return Number.isFinite(result) && result >= -64 && result <= 64 ? result : undefined
}

export function GroupTimingControls({ layers, show, onChange, deferCommit = false }: {
  layers: LookLayer[]; show: ShowDocument; onChange: (change: TimingChange) => void; deferCommit?: boolean
}) {
  const rate = commonTiming(layers.map(layer => ({ ...layer, rateBeats: layer.rateBeats ?? show.programs.find(program => program.id === layer.programId)?.rateBeats ?? 1 })), 'rateBeats')
  const offset = commonTiming(layers, 'offsetBeats')
  const [draft, setDraft] = useState(offset === mixedTiming ? '' : String(offset))
  const [error, setError] = useState('')
  const submittedOffset = useRef(offset)
  useEffect(() => {
    // Keep an in-progress decimal intact when our own edit comes back from the parent.
    if (offset !== submittedOffset.current) {
      setDraft(offset === mixedTiming ? '' : String(offset))
      setError('')
    }
    submittedOffset.current = offset
  }, [offset])
  const options = typeof rate === 'number' && !durations.includes(rate) ? [...durations, rate].sort((a, b) => a - b) : durations
  const inactive = layers.some(layer => { const program = show.programs.find(program => program.id === layer.programId); return layer.mode !== 'animation' || (!program?.pattern && program?.effect === 'static') })
  const summary = rate === mixedTiming || offset === mixedTiming ? ' · Gemengd' : `${rate === null ? '' : ` · ${rate} ${rate === 1 ? 'beat' : 'beats'}`}${offset === 0 ? '' : ` · offset ${offset > 0 ? '+' : ''}${offset} beats`}`
  function commitDraft() {
    const value = validOffset(draft)
    if (value === undefined) { if (offset === mixedTiming && !draft.trim()) return; setError('Kies een offset van −64 tot 64 beats.'); return }
    if (value !== offset && (!deferCommit || value !== submittedOffset.current)) {
      submittedOffset.current = value
      onChange({ offsetBeats: value })
    }
  }
  return <details className="group-timing-controls">
    <summary>Timing{summary}</summary>
    <p>Duur bepaalt hoe snel het patroon loopt. Offset verschuift de fase: positief loopt achter, negatief loopt vooruit. Geen startvertraging.</p>
    {inactive && <p className="timing-note">Bij vast licht of uit is timing niet actief. De instellingen blijven bewaard; wijzigen schakelt geen animatie in.</p>}
    <label>Duur voor deze groep<select aria-label="Groepsduur in beats" value={rate ?? 1} onChange={event => onChange({ rateBeats: Number(event.target.value) })}>
      {rate === mixedTiming && <option value={mixedTiming} disabled>Gemengd</option>}{options.map(value => <option key={value} value={value}>{value} {value === 1 ? 'beat' : 'beats'}{!durations.includes(value) ? ' (aangepast)' : ''}</option>)}
    </select></label>
    <label>Offset kiezen<select aria-label="Groepsoffset preset" value={offset === mixedTiming ? mixedTiming : offsets.includes(offset) ? offset : ''} onChange={event => { const value = Number(event.target.value); setDraft(String(value)); setError(''); onChange({ offsetBeats: value }) }}>
      {offset === mixedTiming && <option value={mixedTiming} disabled>Gemengd</option>}{offset !== mixedTiming && !offsets.includes(offset) && <option value="" disabled>{offset} beats (aangepast)</option>}{offsets.map(value => <option key={value} value={value}>{value > 0 ? '+' : ''}{value} {Math.abs(value) === 1 ? 'beat' : 'beats'}{value === 0 ? ' · gelijk' : value > 0 ? ' · achter' : ' · vooruit'}</option>)}
    </select></label>
    <label>Exacte offset (beats)<input aria-label="Exacte groepsoffset in beats" type="number" min="-64" max="64" step="any" placeholder={offset === mixedTiming ? 'Gemengd' : undefined} value={draft} onChange={event => {
      const text = event.target.value
      setDraft(text)
      setError('')
      const value = validOffset(text)
      if (!deferCommit && value !== undefined && value !== offset) {
        submittedOffset.current = value
        onChange({ offsetBeats: value })
      }
    }} onBlur={commitDraft} onKeyDown={event => {
      if (deferCommit && event.key === 'Enter') { event.preventDefault(); commitDraft() }
      if (deferCommit && event.key === 'Escape') { setDraft(offset === mixedTiming ? '' : String(offset)); setError('') }
    }} /></label>
    {error && <p role="alert">{error}</p>}
    <small>{deferCommit ? 'Exacte offset toepassen met Enter of bij het verlaten van het veld.' : 'Geldige invoer wordt meteen toegepast.'} {layers.length > 1 ? 'Wijzigingen gelden voor alle gekoppelde groepen.' : ''}</small>
    <p className="timing-effective">{layers.map(layer => {
      const program = show.programs.find(item => item.id === layer.programId)
      return `${show.groups.find(group => group.id === layer.groupId)?.name ?? layer.groupId}: ${layer.mode === 'animation' && program ? layerAnimationLabel(program, layer) : 'timing niet actief'}`
    }).join(' / ')}</p>
    <button onClick={() => { setDraft('0'); setError(''); onChange({ rateBeats: 1, offsetBeats: 0 }) }}>Timing naar 1 beat / offset 0</button>
  </details>
}
