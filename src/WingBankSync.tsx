import { useEffect, useRef, useState } from 'react'
import type { ShowDocument } from './domain'
import { parseWingApply, parseWingPlan, parseWingProbe, requestWing, wingAddress, wingPlanRequest, type WingApplyResult, type WingDevice, type WingPlan, type WingPlanRequest } from './wing-sync-client'
import './WingBankSync.css'
import { SidePanel } from './SidePanel'

const addressKey = 'lightlab-wing-address'
const pendingKey = 'lightlab-wing-unverified-write'
function unfinishedWrite() { try { return sessionStorage.getItem(pendingKey) === '1' } catch { return false } }
function rememberWrite(pending: boolean) { try { if (pending) sessionStorage.setItem(pendingKey, '1'); else sessionStorage.removeItem(pendingKey) } catch { /* Recovery notice has a session-only fallback when storage is unavailable. */ } }
function savedAddress() { try { return wingAddress(localStorage.getItem(addressKey) ?? '10.0.0.10') } catch { return '10.0.0.10' } }

export function WingBankSync({ show, initialBank }: { show: ShowDocument; initialBank: number }) {
  const [address, setAddress] = useState(savedAddress)
  const [banks, setBanks] = useState([initialBank])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(unfinishedWrite)
  const supported = ['wing-full', 'wing-rack'].includes(show.controlSurface.profileId)
  let request: WingPlanRequest | undefined, invalid = ''
  try { request = wingPlanRequest(show, address, banks) } catch (error) { invalid = (error as Error).message }
  // Remounting fences pending responses and destroys confirmations after any relevant input edit.
  const identity = JSON.stringify([address, banks, show.controlSurface])
  return <>
    <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>Synchroniseren met WING{uncertain ? ' · Controle nodig' : ''}</button>
    <SidePanel open={open} onClose={() => { if (!busy) setOpen(false) }} title="Synchroniseren met WING" closeDisabled={busy}>
    <section className="wing-sync" aria-label="WING-synchronisatie">
    <p>Stuur de toegewezen knoppen en draaiknoppen naar je tafel. Eerst uitlezen en vergelijken, daarna pas bevestigen. Lege posities en niet-geselecteerde banken blijven behouden.</p>
    <div className="wing-sync-address"><label>IP-adres WING<input disabled={busy} aria-label="IP-adres WING" value={address} maxLength={15} inputMode="decimal" onChange={event => {
      const value = event.target.value; setAddress(value)
      try { localStorage.setItem(addressKey, wingAddress(value)) } catch { /* Local preference is optional; never part of the show. */ }
    }} /></label><small>Lokale voorkeur op deze computer, niet in je showbestand.</small></div>
    {supported ? <fieldset disabled={busy}><legend>Welke banken wil je synchroniseren?</legend><div className="wing-sync-bank-actions"><button onClick={() => setBanks(Array.from({ length: 16 }, (_, i) => i + 1))}>Alle banken</button><button onClick={() => setBanks([])}>Geen</button><button onClick={() => setBanks([initialBank])}>Huidige bank ({initialBank})</button></div>
      <div className="wing-sync-banks">{Array.from({ length: 16 }, (_, i) => i + 1).map(bank => <label key={bank} title={show.controlSurface.bankNames?.[bank]}><input type="checkbox" checked={banks.includes(bank)} onChange={() => setBanks(current => current.includes(bank) ? current.filter(value => value !== bank) : [...current, bank].sort((a, b) => a - b))} />Bank {bank}</label>)}</div>
    </fieldset> : <p role="status">Banksynchronisatie is beschikbaar voor WING Full en Rack. De Compact USER-indeling is nog niet ondersteund; er worden geen instellingen verstuurd.</p>}
    {uncertain && <p role="alert">Een eerdere verzending is niet volledig bevestigd. De WING kan gedeeltelijk gewijzigd zijn. Lees de tafel opnieuw uit; een afgebroken verzoek draait wijzigingen niet terug.</p>}
    {busy && <p role="status">Wacht tot de aanvraag is afgerond voordat je dit paneel sluit.</p>}
    <WingSyncActions key={identity} address={address} request={request} invalid={invalid} onBusy={setBusy} onUncertain={setUncertain} />
    </section>
    </SidePanel>
  </>
}

