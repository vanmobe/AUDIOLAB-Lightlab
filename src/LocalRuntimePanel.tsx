import { useEffect, useRef, useState } from 'react'
import { requestLocalRuntime, type LocalRuntimeStatus } from './local-runtime-client'
import './LocalRuntimePanel.css'

const labels: Record<LocalRuntimeStatus['state'], string> = {
  stopped: 'Gestopt', starting: 'Starten…', running: 'Actief', external: 'Actief buiten deze starter', error: 'Startprobleem',
}
const levels = { info: 'Info', warning: 'Waarschuwing', error: 'Fout' }

export function LocalRuntimePanel() {
  const [status, setStatus] = useState<LocalRuntimeStatus | null>(null)
  const [issue, setIssue] = useState('')
  const [busy, setBusy] = useState(false)
  const mounted = useRef(false)
  const pending = useRef<AbortController | null>(null)

  async function check(action: 'status' | 'start' | 'stop' = 'status') {
    if (pending.current || !mounted.current || (action === 'start' && (!status?.canStart || issue)) || (action === 'stop' && !status?.canStop)) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    try {
      const next = await requestLocalRuntime(action, controller.signal)
      if (mounted.current && pending.current === controller) { setStatus(next); setIssue('') }
    } catch (error) {
      if (mounted.current && pending.current === controller) setIssue(error instanceof Error ? error.message : 'Status niet beschikbaar. Controleer opnieuw.')
    } finally {
      if (mounted.current && pending.current === controller) { pending.current = null; setBusy(false) }
    }
  }

  useEffect(() => {
    mounted.current = true
    void check()
    return () => { mounted.current = false; pending.current?.abort(); pending.current = null }
  }, [])
  useEffect(() => {
    const timer = setInterval(() => { void check() }, 5000)
    return () => clearInterval(timer)
  }, [])

  return <section className="local-runtime-panel runtime-card" aria-label="Runtime starten en stoppen">
    <div className="local-runtime-content">
      <div className="runtime-card-heading"><h2>Lokale runtime</h2><strong role="status">{issue ? 'Status onbekend' : status?.stopping ? 'Stoppen…' : status ? labels[status.state] : 'Controleren…'}</strong></div>
      <p>{issue || status?.message || 'De lokale starter wordt gecontroleerd.'}</p>
      <p className="muted">De motor voor AI, WING-synchronisatie en DMX. Starten zet geen lampen aan. Stoppen beëindigt ook de livesessie en netwerkuitvoer.</p>
      <div className="local-runtime-actions">
        <button type="button" disabled={busy || !!issue || !status?.canStart} onClick={() => { void check('start') }}>Start runtime</button>
        <button type="button" className="lab-danger" disabled={busy || !status?.canStop} onClick={() => { void check('stop') }}>Stop runtime</button>
        {!!issue && <button type="button" disabled={busy} onClick={() => { void check() }}>Opnieuw proberen</button>}
      </div>
      {status?.state === 'external' && <p className="muted">Deze runtime is elders gestart. Stop hem in de oorspronkelijke terminal of starter; daarna kun je hem vanaf deze pagina beheren.</p>}
      {status?.state === 'running' && status.canStop === undefined && <p className="muted">Deze starter ondersteunt stoppen vanuit de pagina nog niet. Sluit de oude starter en open de bijgewerkte Lightlab-starter.</p>}
      <details className="runtime-log-details"><summary>Probleem oplossen</summary>
      <p className="muted runtime-build-info">Een pagina vernieuwen herstart de runtime niet. Stop en start de runtime om een bijgewerkte versie te laden.</p>
      {status?.startedAt && <p>Laatst gestart: {new Date(status.startedAt).toLocaleString('nl-BE')}</p>}
      {status?.buildMessage && <details><summary>Versie-informatie</summary><p className="muted">{status.buildMessage}</p></details>}
      <h3>Logging · {status?.logs.length ?? 0} berichten</h3>
      <p className="muted">{issue && status ? 'Laatst ontvangen berichten. De huidige status is niet bevestigd. ' : ''}Maximaal 200 berichten van deze starter, alleen voor deze sessie.</p>
      {status?.logs.length ? <ol className="local-runtime-logs" aria-label="Recente runtimeberichten" tabIndex={0}>
        {status.logs.map(log => <li key={log.id} data-level={log.level}>
          <time dateTime={log.time}>{new Date(log.time).toLocaleTimeString('nl-BE')}</time>
          <span className="local-runtime-level">{levels[log.level]}</span><span>{log.message}</span>
        </li>)}
      </ol> : <p className="muted">Nog geen runtimeberichten ontvangen.</p>}
      </details>
    </div>
  </section>
}
