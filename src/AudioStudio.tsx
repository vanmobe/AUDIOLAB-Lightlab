import { useEffect, useRef, useState, type RefObject } from 'react'
import { createAudioLivePlayer, type AudioLiveSource } from './audio-live'
import type { ShowDocument } from './domain'
import { inspectWav, MAX_WAV_BYTES, MAX_AUDIO_DURATION_SECONDS, type KickAnalysis } from './kick-analysis'
import { kickIndexAt, type AudioReaction } from './audio-reactivity'
import { StageSimulator } from './simulator'
import { SimulationControls, type SimulationControlProps } from './SimulationControls'
import './AudioStudio.css'

export function AudioStudio({ show, active = true, live = false, runtime = false, sourceRef, selectedLiveLookId, linkedGroups, onConfigure, ...controls }: SimulationControlProps & {
  show: ShowDocument; active?: boolean; live?: boolean; runtime?: boolean; sourceRef?: RefObject<AudioLiveSource | null>
  selectedLiveLookId?: string; linkedGroups?: (groupId: string) => string[]; onConfigure?: () => void
}) {
  const audio = useRef<HTMLAudioElement>(null), host = useRef<HTMLDivElement>(null)
  const simulator = useRef<StageSimulator | null>(null)
  const decoded = useRef<AudioBuffer | null>(null), worker = useRef<Worker | null>(null)
  const generation = useRef(0), objectUrl = useRef('')
  const [url, setUrl] = useState(''), [name, setName] = useState(''), [error, setError] = useState('')
  const [busy, setBusy] = useState(false), [analysis, setAnalysis] = useState<KickAnalysis>()
  const [channels, setChannels] = useState(0), [channel, setChannel] = useState(0)
  const [sensitivity, setSensitivity] = useState(.5), [interval, setInterval] = useState(160)
  const [dirty, setDirty] = useState(false), [position, setPosition] = useState(0)
  const [lookId, setLookId] = useState(show.activeLookId), [bpm, setBpm] = useState(120)
  const [decay, setDecay] = useState(300), [floor, setFloor] = useState(.25)
  const [reactions, setReactions] = useState<Record<string, AudioReaction>>({})
  const [enabled, setEnabled] = useState(true), [follow, setFollow] = useState<'tempo' | 'kicks'>('tempo')
  const [automaticTempo, setAutomaticTempo] = useState(true)
  const effectiveBpm = automaticTempo && analysis?.bpm ? Math.max(30, Math.min(240, Math.round(analysis.bpm))) : bpm
  const [previewError, setPreviewError] = useState('')
  const selectedLook = show.looks.find(item => item.id === (live ? selectedLiveLookId : lookId)) ?? show.looks[0]
  const latest = useRef({ show, lookId: selectedLook?.id ?? '', analysis, reactions, bpm, decay, floor, follow, settings: controls.simulationSettings })
  latest.current = { show, lookId: selectedLook?.id ?? '', analysis, reactions, bpm: effectiveBpm, decay, floor, follow, settings: controls.simulationSettings }
  if (sourceRef) sourceRef.current = { read: () => active && live && enabled && analysis ? {
    seconds: audio.current?.currentTime ?? 0, playing: audio.current ? !audio.current.paused && !audio.current.ended : false,
    analysis, mode: follow, bpm: effectiveBpm, reactions, decayMs: decay, floor,
  } : undefined }
  useEffect(() => { if (!active) audio.current?.pause() }, [active])

  function analyze(buffer: AudioBuffer, selectedChannel: number) {
    audio.current?.pause()
    worker.current?.terminate()
    setBusy(true); setError(''); setAnalysis(undefined); setDirty(false)
    try {
      const next = new Worker(new URL('./kick-analysis.worker.ts', import.meta.url), { type: 'module' })
      worker.current = next
      const finish = () => { next.terminate(); if (worker.current === next) worker.current = null }
      next.onmessage = event => {
        if (worker.current !== next) return
        if (event.data.error) setError(event.data.error)
        else setAnalysis(event.data.analysis)
        setBusy(false); finish()
      }
      next.onerror = () => { if (worker.current === next) { setError('De analysewerker kon niet starten. Probeer opnieuw.'); setBusy(false) }; finish() }
      const samples = buffer.getChannelData(selectedChannel).slice()
      next.postMessage({ samples, sampleRate: buffer.sampleRate, sensitivity, minIntervalMs: interval }, [samples.buffer])
    } catch (reason) { worker.current?.terminate(); worker.current = null; setBusy(false); setError(String(reason)) }
  }

  async function load(file: File) {
    const request = ++generation.current
    worker.current?.terminate(); worker.current = null; audio.current?.pause()
    decoded.current = null; setAnalysis(undefined); setChannels(0); setPosition(0); setError(''); setBusy(true)
    URL.revokeObjectURL(objectUrl.current); objectUrl.current = ''; setUrl(''); setName(file.name)
    try {
      if (file.size > MAX_WAV_BYTES) throw new Error('Kies een WAV van maximaal 64 MiB.')
      const bytes = await file.arrayBuffer()
      if (request !== generation.current) return
      const info = inspectWav(bytes)
      if (info.duration * info.sampleRate * info.channels > 32_000_000) throw new Error('Deze WAV bevat te veel audiogegevens. Exporteer alleen het kickkanaal of een korter fragment.')
      const context = new OfflineAudioContext(1, 1, info.sampleRate)
      const buffer = await context.decodeAudioData(bytes)
      if (request !== generation.current) return
      decoded.current = buffer
      const nextUrl = URL.createObjectURL(file); objectUrl.current = nextUrl
      setUrl(nextUrl); setName(file.name); setChannels(buffer.numberOfChannels); setChannel(0)
      analyze(buffer, 0)
    } catch (reason) {
      if (request === generation.current) { setError(reason instanceof Error ? reason.message : 'WAV kon niet worden geopend.'); setBusy(false) }
    }
  }

  useEffect(() => {
    const player = audio.current
    return () => {
      generation.current++; worker.current?.terminate(); decoded.current = null
      player?.pause(); player?.removeAttribute('src'); player?.load()
      URL.revokeObjectURL(objectUrl.current)
    }
  }, [])
  useEffect(() => { if (audio.current) audio.current.volume = .35 }, [url])
  useEffect(() => {
    if (!host.current || !active || live) return
    let view: StageSimulator
    try { view = new StageSimulator(host.current, show.fixtures, show.camera, show.bandMembers); simulator.current = view; setPreviewError('') }
    catch { setPreviewError('3D-weergave niet beschikbaar. Audio en analyse blijven bruikbaar.'); return }
    const previewPlayer = createAudioLivePlayer()
    let frame = 0, reported = -Infinity
    const update = (now: number) => {
      const input = latest.current, seconds = audio.current?.currentTime ?? 0
      const result = previewPlayer.evaluate(input.show, { mode: 'automation', activeLookId: input.lookId }, seconds * input.bpm / 60,
        input.analysis ? { seconds, analysis: input.analysis, mode: input.follow, bpm: input.bpm,
          reactions: input.reactions, decayMs: input.decay, floor: input.floor } : undefined)
      view.update(result.frame, input.settings)
      if (now - reported > 100) { setPosition(seconds); reported = now }
      frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)
    return () => { cancelAnimationFrame(frame); view.dispose(); simulator.current = null }
  }, [show.fixtures, show.bandMembers, active, live])
  useEffect(() => { simulator.current?.setCamera(show.camera) }, [show.camera])

  const currentKick = kickIndexAt(analysis, position)
  const duration = analysis?.duration ?? 0
  const waveform = analysis?.waveform.map((value, index, bins) => {
    const x = index * 1000 / bins.length
    return `M${x},${50 - value * 45}v${value * 90}`
  }).join(' ') ?? ''
  return <section hidden={!active} className={`audio-studio${live ? ' audio-studio-live' : ''}`} aria-label="Audio en kicktest">
    <header>{live ? <><div className="audio-compact-heading"><strong>Audio · {name || 'Geen opname geladen'}</strong>{onConfigure && <button type="button" onClick={onConfigure}>Audio instellen</button>}</div><small>{analysis ? `${effectiveBpm} BPM · ${follow === 'kicks' ? 'Losse kicks' : 'Stabiel tempo'} · kick ${currentKick + 1}` : 'Optioneel: laad een WAV bij Setup → Audio.'}{runtime && analysis ? ' · Gebruik WAV koppelen aan de livesessie; fysieke uitvoer schakel je apart in via DMX-uitvoer.' : ''}</small></> : <><p className="section-label">AUDIO INSTELLEN & TESTEN</p><h2>Van kick naar licht</h2><p>Open een kickopname, controleer de detecties en probeer de reactie per groep.</p><small>Lokale proefweergave · geen DMX-uitvoer. De speler wordt gedeeld met Live; de opname blijft beschikbaar totdat je de pagina vernieuwt.</small></>}</header>
    <div className="audio-studio-layout"><div>
      <label hidden={live} className="audio-file">Open WAV<input type="file" disabled={busy} accept=".wav,audio/wav,audio/x-wav" onChange={event => { const file = event.target.files?.[0]; if (file) void load(file); event.target.value = '' }} /></label>
      <small hidden={live}>PCM 16/24/32-bit of float32 · maximaal 64 MiB / {MAX_AUDIO_DURATION_SECONDS / 60} minuten. Geen microfoon of systeemaudio nodig.</small>
      {name && !live && <p className="audio-filename">{name}</p>}
      {busy && <p role="status">WAV wordt gedecodeerd en op kickaanslagen geanalyseerd…</p>}
      {error && <p role="alert">{error}</p>}
      <audio hidden={live && !url} ref={audio} src={url || undefined} controls preload="metadata" onTimeUpdate={event => setPosition(event.currentTarget.currentTime)} onError={() => { if (url) setError('De browser kan deze WAV niet afspelen. Exporteer als PCM 16-bit WAV.') }} />
      <details className="audio-detail-controls" open={!live} hidden={live && !analysis}><summary>Audio volgen & instellingen</summary>
      <label><input type="checkbox" onChange={event => { if (audio.current) audio.current.loop = event.target.checked }} /> Herhalen</label>
      {live && <label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> {runtime ? 'Deze WAV beschikbaar maken voor runtimekoppeling' : 'Live-simulatie volgt deze WAV'}</label>}
      <label>Audio volgen<select aria-label="Audio volgen" value={follow} onChange={event => setFollow(event.target.value as 'tempo' | 'kicks')}><option value="tempo">Stabiel tempo · bestaande Lookpatronen</option><option value="kicks">Losse kicks · reactie per groep</option></select></label>
      <p role="status">{live && !enabled ? 'Audiokoppeling uit · Live gebruikt de vrije klok.' : !analysis ? 'Laad een WAV om de lichtshow met audio te synchroniseren.' : follow === 'tempo' ? `Patronen volgen ${effectiveBpm} BPM op de WAV-tijdlijn${automaticTempo && analysis.bpm ? ' · geschat kicktempo' : ' · handmatig tempo'}.` : `Elke gedetecteerde kick stuurt een puls of patroonstap per groep. Look-overgangen volgen de ingestelde overgangsduur op ${effectiveBpm} BPM; de kicks blijven reageren tijdens de fade.`}</p>
      {analysis && follow === 'kicks' && <small>Stel de overgang in bij Ontwerpen → Showinstellingen → Overgang naar een andere Look. Een duur van 0 beats wisselt zonder fade op het gekozen startmoment. De volgende beat volgt het BPM-raster, niet de volgende echte kick. Pauzeren bevriest de fade; een BPM-wijziging of terugzoeken beëindigt de lopende overgang.</small>}
      {analysis && <><svg className="audio-waveform" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={`Golfvorm met ${analysis.kicks.length} kickdetecties`}>
        <path d={waveform} className="audio-wave" /><path className="audio-markers" d={analysis.kicks.map(kick => `M${kick.time / duration * 1000},5v90`).join(' ')} /><path className="audio-cursor" d={`M${position / duration * 1000},0v100`} />
      </svg><p aria-live="off">{analysis.kicks.length} kicks · positie {position.toFixed(1)} s · kick {currentKick + 1} · {analysis.bpm ? `${Math.round(analysis.bpm)} kicks/min · regelmaat ${Math.round(analysis.confidence * 100)}%` : 'Geen betrouwbaar kicktempo'}</p></>}
      <details><summary>Detectie afstellen</summary><div className="audio-settings">
        <label>Kanaal<select disabled={!channels || busy} value={channel} onChange={event => { setChannel(Number(event.target.value)); setDirty(true) }}>{Array.from({ length: channels }, (_, i) => <option key={i} value={i}>Kanaal {i + 1}</option>)}</select></label>
        <label>Gevoeligheid · {Math.round(sensitivity * 100)}%<input type="range" min="0" max="1" step=".05" value={sensitivity} disabled={busy} onChange={event => { setSensitivity(Number(event.target.value)); setDirty(true) }} /></label>
        <label>Minimale afstand · {interval} ms<input type="range" min="80" max="500" step="10" value={interval} disabled={busy} onChange={event => { setInterval(Number(event.target.value)); setDirty(true) }} /></label>
        <button disabled={!channels || busy} onClick={() => decoded.current && analyze(decoded.current, channel)}>Analyseer opnieuw</button>
        {dirty && <small>Instellingen gewijzigd: analyseer opnieuw om ze toe te passen.</small>}
      </div></details>
      <details open={!live}><summary>Tempo & lichtreactie per groep</summary><div className="audio-settings">
        {!live && <label>Look<select value={selectedLook?.id ?? ''} onChange={event => setLookId(event.target.value)}>{show.looks.map(look => <option key={look.id} value={look.id}>{look.name}</option>)}</select></label>}
        <label>Patroontempo · {effectiveBpm} BPM<input type="range" min="30" max="240" value={effectiveBpm} onChange={event => { setAutomaticTempo(false); setBpm(Number(event.target.value)) }} /></label>
        <button disabled={!analysis?.bpm} onClick={() => setAutomaticTempo(true)}>Neem kicktempo over</button><small>Een kick is niet altijd één muzikale beat. Controleer het tempo; halveer of verdubbel zo nodig met de slider.</small>
        <fieldset disabled={follow !== 'kicks'}><legend>Reageren op losse kicks</legend>
        <label>Pulsuitloop · {decay} ms<input type="range" min="100" max="1000" step="25" value={decay} onChange={event => setDecay(Number(event.target.value))} /></label>
        <label>Basislicht tussen kicks · {Math.round(floor * 100)}%<input type="range" min="0" max="1" step=".05" value={floor} onChange={event => setFloor(Number(event.target.value))} /></label>
        {show.groups.map(group => <label key={group.id}>{group.name}<select aria-label={`Audioreactie ${group.name}`} value={reactions[group.id] ?? 'look'} onChange={event => {
          const value = event.target.value as AudioReaction
          setReactions(current => ({ ...current, ...Object.fromEntries((live && linkedGroups ? linkedGroups(group.id) : [group.id]).map(id => [id, value])) }))
        }}><option value="look">Bestaande Look op patroontempo</option><option value="pulse">Puls bij elke kick</option><option value="step">Patroon ⅛ cyclus verder per kick</option><option value="static">Vast licht</option></select></label>)}
        </fieldset>
        <small>Uitgeschakelde Look-groepen blijven uit. Kleuren, groepsmasters en minimale podiumdekking blijven gelden. Deze test wijzigt je opgeslagen Look niet.</small>
      </div></details>
      </details>
    </div>{!live && <aside><div ref={host} className="audio-stage" role="img" aria-label="Lichtshow op de WAV-tijdlijn" />{previewError && <p role="alert">{previewError}</p>}<SimulationControls show={show} {...controls} /><p className="muted">Wisselen naar Live behoudt de speler. Buiten Audio en Live pauzeert de opname. De audioreactie is alleen voor deze test/livesessie en wijzigt je opgeslagen Looks niet.</p></aside>}</div>
  </section>
}
