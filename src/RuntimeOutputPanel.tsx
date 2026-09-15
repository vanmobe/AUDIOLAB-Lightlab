import { useEffect, useRef, useState } from 'react'
import { getOutputStatus, setOutputState, type PlaybackOutputStatus } from './playback-output-client'
import './RuntimeOutputPanel.css'

/** Reads only on mount/reconnect; the explicit DMX-on click supplies API confirmation. */
export function RuntimeOutputPanel({
  sessionId,
  running,
  onPrepare,
}: {
  sessionId: string
  running: boolean
  onPrepare?: () => void
}) {
  const [status, setStatus] = useState<PlaybackOutputStatus>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(''),
    [fresh, setFresh] = useState(false)
  const mounted = useRef(false),
    epoch = useRef(0)
  const reader = useRef<AbortController | null>(null),
    writer = useRef<AbortController | null>(null)
  async function refresh() {
    if (reader.current || writer.current) return
    const controller = new AbortController(),
      version = epoch.current
    reader.current = controller
    try {
      const next = await getOutputStatus(sessionId, controller.signal)
      if (mounted.current && !controller.signal.aborted && epoch.current === version) {
        setStatus(next)
        setFresh(true)
        setError('')
      }
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted && epoch.current === version) {
        setFresh(false)
        setError(cause instanceof Error ? cause.message : 'Uitvoerstatus niet bereikbaar.')
      }
    } finally {
      if (reader.current === controller) reader.current = null
    }
  }
  useEffect(() => {
    mounted.current = true
    setStatus(undefined)
    setFresh(false)
    setPending(false)
    void refresh()
    const timer = setInterval(() => void refresh(), 1000)
    return () => {
      mounted.current = false
      epoch.current++
      clearInterval(timer)
      reader.current?.abort()
      writer.current?.abort()
      reader.current = null
      writer.current = null
    }
  }, [sessionId])
  async function change(command: 'arm' | 'disarm') {
    if (
      command === 'arm' &&
      (!running ||
        writer.current ||
        pending ||
        !fresh ||
        !status ||
        status.armError ||
        !status.routes.length ||
        status.state === 'armed')
    )
      return
    writer.current?.abort()
    reader.current?.abort()
    reader.current = null
    epoch.current++
    const controller = new AbortController()
    writer.current = controller
    const current = () => mounted.current && !controller.signal.aborted && writer.current === controller
    setPending(true)
    setError('')
    try {
      const next = await setOutputState(sessionId, command, command === 'arm', controller.signal)
      if (current()) {
        setStatus(next)
        setFresh(true)
      }
    } catch (cause) {
      if (current()) {
        setFresh(false)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Uitvoeropdracht mislukt. Controleer de status; er wordt niet automatisch opnieuw ingeschakeld.',
        )
      }
    } finally {
      if (current()) {
        writer.current = null
        setPending(false)
      }
    }
  }
  const armed = status?.state === 'armed'
  const blockedReason = !running
    ? 'Start eerst een livesessie om DMX te verzenden.'
    : !fresh
      ? 'Controleer de verbinding om DMX in te schakelen.'
      : !status?.routes.length
        ? 'Stel eerst een bestemming in bij Setup → Patch & netwerk en laad de show opnieuw.'
        : ''
  return (
    <section className={`runtime-output ${armed ? 'is-armed' : ''}`} aria-label="Fysieke lichtuitvoer">
      <div className="runtime-output-heading">
        <h3>DMX-uitvoer</h3>
        <strong role="status">
          {!fresh ? 'Onbekend' : armed ? 'Verzendt' : status?.state === 'faulted' ? 'Fout' : 'Uit'}
        </strong>
      </div>
      <p className="muted">Stuurt de geladen show naar de lampen via sACN / Art-Net.</p>
      {status?.armError && <p role="alert">{status.armError} Pas de patch aan en start een nieuwe snapshot.</p>}
      {status?.lastError && <p role="alert">{status.lastError} Controleer je node en verbinding.</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button disabled={pending} onClick={() => void refresh()}>
            Opnieuw proberen
          </button>
        </div>
      )}
      {!fresh && (
        <p>
          Verbindingsverlies bewijst niet dat de lampen uit zijn. Controleer je node of gebruik de fysieke
          noodbediening.
        </p>
      )}
      {!armed && blockedReason && (
        <div className="runtime-output-blocker" role="status">
          <p>{blockedReason}</p>
          {!running && onPrepare && <button onClick={onPrepare}>Ga naar de livesessie</button>}
        </div>
      )}
      <div className="runtime-output-actions">
        {!armed && (
          <button
            disabled={!fresh || !running || pending || !!status?.armError || !status?.routes.length}
            onClick={() => void change('arm')}
          >
            DMX-uitvoer aan
          </button>
        )}
        {(armed || pending || !fresh) && (
          <button className="lab-danger" onClick={() => void change('disarm')}>
            DMX-uitvoer uit
          </button>
        )}
      </div>
      {pending && <p role="status">Uitvoeropdracht wordt verwerkt…</p>}
      <details className="runtime-output-details">
        <summary>Bestemmingen & uitvoergedrag</summary>
        {!!status?.routes.length && (
          <ul className="runtime-output-routes">
            {status.routes.map((route) => (
              <li key={route.universe}>
                <b>Universe {route.universe}</b>
                <span>
                  {route.protocol === 'sacn' ? 'sACN' : 'Art-Net'} · {route.host}:
                  {route.protocol === 'sacn' ? '5568' : '6454'}
                </span>
                {route.protocol === 'artnet' && <small>Art-Net Port-Address {route.universe - 1}</small>}
              </li>
            ))}
          </ul>
        )}
        <p>
          Bestemmingen komen uit de geladen showsnapshot. Wijzig de patch bij Setup → Patch & netwerk en laad de show
          opnieuw om wijzigingen over te nemen.
        </p>
        <p>
          Zonder audiokoppeling blijft DMX verzenden als je de browser sluit. Met gekoppelde WAV schakelt verlies van de
          audioklok de uitvoer uit.
        </p>
        <small>
          UDP bevestigt geen ontvangst door de lampen. Blackout in de show blijft zwarte frames sturen; DMX-uitvoer uit
          probeert blackout te sturen en beëindigt daarna de stream. Een kabelbreuk kan dat verhinderen.
        </small>
      </details>
    </section>
  )
}