function WingSyncActions({ address, request, invalid, onBusy, onUncertain }: { address: string; request?: WingPlanRequest; invalid: string; onBusy: (busy: boolean) => void; onUncertain: (uncertain: boolean) => void }) {
  const [device, setDevice] = useState<WingDevice | null>(null), [plan, setPlan] = useState<WingPlan | null>(null)
  const [pending, setPending] = useState(''), [error, setError] = useState(''), [result, setResult] = useState<WingApplyResult | null>(null)
  const [confirmed, setConfirmed] = useState(false), [expired, setExpired] = useState(false)
  const active = useRef<AbortController | null>(null)
  const applyingRef = useRef(false), callbacks = useRef({ onBusy, onUncertain })
  callbacks.current = { onBusy, onUncertain }
  useEffect(() => () => { if (applyingRef.current) callbacks.current.onUncertain(true); active.current?.abort(); active.current = null; callbacks.current.onBusy(false) }, [])
  useEffect(() => {
    if (pending !== 'apply') return
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [pending])
  useEffect(() => {
    if (!plan) return
    const check = () => setExpired(Date.now() >= Date.parse(plan.expiresAt))
    check(); const timer = setInterval(check, 1000); return () => clearInterval(timer)
  }, [plan])
  async function run(action: 'probe' | 'plan' | 'apply') {
    if (active.current) return
    if (action === 'apply' && (!plan || !confirmed || expired || Date.now() >= Date.parse(plan.expiresAt))) return
    const controller = new AbortController(); active.current = controller
    applyingRef.current = action === 'apply'; if (applyingRef.current) rememberWrite(true); onBusy(true)
    setPending(action); setError(''); setResult(null)
    const applying = plan
    if (action !== 'probe') { setPlan(null); setConfirmed(false) }
    try {
      const target = wingAddress(address)
      const body = action === 'probe' ? { version: 1, address: target } : action === 'plan' ? request : { version: 1, planId: applying!.planId, confirm: true }
      if (!body) return
      const response = await requestWing(action, body, controller.signal)
      if (active.current !== controller) return
      if (action === 'probe') setDevice(parseWingProbe(response, target))
      if (action === 'plan') { const next = parseWingPlan(response, request!); setPlan(next); setDevice(next.device); setExpired(Date.now() >= Date.parse(next.expiresAt)) }
      if (action === 'apply') { const next = parseWingApply(response, applying!.changes.length); setResult(next); rememberWrite(next.state !== 'applied'); onUncertain(next.state !== 'applied') }
    } catch (cause) {
      if (active.current === controller) {
        if (action === 'apply') onUncertain(true)
        setError(`${cause instanceof Error ? cause.message : 'WING-verzoek mislukt. Lees de tafel opnieuw uit.'}${action === 'apply' ? ' De verzending is niet volledig bevestigd; lees opnieuw uit om eventuele gedeeltelijke wijzigingen te zien.' : ''}`)
      }
    }
    finally { if (active.current === controller) { active.current = null; applyingRef.current = false; onBusy(false); setPending('') } }
  }
  function backup() {
    if (!plan) return
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, address: plan.address, device: plan.device, savedAt: new Date().toISOString(), changes: plan.changes }, null, 2)], { type: 'application/json' }))
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `lightlab-wing-backup-${plan.address}.json`; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError('Back-up downloaden mislukt. Je kunt opnieuw downloaden of het gecontroleerde voorstel expliciet bevestigen en versturen.') }
  }
  return <div className="wing-sync-actions">
    <p className="wing-sync-warning">Dit configureert MIDI-bedieningen op de WING; het stuurt geen Looks of DMX naar de tafel. Een aparte MIDI-verbinding met Lightlab is nog nodig en nog niet aangesloten. Globale MIDI-instellingen, banknamen en groepsintensiteiten worden niet gewijzigd.</p>
    <div className="wing-sync-bank-actions"><button disabled={!!pending} onClick={() => void run('probe')}>Controleer verbinding</button><button disabled={!!pending || !request} onClick={() => void run('plan')}>Lees banken uit & vergelijk</button></div>
    {invalid && <p className="muted">{invalid}</p>}
    <p role="status">{pending ? pending === 'apply' ? 'Instellingen versturen en teruglezen… Verlaat dit scherm niet.' : 'WING wordt uitgelezen… Er wordt niets gewijzigd.' : device ? `${device.name} · ${device.model} · firmware ${device.firmware}` : 'Nog geen verbinding gecontroleerd.'}</p>
    {error && <p role="alert">{error}</p>}
    {plan && <section className="wing-sync-plan" aria-label="Voorgestelde WING-wijzigingen"><h3>{plan.changes.length} {plan.changes.length === 1 ? 'positie' : 'posities'} te synchroniseren</h3>
      {plan.warnings.map((warning, i) => <p key={i} className="wing-sync-warning">{warning}</p>)}
      <p>Banknummer is MIDI-kanaal; knoppen sturen MIDI-noten, draaiknoppen Control Change (CC). Controleer de hieronder getoonde toewijzingen ook op conflicten met andere MIDI-apparaten.</p>
      <p className="wing-sync-warning">Wijzig deze posities tijdens het versturen niet op de tafel of vanuit andere software. Netwerkconfiguratie is geen ondeelbare transactie; gedeeltelijke wijzigingen zijn mogelijk.</p>
      <div className="wing-sync-table"><table><thead><tr><th>Positie</th><th>Naam</th><th>Nu op WING</th><th>Na synchronisatie</th></tr></thead><tbody>{plan.changes.map(change => <tr key={`${change.bank}:${change.kind}:${change.index}`}><td>Bank {change.bank} · {change.kind === 'button' ? 'B' : 'R'}{change.index}</td><td>{change.label}</td><td>{Object.entries(change.before).map(([key, value]) => <div key={key}>{key}: {String(value)}</div>)}</td><td>{Object.entries(change.after).map(([key, value]) => <div key={key}>{key}: {String(value)}</div>)}</td></tr>)}</tbody></table></div>
      {expired ? <p role="alert">Dit voorstel is verlopen. Lees de banken opnieuw uit voordat je verstuurt.</p> : !!plan.changes.length && <>
        <button onClick={backup}>Download back-up van huidige posities</button>
        <small>Optioneel: bewaar deze momentopname vóór het overschrijven. Automatisch terugzetten is nog niet beschikbaar.</small>
        <label className="wing-sync-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Ik bevestig het overschrijven van deze {plan.changes.length} {plan.changes.length === 1 ? 'positie' : 'posities'} op {plan.address} en heb de MIDI-toewijzingen gecontroleerd.</label>
        <button className="primary" disabled={!confirmed || !!pending} onClick={() => void run('apply')}>Verstuur bevestigde wijzigingen</button>
      </>}
      {!plan.changes.length && <p>Geen wijzigingen nodig. De geselecteerde toewijzingen staan al zo op de tafel.</p>}
    </section>}
    {result && <p role={result.state === 'applied' ? 'status' : 'alert'}>{result.state === 'applied' ? 'Instellingen teruggelezen en bevestigd' : 'Synchronisatie slechts gedeeltelijk bevestigd'}: {result.verifiedSlots}/{result.totalSlots} posities. {result.error} Dit bevestigt de tafelconfiguratie, niet de MIDI-bediening in Lightlab.</p>}
  </div>
}
