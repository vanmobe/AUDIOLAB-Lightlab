import type { ShowDocument } from './domain'
import type { useRuntimeLive } from './useRuntimeLive'
import { LocalRuntimePanel } from './LocalRuntimePanel'
import { RuntimeOutputPanel } from './RuntimeOutputPanel'
import { WingBankSync } from './WingBankSync'
import './RuntimeWorkspace.css'
import { useEffect, useMemo, useRef } from 'react'

/** Shares the existing Live controller: navigation does not restart playback or detach its WAV. */
export function RuntimeWorkspace({
  show,
  runtime,
  onNavigate,
  loadBpm = runtime.status?.bpm ?? 120,
}: {
  show: ShowDocument
  runtime: ReturnType<typeof useRuntimeLive>
  onNavigate: (target: 'patch' | 'control' | 'audio' | 'live') => void
  loadBpm?: number
}) {
  const { status, pending, error } = runtime
  const active = status?.status === 'running' || status?.status === 'starting'
  const validLoadTempo = Number.isFinite(loadBpm) && loadBpm >= 30 && loadBpm <= 240
  const differentShow = useMemo(
    () => runtime.show && JSON.stringify(runtime.show) !== JSON.stringify(show),
    [runtime.show, show],
  )
  const refresh = useRef(runtime.refreshStatus)
  refresh.current = runtime.refreshStatus
  useEffect(() => {
    if (runtime.connected || pending) return
    // Discover start/stop without another user check or automatically attaching a show.
    const timer = setInterval(() => void refresh.current(), 3000)
    return () => clearInterval(timer)
  }, [runtime.connected, pending])
  return (
    <section className="runtime-workspace" aria-label="Runtimebeheer">
      <header className="runtime-page-heading">
        <div>
          <p className="section-label">TECHNIEK & VERBINDINGEN</p>
          <h2>Runtime</h2>
          <p>Start de motor, verbind je apparatuur en schakel DMX in.</p>
        </div>
        <button onClick={() => onNavigate('live')}>Naar Live →</button>
      </header>
      <LocalRuntimePanel />
      <section className="runtime-card" aria-label="Geladen show">
        <div className="runtime-card-heading">
          <h2>Livesessie</h2>
          <strong>
            {error ? 'Status onbekend' : active ? 'Show actief' : status ? 'Geen actieve show' : 'Niet verbonden'}
          </strong>
        </div>
        <p>
          {active
            ? (runtime.show?.name ?? 'Er draait een show in de runtime.')
            : `${show.name} · ${show.looks.length} Looks · ${show.fixtures.length} fixtures`}
        </p>
        {error && <p role="alert">{error}</p>}
        {active && differentShow && (
          <p className="runtime-live-warning">
            De geladen show verschilt van je editor. Laad de editorshow om je wijzigingen over te nemen.
          </p>
        )}
        <div className="local-runtime-actions">
          {active ? (
            <>
              <button
                disabled={pending || !show.looks.length || !validLoadTempo}
                onClick={() => void runtime.loadEditorShow(show, loadBpm)}
              >
                Laad editorshow in runtime
              </button>
              {!runtime.connected && (
                <button disabled={pending} onClick={() => void runtime.attach()}>
                  Verbind met livesessie
                </button>
              )}
              <button className="lab-danger" disabled={pending} onClick={() => void runtime.stop()}>
                Stop show
              </button>
            </>
          ) : status ? (
            <button
              disabled={pending || !show.looks.length || !validLoadTempo}
              onClick={() => void runtime.loadEditorShow(show, loadBpm)}
            >
              Laad editorshow in runtime
            </button>
          ) : error ? (
            <button disabled={pending} onClick={() => void runtime.refreshStatus()}>
              Opnieuw proberen
            </button>
          ) : (
            <span role="status">Verbinding wordt gecontroleerd…</span>
          )}
        </div>
        <small>
          {validLoadTempo
            ? `Laden op ${loadBpm} BPM. Tempo aanpassen kan in Live.`
            : 'Kies een geldig tempo in Live voordat je laadt.'}
        </small>
        {active && (
          <small>
            Laden vervangt de sessie door {show.name} ({show.looks.length} Looks). DMX en de WAV-koppeling gaan uit;
            tijdelijke live-aanpassingen vervallen.
          </small>
        )}
        <small>
          Een show stoppen laat de runtime beschikbaar voor AI en WING. Live en Runtime bedienen dezelfde sessie.
        </small>
      </section>
      <section className="runtime-card" aria-label="DMX-uitvoer beheren">
        {status?.sessionId ? (
          <RuntimeOutputPanel
            key={status.sessionId}
            sessionId={status.sessionId}
            running={status.status === 'running'}
          />
        ) : (
          <>
            <h2>DMX-uitvoer</h2>
            <p>Start hierboven je show. Daarna kun je DMX met één knop aanzetten.</p>
          </>
        )}
        <button onClick={() => onNavigate('patch')}>Patch & netwerk instellen</button>
      </section>
      <div className="runtime-link-grid">
        <section className="runtime-card">
          <h2>WING</h2>
          <p>
            Vergelijk en verstuur de knop- en rotarytoewijzingen uit je show. Hiervoor hoeft geen livesessie te draaien.
          </p>
          <WingBankSync show={show} initialBank={1} />
          <button onClick={() => onNavigate('control')}>Banken indelen</button>
          <small>Configuratie via het netwerk. MIDI-ontvangst is een aparte koppeling en nog niet beschikbaar.</small>
        </section>
        <section className="runtime-card">
          <h2>Audio</h2>
          <p>Gebruik een WAV en kickanalyse om je lichtshow te sturen. Koppel de speler in Live aan de livesessie.</p>
          <button onClick={() => onNavigate('audio')}>Audio instellen</button>
          <small>Live audio-ingang en Dante zijn nog niet aangesloten.</small>
        </section>
      </div>
    </section>
  )
}
