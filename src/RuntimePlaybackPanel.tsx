import { useEffect, useRef, useState } from 'react'
import type { RuntimeMode, ShowDocument } from './domain'
import {
  commandPlayback,
  getPlaybackStatus,
  PlaybackUnavailable,
  startPlayback,
  type PlaybackCommand,
  type PlaybackStatus,
} from './playback-client'
import './RuntimePlaybackPanel.css'
import { safetyLabel } from './CoverageStatus'
import { RuntimeOutputPanel } from './RuntimeOutputPanel'

const modeLabels: Record<RuntimeMode, string> = {
  automation: 'Afspelen',
  static: 'Beeld vasthouden',
  safety: 'Gedeeltelijke blackout',
  blackout: 'Blackout',
}

export function RuntimePlaybackPanel({ show, dirty = false }: { show: ShowDocument; dirty?: boolean }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<PlaybackStatus>()
  const [lookId, setLookId] = useState(show.activeLookId)
  const [bpm, setBpm] = useState('120')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [loaded, setLoaded] = useState<{ sessionId: string; show: ShowDocument }>()
  const alive = useRef(false),
    unavailable = useRef(false),
    epoch = useRef(0)
  const discoveredSession = useRef(false),
    bpmEdited = useRef(false)
  const reading = useRef<AbortController | null>(null),
    mutation = useRef<AbortController | null>(null)
  const loadedShow = loaded?.sessionId === status?.sessionId ? loaded?.show : undefined
  const look = show.looks.find((item) => item.id === lookId) ?? show.looks[0]
  const validBpm = bpm.trim() !== '' && Number.isFinite(Number(bpm)) && Number(bpm) >= 30 && Number(bpm) <= 240
  const active = status?.status === 'running' || status?.status === 'starting'
  async function refresh(manual = false) {
    if (reading.current || (!manual && unavailable.current)) return
    const controller = new AbortController()
    reading.current = controller
    const version = epoch.current
    try {
      const next = await getPlaybackStatus(controller.signal)
      if (alive.current && !controller.signal.aborted && epoch.current === version) {
        if (next.sessionId && !discoveredSession.current) {
          discoveredSession.current = true
          if (!bpmEdited.current) setBpm(String(next.bpm))
        }
        setStatus(next)
        unavailable.current = false
        if (manual) setError('')
      }
    } catch (error) {
      if (alive.current && !controller.signal.aborted && epoch.current === version) {
        unavailable.current = error instanceof PlaybackUnavailable
        setError(error instanceof Error ? error.message : 'Status ophalen mislukt.')
      }
    } finally {
      if (reading.current === controller) reading.current = null
    }
  }
  useEffect(() => {
    alive.current = true
    void refresh()
    return () => {
      alive.current = false
      reading.current?.abort()
      mutation.current?.abort()
      reading.current = null
    }
    // A browser lifecycle never starts or stops the autonomous worker.
  }, [])
  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => {
      if (!mutation.current) void refresh()
    }, 500)
    return () => clearInterval(timer)
  }, [open])

  async function run(command?: PlaybackCommand) {
    if ((!command && (pending || active || dirty || !look || !validBpm)) || (command && !status?.sessionId)) return
    if (pending && command?.command !== 'stop') return
    mutation.current?.abort()
    reading.current?.abort()
    reading.current = null
    const controller = new AbortController()
    mutation.current = controller
    epoch.current++
    const isCurrent = () => alive.current && !controller.signal.aborted && mutation.current === controller
    setPending(true)
    setError('')
    try {
      const next = command
        ? await commandPlayback(status!.sessionId!, command, controller.signal)
        : await startPlayback(show, look!.id, Number(bpm), controller.signal)
      if (!isCurrent()) return
      setStatus(next)
      unavailable.current = false
      if (next.sessionId) discoveredSession.current = true
      if (!command && next.sessionId) setLoaded({ sessionId: next.sessionId, show })
    } catch (error) {
      if (isCurrent()) {
        setError(error instanceof Error ? error.message : 'Runtimeopdracht mislukt.')
        // Never repeat an ambiguous or conflicting mutation. Read back the server state instead.
        void refresh()
      }
    } finally {
      if (isCurrent()) {
        mutation.current = null
        setPending(false)
      }
    }
  }

  return (
    <details className="runtime-playback" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Autonome runtimeproef</summary>
      <p>
        Laad een opgeslagen showsnapshot in de lokale runtime. Die blijft zelfstandig draaien nadat je dit tabblad
        sluit. Fysieke sACN-/Art-Net-uitvoer schakel je daarna afzonderlijk in. Het tempo is handmatig, zonder audio- of
        MIDI-synchronisatie. Kies in Live de lokale runtime als bron om haar te bedienen.
      </p>
      <div className="runtime-playback-inputs">
        <label>
          Look voor nieuwe snapshot
          <select
            aria-label="Startlook runtimeproef"
            value={look?.id ?? ''}
            disabled={pending || active || !show.looks.length}
            onChange={(event) => setLookId(event.target.value)}
          >
            {!show.looks.length && <option value="">Geen Looks</option>}
            {show.looks.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tempo (BPM)
          <input
            aria-label="Tempo runtimeproef"
            type="number"
            min="30"
            max="240"
            step="any"
            value={bpm}
            aria-invalid={!validBpm}
            onChange={(event) => {
              bpmEdited.current = true
              setBpm(event.target.value)
            }}
          />
        </label>
      </div>
      {dirty && <p>Bewaar of verwerp je patchwijzigingen voordat je een nieuwe snapshot start.</p>}
      {!validBpm && <p role="status">Kies 30–240 BPM. Stoppen blijft beschikbaar.</p>}
      <div className="runtime-playback-actions">
        <button disabled={pending || active || dirty || !look || !validBpm} onClick={() => void run()}>
          Start opgeslagen snapshot
        </button>
        <button onClick={() => void refresh(true)}>Status ophalen</button>
        {status?.sessionId && (
          <button className="runtime-stop" disabled={!active && !pending} onClick={() => void run({ command: 'stop' })}>
            Stop runtimeproef
          </button>
        )}
      </div>
      {pending && <p role="status">Opdracht wordt verwerkt…</p>}
      {error && <p role="alert">{error}</p>}
      {status && (
        <>
          <p role="status">
            Runtime:{' '}
            {
              (
                {
                  idle: 'niet gestart',
                  starting: 'starten',
                  running: 'actief',
                  stopped: 'gestopt',
                  faulted: 'fout',
                } as const
              )[status.status]
            }{' '}
            · {status.outputSent ? 'DMX-frame verzonden' : 'geen DMX-frame verzonden bij laatste meting'}
          </p>
          {open && status.sessionId && (
            <RuntimeOutputPanel
              key={status.sessionId}
              sessionId={status.sessionId}
              running={status.status === 'running'}
            />
          )}
          <dl className="runtime-playback-status">
            <div>
              <dt>Moment</dt>
              <dd>{status.atBeats.toFixed(2)} beats</dd>
            </div>
            <div>
              <dt>Tempo</dt>
              <dd>{status.bpm} BPM · handmatige klok</dd>
            </div>
            <div>
              <dt>Berekende frames</dt>
              <dd>{status.frameCount}</dd>
            </div>
            <div>
              <dt>Universes</dt>
              <dd>{status.universeCount}</dd>
            </div>
            <div>
              <dt>Showstand</dt>
              <dd>{modeLabels[status.mode]}</dd>
            </div>
            <div>
              <dt>Look</dt>
              <dd>{loadedShow?.looks.find((item) => item.id === status.lookId)?.name ?? status.lookId ?? '—'}</dd>
            </div>
          </dl>
          {status.error && <p role="alert">{status.error}</p>}
          {status.sessionId && !loadedShow && (
            <p>
              Deze sessie is eerder of vanuit een ander tabblad gestart. De geladen snapshot is hier niet bekend;
              huidige browserwijzigingen zijn niet overgenomen.
            </p>
          )}
          {loadedShow && loadedShow !== show && (
            <p>
              Je show is sinds het starten gewijzigd. De runtime gebruikt nog de eerdere snapshot. Stop de proef en
              start opnieuw om wijzigingen te laden.
            </p>
          )}
          {active && (
            <div className="runtime-playback-commands">
              <button disabled={pending || !validBpm} onClick={() => void run({ command: 'bpm', bpm: Number(bpm) })}>
                Tempo toepassen op runtime
              </button>
              {loadedShow && (
                <label>
                  Look in geladen snapshot
                  <select
                    aria-label="Look runtimeproef wijzigen"
                    value={status.lookId ?? ''}
                    disabled={pending}
                    onChange={(event) => void run({ command: 'look', lookId: event.target.value })}
                  >
                    {loadedShow.looks.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="runtime-playback-actions">
                {(
                  [
                    ['automation', 'Afspelen'],
                    ['static', 'Beeld vasthouden'],
                    ['safety', 'Gedeeltelijke blackout'],
                    ['blackout', 'Blackout'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    aria-pressed={status.mode === mode}
                    disabled={pending}
                    onClick={() => void run({ command: 'mode', mode: mode as RuntimeMode })}
                  >
                    {mode === 'safety' && loadedShow ? safetyLabel(loadedShow) : label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </details>
  )
}
