import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { AudioLiveSource } from './audio-live'
import { RuntimeAudioPanel } from './RuntimeAudioPanel'
import type { EvaluatedFrame, RuntimeMode, RuntimeState, ShowDocument, SimulationCamera } from './domain'
import { LiveControlSurface } from './LiveControlSurface'
import { LiveGroupControls } from './LiveGroupControls'
import { LiveLookLibrary } from './LiveLookLibrary'
import { linkedGroupIds } from './live-controls'
import { SimulationControls, type SimulationControlProps } from './SimulationControls'
import { StageSimulator } from './simulator'
import { simulationErrorMessage } from './simulation-errors'
import { CommitRange } from './CommitRange'
import { CoverageStatus, safetyLabel } from './CoverageStatus'
import { TransitionStatus } from './TransitionStatus'
import { useRuntimeLive } from './useRuntimeLive'
import './RuntimeLiveView.css'
import { RuntimeOutputPanel } from './RuntimeOutputPanel'
import { LiveTransportBar } from './LiveTransportBar'
import { SidePanel } from './SidePanel'
import { RuntimeWorkspace } from './RuntimeWorkspace'
import { adjacentLookId, isLiveShortcutTextInput, liveShortcutAction } from './live-shortcuts'
import { LiveStageOverlay } from './LiveStageOverlay'

const modes: Record<RuntimeMode, string> = { automation: 'Show afspelen', static: 'Beeld vasthouden', safety: 'Gedeeltelijke blackout', blackout: 'Blackout' }

/** Display received frames verbatim. Neither rendering nor camera changes advance show time. */
function RuntimeFramePreview({ show, frame, camera, simulationSettings, output }: { show: ShowDocument; frame: EvaluatedFrame; camera: SimulationCamera; output: string } & SimulationControlProps) {
  const host = useRef<HTMLDivElement>(null), renderer = useRef<StageSimulator | null>(null)
  const [error, setError] = useState(''), [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!host.current) return
    try {
      const view = new StageSimulator(host.current, show.fixtures, camera, show.bandMembers)
      renderer.current = view; setError('')
      return () => { view.dispose(); renderer.current = null }
    } catch (cause) { setError(simulationErrorMessage(cause, 'De runtime loopt door, maar de 3D-weergave is niet beschikbaar.')) }
  }, [show.fixtures, show.bandMembers, retry])
  useEffect(() => { renderer.current?.update(frame, simulationSettings) }, [frame, simulationSettings, retry])
  useEffect(() => { renderer.current?.setCamera(camera) }, [camera, retry])
  return <><div className="stage-panel"><div className="stage-label"><span>Liveweergave</span><span>{modes[frame.mode]}</span></div><div className="stage" ref={host} /><LiveStageOverlay mode={frame.mode} output={output} /><p className="caption">Ontvangen lichtwaarden uit de runtime · conceptsimulatie, geen terugmelding van echte lampen.</p></div>{error && <div role="alert"><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>3D-weergave opnieuw starten</button></div>}</>
}

