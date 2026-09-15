import { useEffect, useRef, useState } from 'react'
import { type ShowDocument } from './domain'
import { createLookTransitionPlayer, type TransitionResult } from './look-transitions'
import { TransitionStatus } from './TransitionStatus'
import { CoverageStatus } from './CoverageStatus'
import { fixtureProfiles } from './fixtures'
import { LookEditor } from './LookEditor'
import { advancePreviewBeat, previewBpmRange, validPreviewBpm } from './preview-clock'
import { StageSimulator } from './simulator'
import { simulationErrorMessage } from './simulation-errors'
import { SimulationControls, type SimulationControlProps } from './SimulationControls'
import './LookStudio.css'

export function LookStudio({ show, onChange, bpm, onBpmChange, selectedLookId, onSelectLook, ...simulationControls }: SimulationControlProps & {
  show: ShowDocument
  onChange: (show: ShowDocument) => void
  bpm: number
  onBpmChange: (bpm: number) => void
  selectedLookId: string
  onSelectLook: (lookId: string) => void
}) {
  const selectedLook = show.looks.find(look => look.id === selectedLookId) ?? show.looks[0]
  const host = useRef<HTMLDivElement>(null)
  const simulator = useRef<StageSimulator | null>(null)
  const inputs = useRef({ show, bpm, lookId: selectedLook?.id })
  const beat = useRef(0)
  const settings = useRef(simulationControls.simulationSettings)
  settings.current = simulationControls.simulationSettings
  const [bpmDraft, setBpmDraft] = useState(String(bpm))
  const submittedBpm = useRef(bpm)
  const [previewError, setPreviewError] = useState('')
  const [diagnostic, setDiagnostic] = useState<TransitionResult>()
  const [lookSearch, setLookSearch] = useState('')
  const hasLook = Boolean(selectedLook)

  useEffect(() => { inputs.current = { show, bpm, lookId: selectedLook?.id } }, [show, bpm, selectedLook?.id])
  useEffect(() => {
    if (bpm !== submittedBpm.current) setBpmDraft(String(bpm))
    submittedBpm.current = bpm
  }, [bpm])
  useEffect(() => {
    if (!host.current || !hasLook) return
    let view: StageSimulator
    try {
      view = new StageSimulator(host.current, show.fixtures, inputs.current.show.camera, show.bandMembers)
      simulator.current = view
      setPreviewError('')
    } catch (error) {
      setPreviewError(simulationErrorMessage(error, 'De 3D-preview kon niet starten. Controleer of WebGL beschikbaar is in je browser. Je kunt de Look wel blijven bewerken.'))
      return
    }
    let previous = performance.now()
    const player = createLookTransitionPlayer()
    let reportedAt = -Infinity
    let frameId = 0
    const update = (now: number) => {
      const current = inputs.current
      beat.current = advancePreviewBeat(beat.current, now - previous, current.bpm)
      previous = now
      if (current.lookId) {
        const result = player.evaluate(current.show, fixtureProfiles, { mode: 'automation', activeLookId: current.lookId }, beat.current)
        view.update(result.frame, settings.current)
        // Coverage is diagnostic text, not a reason to re-render React at animation speed.
        if (now - reportedAt >= 250) { setDiagnostic(result); reportedAt = now }
      }
      frameId = requestAnimationFrame(update)
    }
    update(previous)
    return () => {
      cancelAnimationFrame(frameId)
      view.dispose()
      simulator.current = null
    }
    // Only physical scene changes require rebuilding WebGL; creative edits use the latest inputs above.
  }, [show.fixtures, show.bandMembers, hasLook])
  useEffect(() => { simulator.current?.setCamera(show.camera) }, [show.camera])

  if (!selectedLook) return <section className="look-studio-empty"><h2>Looks & repetitie</h2><p>Maak eerst een Look bij AI-ontwerp om deze te bewerken en meteen op het podium te bekijken.</p></section>

  const invalidBpm = validPreviewBpm(bpmDraft) === undefined
  return <section className="look-studio" aria-label="Look bewerken en repeteren">
    <header className="look-studio-heading">
      <div><h2>Looks & repetitie</h2><p className="muted">Bewerk een groep en zie meteen wat er op het podium verandert.</p></div>
      <label className="look-studio-mobile-picker">Look<select aria-label="Look in de studio" value={selectedLook.id} onChange={event => onSelectLook(event.target.value)}>{show.looks.map(look => <option key={look.id} value={look.id}>{look.name}</option>)}</select></label>
    </header>
    <div className="look-studio-layout">
      <nav className="look-studio-library" aria-label="Looks in de studio">
        <h3>Looks <small>{show.looks.length}</small></h3>
        {show.looks.length > 6 && <input type="search" aria-label="Zoek studio-Look" placeholder="Zoek een Look…" value={lookSearch} onChange={event => setLookSearch(event.target.value)} />}
        <div className="look-studio-look-list">
          {show.looks.filter(look => show.looks.length <= 6 || look.name.toLocaleLowerCase().includes(lookSearch.trim().toLocaleLowerCase())).map(look =>
            <button key={look.id} type="button" aria-pressed={selectedLook.id === look.id} onClick={() => onSelectLook(look.id)}>{look.name}</button>)}
          {show.looks.length > 6 && !show.looks.some(look => look.name.toLocaleLowerCase().includes(lookSearch.trim().toLocaleLowerCase())) && <p className="muted">Geen Looks gevonden.</p>}
        </div>
      </nav>
      <aside className="look-studio-preview" aria-label="Repetitievoorbeeld">
        <div className="look-studio-stage" ref={host} role="img" aria-label={`Simulatie van ${selectedLook.name}`} />
        {previewError && <p role="alert" className="look-studio-error">{previewError}</p>}
        <SimulationControls show={show} {...simulationControls} />
        {diagnostic && <><TransitionStatus show={show} transition={diagnostic.transition} /><CoverageStatus show={show} frame={diagnostic.frame} transitioning={diagnostic.transition?.phase === 'fading'} /></>}
        <div className="look-studio-tempo">
          <div className="look-studio-tempo-title"><strong>Repetitietempo</strong><span>Alleen voor dit voorbeeld · geen live-uitvoer</span></div>
          <div className="look-studio-tempo-inputs">
            <input type="range" aria-label="Repetitietempo" min={previewBpmRange.min} max={previewBpmRange.max} step="1" value={bpm} onChange={event => {
              submittedBpm.current = Number(event.target.value)
              setBpmDraft(event.target.value)
              onBpmChange(submittedBpm.current)
            }} />
            <label><input type="number" aria-label="Repetitietempo in BPM" min={previewBpmRange.min} max={previewBpmRange.max} step="any" value={bpmDraft} aria-invalid={invalidBpm} aria-describedby="studio-bpm-hint" onChange={event => {
              setBpmDraft(event.target.value)
              const valid = validPreviewBpm(event.target.value)
              if (valid !== undefined) {
                submittedBpm.current = valid
                onBpmChange(valid)
              }
            }} onBlur={() => setBpmDraft(String(bpm))} /> BPM</label>
          </div>
          <small id="studio-bpm-hint">{invalidBpm ? `Kies ${previewBpmRange.min}–${previewBpmRange.max} BPM. Het voorbeeld blijft op ${bpm} BPM lopen.` : 'Hoger BPM = sneller. Groepsduur en offsets blijven in beats.'}</small>
        </div>
      </aside>
      <div className="look-studio-editor">
        <p className="look-studio-save-note">Wijzigingen worden meteen in deze Look bewaard.</p>
        <LookEditor embedded show={show} look={selectedLook} onChange={look => onChange({ ...show, looks: show.looks.map(item => item.id === look.id ? look : item) })} />
      </div>
    </div>
  </section>
}
