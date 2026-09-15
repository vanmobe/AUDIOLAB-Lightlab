import { useEffect, useRef, useState } from 'react'
import type { ShowDocument } from './domain'
import { inspectDmx, inspectionRequest, type DmxInspection, type InspectionMode } from './dmx-inspection'
import './DmxInspector.css'

export function DmxFixtureDisclosure({ fixture, name }: { fixture: DmxInspection['universes'][number]['fixtures'][number]; name: string }) {
  const [open, setOpen] = useState(false)
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary>{name} · adres {fixture.address}–{fixture.address + fixture.channels.length - 1}</summary>
    {open && <table><thead><tr><th>Kanaal</th><th>Functie</th><th>Waarde</th></tr></thead><tbody>{fixture.channels.map((value, index) => <tr key={index}><td>{fixture.address + index}</td><td>{fixture.channelLabels[index]}</td><td>{value}</td></tr>)}</tbody></table>}
  </details>
}

export function DmxInspector({ show, dirty = false }: { show: ShowDocument; dirty?: boolean }) {
  const [lookId, setLookId] = useState(show.activeLookId)
  const [mode, setMode] = useState<InspectionMode>('automation')
  const [beat, setBeat] = useState('0')
  const selectedLook = show.looks.find(look => look.id === lookId) ?? show.looks[0]
  const validBeat = beat.trim() !== '' && Number.isFinite(Number(beat)) && Number(beat) >= 0 && Number(beat) <= 64
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ show: ShowDocument; key: string; data: DmxInspection }>()
  const request = useRef<AbortController | null>(null)
  const key = `${selectedLook?.id}:${mode}:${beat}:${dirty}`
  const context = useRef({ show, key })
  context.current = { show, key }
  useEffect(() => {
    request.current?.abort(); request.current = null
    setPending(false); setResult(undefined); setError('')
    return () => { request.current?.abort(); request.current = null }
  }, [show, key])
  async function calculate() {
    if (pending || dirty || !selectedLook || !validBeat) return
    request.current?.abort()
    const controller = new AbortController(); request.current = controller
    const captured = context.current
    const isCurrent = () => !controller.signal.aborted && request.current === controller && context.current.show === captured.show && context.current.key === captured.key
    setPending(true); setError(''); setResult(undefined)
    try {
      const body = inspectionRequest(show, selectedLook.id, mode, Number(beat), crypto.randomUUID())
      const data = await inspectDmx(body, controller.signal)
      if (isCurrent()) setResult({ ...captured, data })
    } catch (error) {
      if (isCurrent()) setError(error instanceof Error ? error.message : 'DMX-proef mislukt. Probeer opnieuw.')
    } finally { if (isCurrent()) setPending(false) }
  }
  const visible = !dirty && result?.show === show && result.key === key ? result.data : undefined
  const unverified = visible?.issues.filter(issue => issue.code === 'unverified-personality' && issue.severity === 'warning') ?? []
  const otherIssues = visible?.issues.filter(issue => !unverified.includes(issue)) ?? []
  return <details className="dmx-inspector"><summary>DMX-proef zonder lampen</summary>
    <p>Bereken één moment uit een opgeslagen Look. Dit verstuurt geen DMX, schakelt geen output in en maakt geen verbinding met je node. Simulatiehelderheid en verborgen groepen tellen niet mee; opgeslagen groepsmasters wel.</p>
    <div className="dmx-inspector-inputs">
      <label>Look<select aria-label="Look voor DMX-proef" value={selectedLook?.id ?? ''} disabled={!show.looks.length} onChange={event => setLookId(event.target.value)}>{!show.looks.length && <option value="">Geen Looks</option>}{show.looks.map(look => <option key={look.id} value={look.id}>{look.name}</option>)}</select></label>
      <label>Showstand<select aria-label="Showstand voor DMX-proef" value={mode} onChange={event => setMode(event.target.value as InspectionMode)}><option value="automation">Look afspelen</option><option value="blackout">Blackout</option><option value="safety">Alleen frontlicht</option></select></label>
      <label>Moment in beats<input aria-label="Moment voor DMX-proef" type="number" min="0" max="64" step="any" value={beat} aria-invalid={!validBeat} onChange={event => setBeat(event.target.value)} /></label>
    </div>
    {dirty && <p role="status">Bewaar of verwerp eerst je patchwijzigingen. De proef gebruikt uitsluitend de opgeslagen patch.</p>}
    {!validBeat && <p role="status">Kies een moment tussen 0 en 64 beats.</p>}
    <div className="dmx-inspector-actions"><button disabled={pending || dirty || !selectedLook || !validBeat} onClick={() => void calculate()}>{pending ? 'DMX-proef berekenen…' : 'Bereken DMX-proef'}</button>{pending && <button onClick={() => { request.current?.abort(); request.current = null; setPending(false); setError('DMX-proef geannuleerd.') }}>Annuleer DMX-proef</button>}</div>
    {error && <p role="alert">{error}</p>}
    {visible && <div className="dmx-inspector-result">
      <p role="status">{visible.issues.some(issue => issue.severity === 'error') ? 'Proef geblokkeerd: los de onderstaande patchproblemen op.' : 'DMX-proef berekend.'} Geen output verstuurd. Catalogus: {visible.catalogVersion}.</p>
      {!!unverified.length && <details><summary>{unverified.every(issue => issue.fixtureId) ? `${unverified.length} fixtures niet fysiek geverifieerd` : 'Kanaaltabellen niet fysiek geverifieerd'}</summary><p>Kanaaltabellen zijn gebaseerd op handleidingen. Dit is geen fysieke verificatie.</p><p>{unverified.flatMap(issue => issue.fixtureId ? [show.fixtures.find(fixture => fixture.id === issue.fixtureId)?.name ?? issue.fixtureId] : []).join(', ')}</p></details>}
      {!!otherIssues.length && <ul>{otherIssues.map((issue, index) => <li key={index}><strong>{issue.severity === 'error' ? 'Fout' : 'Let op'}{issue.fixtureId ? ` · ${show.fixtures.find(fixture => fixture.id === issue.fixtureId)?.name ?? issue.fixtureId}` : ''}:</strong> {issue.message}</li>)}</ul>}
      {visible.issuesTruncated && <p>Meer aandachtspunten beschikbaar. Los de getoonde problemen op en bereken opnieuw.</p>}
      {!visible.universes.length && !visible.issues.some(issue => issue.severity === 'error') && <p>Geen fixtures gecodeerd. Ken fixtures een DMX-adres toe en bereken opnieuw.</p>}
      {visible.universes.map(universe => <details className="dmx-universe" key={universe.universe}><summary>Universe {universe.universe} · {universe.fixtures.length} fixtures · {universe.channels.filter(value => value > 0).length} kanalen boven nul</summary>
        <p>{universe.protocol ?? 'Geen route'} · route {universe.routeEnabled ? 'ingeschakeld in configuratie' : 'uitgeschakeld of ontbreekt'} · niet verstuurd</p>
        {universe.fixtures.map(fixture => <DmxFixtureDisclosure key={fixture.fixtureId} fixture={fixture} name={show.fixtures.find(item => item.id === fixture.fixtureId)?.name ?? fixture.fixtureId} />)}
      </details>)}
    </div>}
  </details>
}