export function RuntimeLiveView({ show: editorShow, onConfigure, onOpenConnections, audioSource, audioGroupTargets, management = false, onNavigate, onShortcutHelp, ...simulation }: {
  show: ShowDocument; onConfigure: () => void; audioSource?: RefObject<AudioLiveSource | null>
  onOpenConnections?: () => void
  management?: boolean
  onNavigate?: (target: 'patch' | 'control' | 'audio' | 'live') => void
  onShortcutHelp?: () => void
  audioGroupTargets?: RefObject<((id: string) => string[]) | null>
} & SimulationControlProps) {
  const runtime = useRuntimeLive()
  const [bpm, setBpm] = useState('120'), [camera, setCamera] = useState<SimulationCamera>(editorShow.camera)
  const [controller, setController] = useState<'looks' | 'wing'>('looks')
  const [outputOpen, setOutputOpen] = useState(false)
  const [armedLookId, setArmedLookId] = useState<string>()
  const hydrated = useRef<string | null>(null), bpmEdited = useRef(false)
  const { show, preview, status } = runtime
  useEffect(() => {
    if (show && status?.sessionId && hydrated.current !== status.sessionId) {
      hydrated.current = status.sessionId; setCamera(show.camera)
    }
  }, [show, status?.sessionId, status?.bpm])
  useEffect(() => { if (status && !bpmEdited.current) setBpm(String(status.bpm)) }, [status?.bpm])
  const loadBpm = bpmEdited.current ? Number(bpm) : status?.bpm ?? Number(bpm)
  const active = status?.status === 'running' || status?.status === 'starting'
  const validBpm = bpm.trim() !== '' && Number.isFinite(Number(bpm)) && Number(bpm) >= 30 && Number(bpm) <= 240
  const ready = runtime.connected && !!show && !!preview
  const mastersShow = useMemo(() => show && preview ? { ...show, groups: show.groups.map(group => ({ ...group, intensity: preview.groupIntensities[group.id] })) } : undefined, [show, preview?.groupIntensities])
  const state: RuntimeState | undefined = preview ? { mode: preview.status.mode, activeLookId: preview.status.lookId!, colorLockId: preview.colorLockId ?? undefined } : undefined
  const linked = show && preview ? show.groups.filter(group => linkedGroupIds(show, preview.controls, group.id).length > 1).map(group => group.id) : []
  useEffect(() => {
    if (!audioGroupTargets) return
    audioGroupTargets.current = show && preview ? id => linkedGroupIds(show, preview.controls, id) : null
    return () => { audioGroupTargets.current = null }
  }, [audioGroupTargets, show, preview?.controls])
  function intensity(id: string, value: number) {
    if (!show || !preview) return
    const next = { ...preview.groupIntensities }
    for (const target of linkedGroupIds(show, preview.controls, id)) next[target] = value
    void runtime.setLive(preview.controls, next, preview.colorLockId)
  }
  function triggerLook(id: string) {
    setArmedLookId(undefined)
    void runtime.command({ command: 'look', lookId: id })
  }
  const currentSnapshotDiffers = useMemo(() => !!show && JSON.stringify(show) !== JSON.stringify(editorShow), [show, editorShow])
  const outputLabel = !runtime.connected ? 'Uitvoerstatus onbekend' : status?.outputSent ? 'Netwerkuitvoer actief' : 'Geen netwerkuitvoer gemeld'
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (management || runtime.pending || !ready || !show || !state || event.defaultPrevented || isLiveShortcutTextInput(event.target)) return
      const action = liveShortcutAction(event)
      if (!action || action === 'help') return
      if (action === 'previous-look' || action === 'next-look') {
        const next = action === 'next-look' && armedLookId
          ? armedLookId
          : adjacentLookId(show.looks, state.activeLookId, action === 'previous-look' ? -1 : 1)
        if (next) { event.preventDefault(); triggerLook(next) }
      } else if (action === 'blackout') {
        event.preventDefault(); void runtime.command({ command: 'mode', mode: 'blackout' })
      } else if (action === 'toggle-playback') {
        event.preventDefault(); void runtime.command({ command: 'mode', mode: state.mode === 'automation' ? 'static' : 'automation' })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [management, ready, show, state, runtime, armedLookId])
  return <section className="runtime-live" aria-label="Runtime livebediening">
    {management && onNavigate && <RuntimeWorkspace show={editorShow} runtime={runtime} onNavigate={onNavigate} loadBpm={validBpm ? loadBpm : NaN} />}
    <div className="runtime-live-presentation" hidden={management}>
    {active && <section className="runtime-editor-load" aria-label="Editorshow laden">
      <div><strong>In de editor: {editorShow.name}</strong><p>{editorShow.looks.length} Looks · {editorShow.programs.length} animaties · {editorShow.colorProfiles.length} kleurprofielen · {validBpm ? `${loadBpm} BPM` : 'Kies een geldig tempo'}</p></div>
      <button className="primary" disabled={runtime.pending || !validBpm || !editorShow.looks.length} onClick={() => void runtime.loadEditorShow(editorShow, loadBpm)}>Laad editorshow in runtime</button>
      <small>Vervangt de actieve sessie en begint opnieuw. DMX en de WAV-koppeling gaan uit; tijdelijke live-aanpassingen worden niet meegenomen.</small>
    </section>}
    <LiveTransportBar target="Lokale runtime" lookName={ready ? show?.looks.find(look => look.id === state?.activeLookId)?.name ?? 'Geen Look geselecteerd' : `Show in editor: ${editorShow.name}`} mode={ready ? state?.mode : undefined} safetyLabel={show ? safetyLabel(show) : modes.safety} disabled={!ready || runtime.pending} output={{ state: !runtime.connected ? 'unknown' : status?.outputSent ? 'active' : 'off', label: !runtime.connected ? 'STATUS ONBEKEND' : status?.outputSent ? 'DMX ACTIEF' : 'DMX UIT' }} status={`${ready ? `${preview!.status.bpm} BPM · ${preview!.status.universeCount} universes` : outputLabel}${runtime.pending ? ' · Opdracht wordt verwerkt…' : ''}`} onShortcutHelp={onShortcutHelp} onMode={mode => void runtime.command({ command: 'mode', mode })}>
      <button aria-haspopup="dialog" aria-expanded={outputOpen} onClick={() => setOutputOpen(true)}>DMX-uitvoer</button>
      {status?.sessionId && <button className="lab-danger" disabled={!active && !runtime.connected} onClick={() => void runtime.stop()}>Stop runtimesessie</button>}
    </LiveTransportBar>
    {runtime.error && <p className="runtime-live-warning" role="alert">{runtime.error}</p>}
    {currentSnapshotDiffers && <p className="runtime-live-warning">De runtime gebruikt een andere versie dan je editor. Kies ‘Laad editorshow in runtime’ om je wijzigingen over te nemen.</p>}
    <details className="runtime-live-session">
      <summary>{ready ? 'Sessie, tempo & verbinding' : 'Tempo & geavanceerde verbinding'}</summary>
      <p>De runtime bepaalt het tempo en de lichtwaarden. Sluiten van dit scherm stopt de sessie niet.</p>
      <div className="runtime-live-toolbar"><label>Tempo (BPM)<input aria-label="Live runtime BPM" type="number" min="30" max="240" step="any" value={bpm} aria-invalid={!validBpm} onChange={event => { bpmEdited.current = true; setBpm(event.target.value) }} /></label>
        {ready && <button disabled={runtime.pending || !validBpm} onClick={() => void runtime.command({ command: 'bpm', bpm: Number(bpm) })}>Tempo toepassen</button>}
        {!ready && <button disabled={runtime.pending} onClick={() => void runtime.attach()}>Verbind met runtimesessie</button>}
      </div>
      <p role="status">{ready ? `Verbonden · ${preview!.status.bpm} BPM · ${preview!.status.universeCount} universes · ${show!.name}` : active ? runtime.error ? 'De laatst bekende sessie was actief. Verbind opnieuw om de huidige status te controleren.' : 'Er draait een sessie. Verbind om haar te bekijken en te bedienen.' : 'Niet verbonden met een actieve sessie.'}{runtime.pending ? ' · Opdracht wordt verwerkt…' : ''}</p>
      <small>Lookkeuzes, kleuren, groepslinks, timing en masters gelden alleen voor deze sessie. Je opgeslagen show wordt niet aangepast.</small>
      <small>Bij gekoppelde WAV bepaalt het audiopaneel het tempo. De BPM-instelling hierboven geldt alleen voor de vrije runtimeklok.</small>
    </details>
    {ready && mastersShow && state && preview && show ? <section className="workspace">
      <div className="live-stage-column">
        <RuntimeFramePreview key={status!.sessionId} show={show} frame={preview.frame} camera={camera} output={!runtime.connected ? 'STATUS ONBEKEND' : status?.outputSent ? 'DMX ACTIEF' : 'DMX UIT'} {...simulation} />
        <details className="runtime-view-settings"><summary>Beeld & camerastandpunt</summary><SimulationControls show={{ ...show, camera }} {...simulation} cameraPersistence="viewer" onCameraChange={setCamera} /></details>
        <CoverageStatus show={mastersShow} frame={preview.frame} transitioning={preview.transition?.phase === 'fading'} />
        <TransitionStatus show={show} transition={preview.transition} />
      </div>
      <aside className="control-panel"><div className="runtime-live-controls" aria-busy={runtime.pending}>
        <div className="runtime-controller-switch" role="group" aria-label="Live bedieningspaneel"><button aria-pressed={controller === 'looks'} onClick={() => setController('looks')}>Looks</button><button aria-pressed={controller === 'wing'} onClick={() => setController('wing')}>WING</button></div>
        {/* Mounted but hidden keeps the chosen WING bank and Look search when changing controllers. */}
        <div className="runtime-controller-view" hidden={controller !== 'wing'}><LiveControlSurface runtimeSession disabled={runtime.pending} show={mastersShow} state={state} modified={Object.keys(preview.controls.overrides).length > 0} linkedGroups={linked} onLook={triggerLook} onMode={mode => void runtime.command({ command: 'mode', mode })} onColor={id => void runtime.setLive(preview.controls, preview.groupIntensities, id ?? null)} onIntensity={intensity} onConfigure={onConfigure} /></div>
        <div className="runtime-controller-view" hidden={controller !== 'looks'}><LiveLookLibrary disabled={runtime.pending} show={show} activeLookId={state.mode === 'automation' && !state.colorLockId && !Object.keys(preview.controls.overrides).length ? state.activeLookId : undefined} currentLookId={state.activeLookId} armedLookId={armedLookId} mode={state.mode} onArm={setArmedLookId} onSelect={triggerLook} /></div>
        <details className="live-group-panel"><summary>Groepen apart bedienen / koppelen</summary><fieldset className="runtime-live-change-controls" disabled={runtime.pending}><LiveGroupControls runtimeSession show={mastersShow} state={state} controls={preview.controls} onChange={controls => void runtime.setLive(controls, preview.groupIntensities, preview.colorLockId)} /></fieldset></details>
        <details className="live-master-disclosure"><summary>Groepsmasters · alleen runtimesessie</summary><fieldset className="runtime-live-change-controls" disabled={runtime.pending}><p>Laat een schuif los om het niveau toe te passen.</p>{mastersShow.groups.map(group => <label className="master" key={group.id}><span>{group.name}{linked.includes(group.id) ? ' · gelinkt' : ''}</span><output>{Math.round(group.intensity * 100)}%</output><CommitRange aria-label={`Runtime ${group.name} intensity`} min="0" max="1" step="0.01" value={group.intensity} onCommit={value => intensity(group.id, value)} /></label>)}</fieldset></details>
      </div></aside>
    </section> : <div className="runtime-live-unavailable"><h2>{active ? 'Livesessie verbinden' : !status ? 'Liveverbinding controleren' : editorShow.looks.length ? 'Show klaar om te starten' : 'Maak eerst een Look'}</h2>
      <p><strong>{editorShow.name}</strong> · {editorShow.fixtures.length} fixtures · {editorShow.looks.length} Looks · {editorShow.programs.length} animaties · {editorShow.colorProfiles.length} kleurprofielen</p>
      <p>Dit is de geopende show uit je editor. Exporteren of openen bewaart je showinhoud, maar start geen livesessie en schakelt geen lampen in.</p>
      <p>{active ? 'Verbind om de bestaande sessie te behouden, of laad hierboven de show uit je editor.' : !status ? 'Controleer eerst de lokale runtimeverbinding.' : `Bereid ${editorShow.name} voor op ${bpm} BPM. Fysieke uitvoer blijft apart uitgeschakeld.`}</p>
      {!status && runtime.error && onOpenConnections ? <button className="primary" onClick={onOpenConnections}>Open verbindingen</button> :
        active ? <button disabled={runtime.pending} onClick={() => void runtime.attach()}>Verbind met bestaande sessie</button> :
          !status ? <button className="primary" disabled={!runtime.error || runtime.pending} onClick={() => void runtime.attach()}>{runtime.error ? 'Controleer runtime opnieuw' : 'Runtime wordt gecontroleerd…'}</button> :
            <button className="primary" disabled={runtime.pending || !validBpm || !editorShow.looks.length} onClick={() => void runtime.loadEditorShow(editorShow, loadBpm)}>Laad editorshow in runtime</button>}
      {!validBpm && <p role="alert">Kies bij Tempo & geavanceerde verbinding een tempo van 30 tot 240 BPM.</p>}
      {!editorShow.looks.length && <p>Maak eerst een Look in de ontwerpstudio.</p>}
      <small>De browsersimulatie neemt een runtimesessie nooit automatisch over.</small>
    </div>}
    <SidePanel open={outputOpen} onClose={() => setOutputOpen(false)} title="DMX-uitvoer">
      {status?.sessionId ? <RuntimeOutputPanel key={status.sessionId} sessionId={status.sessionId} running={status.status === 'running'} onPrepare={() => setOutputOpen(false)} /> : <>
        <h3>Van show naar echte lampen</h3>
        <ol><li>Stel lampadressen, universes en je sACN- of Art-Net-node in bij Setup → Patch & netwerk.</li><li>Start of verbind de livesessie.</li><li>Klik op DMX-uitvoer aan.</li></ol>
        <p>De simulatie stuurt geen DMX. De lokale runtime verzorgt de netwerkuitvoer naar je DMX-node.</p>
        <button onClick={() => setOutputOpen(false)}>Terug naar de livesessie</button>
      </>}
    </SidePanel>
    </div>
    {/* Keep audio mounted when collapsed: closing a disclosure must never detach it. */}
    <div className="runtime-live-audio" hidden={management}>
    {status?.sessionId && <details className="runtime-live-connections"><summary>WAV koppelen aan de livesessie</summary>
      {audioSource && <RuntimeAudioPanel key={`audio-${status.sessionId}`} sessionId={status.sessionId} sourceRef={audioSource} running={ready && status.status === 'running'} />}
    </details>}
    </div>
  </section>
}
