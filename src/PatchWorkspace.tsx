import { useEffect, useRef, useState } from 'react'
import { type FixtureDeployment, type OutputRoute, type ShowDocument } from './domain'
import { fixturePatchInfo, patchInputError, routeUniverseError, universeUsage } from './patch-overview'
import './PatchWorkspace.css'

export function PatchWorkspace({ show, onChange: save, onDirtyChange }: { show: ShowDocument; onChange: (show: ShowDocument) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const [dirtyIds, setDirtyIds] = useState<string[]>([])
  const dirty = dirtyIds.length > 0
  useEffect(() => {
    onDirtyChange?.(dirty)
    return () => onDirtyChange?.(false)
  }, [dirty, onDirtyChange])
  function markDirty(id: string) { setDirtyIds(ids => ids.includes(id) ? ids : [...ids, id]) }
  const inspector = useRef<HTMLElement>(null)
  const [notice, setNotice] = useState('')
  function onChange(next: ShowDocument) {
    save(next)
    // Saving one route must not clear the dirty marker for another route's draft.
    setDirtyIds(ids => ids.filter(id =>
      show.fixtures.find(f => f.id === id) === next.fixtures.find(f => f.id === id) &&
      show.routes.find(r => r.id === id) === next.routes.find(r => r.id === id)))
    setNotice('Configuratie opgeslagen. Geen netwerkverkeer of live output gestart.')
  }
  const [tab, setTab] = useState<'fixtures' | 'network'>('fixtures')
  const [groupBy, setGroupBy] = useState<'group' | 'universe'>('group')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const [onlyIssues, setOnlyIssues] = useState(false)
  function canLeave() { return !dirtyIds.length || window.confirm('Je hebt niet-opgeslagen wijzigingen. Wil je deze verwerpen?') }
  function chooseTab(next: typeof tab) { if (next !== tab && canLeave()) { setDirtyIds([]); setTab(next) } }
  function chooseFixture(id: string) { if (id !== selectedId && canLeave()) { setDirtyIds([]); setSelectedId(id) } }
  useEffect(() => { if (selectedId && window.matchMedia('(max-width: 1100px)').matches) inspector.current?.focus() }, [selectedId])
  const selected = show.fixtures.find(item => item.id === selectedId)
  const universes = [...new Set([...show.routes.map(route => route.universe), ...show.fixtures.flatMap(fixture => fixture.patch ? [fixture.patch.universe] : [])])].sort((a, b) => a - b)
  const unpatched = show.fixtures.filter(fixture => !fixture.patch).length
  const conflicts = show.fixtures.filter(fixture => fixturePatchInfo(show, fixture).conflicts.length).length
  const rows = show.fixtures.filter(fixture => {
    const info = fixturePatchInfo(show, fixture)
    const group = show.groups.find(group => group.id === fixture.groupId)?.name ?? ''
    return `${fixture.name} ${group} ${info.profile?.model ?? ''}`.toLowerCase().includes(query.toLowerCase()) && (!onlyIssues || !fixture.patch || info.conflicts.length > 0 || !info.mode || !!info.mode.configurationWarning || (info.end ?? 0) > 512)
  })
  const sections = new Map<string, { label: string; fixtures: FixtureDeployment[] }>()
  for (const fixture of rows) {
    const key = groupBy === 'group' ? fixture.groupId : String(fixture.patch?.universe ?? 'unpatched')
    const label = groupBy === 'group' ? show.groups.find(group => group.id === key)?.name ?? 'Onbekende groep' : fixture.patch ? `Universe ${fixture.patch.universe}` : 'Nog niet gepatcht'
    if (!sections.has(key)) sections.set(key, { label, fixtures: [] })
    sections.get(key)!.fixtures.push(fixture)
  }
  return <section className="patch-studio" aria-label="Patch en netwerk">
    <header><div><p className="section-label">AANSLUITEN & ADRESSEREN</p><h2>Patch & netwerk</h2><p>Groepeer je lampen, controleer hun kanaalbereik en stel de bestemming per universe in.</p></div><span className="patch-status">Alleen configuratie · geen live output</span></header>
    <div className="patch-stats"><span><strong>{show.fixtures.length - unpatched}/{show.fixtures.length}</strong> fixtures gepatcht</span><span><strong>{universes.length}</strong> universes</span><span><strong>{unpatched}</strong> zonder adres</span><span className={conflicts ? 'patch-problem' : ''}><strong>{conflicts}</strong> fixtures met overlap</span></div>
    <nav className="patch-tabs" aria-label="Patchoverzicht"><button aria-pressed={tab === 'fixtures'} onClick={() => chooseTab('fixtures')}>Fixturepatch</button><button aria-pressed={tab === 'network'} onClick={() => chooseTab('network')}>Universes & netwerk</button></nav>
    <p role="status">{notice}</p>
    {tab === 'fixtures' ? <div className="patch-layout"><div className="patch-list" id="patch-fixture-list">
      <div className="patch-filters"><label>Zoeken<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Naam, groep of model…" /></label><label>Groepeer op<select value={groupBy} onChange={e => setGroupBy(e.target.value as typeof groupBy)}><option value="group">Podiumgroep</option><option value="universe">Universe</option></select></label><label className="patch-check"><input type="checkbox" checked={onlyIssues} onChange={e => setOnlyIssues(e.target.checked)} />Alleen aandachtspunten</label></div>
      {!rows.length && <p>Geen fixtures gevonden. Pas je zoekopdracht of filter aan.</p>}
      {[...sections].map(([key, section]) => <section className="patch-group" key={key}><h3>{section.label}<small>{section.fixtures.length} fixtures</small></h3><div className="patch-columns" aria-hidden="true"><span>Fixture / modus</span><span>Universe</span><span>DMX-bereik</span></div>{section.fixtures.map(fixture => {
        const { mode, end, conflicts } = fixturePatchInfo(show, fixture)
        return <button className="patch-fixture" key={fixture.id} aria-pressed={selectedId === fixture.id} onClick={() => chooseFixture(fixture.id)}><span><strong>{fixture.name}</strong><small>{mode?.name ?? 'Onbekende modus'} · {mode?.channels ?? '?'} kanalen</small>{conflicts.length > 0 && <small className="patch-problem">Overlap met {conflicts.map(item => item.name).join(', ')}</small>}{end !== undefined && end > 512 && <small className="patch-problem">Buiten kanaal 512</small>}</span><span>{fixture.patch ? `U${fixture.patch.universe}` : '—'}</span><span>{fixture.patch ? `${fixture.patch.address}–${end ?? '?'}` : 'Niet gepatcht'}</span></button>
      })}</section>)}
    </div><aside ref={inspector} tabIndex={-1} className="patch-inspector">{selected ? <FixturePatchEditor key={`${selected.id}:${selected.modeId}:${selected.patch?.universe}:${selected.patch?.address}`} show={show} fixture={selected} onDirty={() => markDirty(selected.id)} onChange={onChange} /> : <><h3>Selecteer een fixture</h3><p>Bekijk het model, de DMX-modus, gebruikte kanalen en adresconflicten. Wijzigingen sla je bewust op.</p><p>De groepsindeling volgt je podiumsetup. Een TRI-bar is één fysieke fixture met één startadres.</p></>}</aside></div> : <div className="patch-network">
      <p className="patch-notice">Routes zijn opgeslagen instellingen, geen verbindingsstatus. Lightlab test hier geen netwerkverbinding en activeert geen DMX. Stem universe, protocol en bestemming af op je node.</p>
      {!universes.length && <p>Nog geen universes. Patch een fixture of voeg een route toe.</p>}
      {universes.map(universe => {
        const usage = universeUsage(show, universe)
        const routes = show.routes.filter(route => route.universe === universe)
        const count = show.fixtures.filter(fixture => fixture.patch?.universe === universe).length
        return <section className="patch-universe" key={universe}><header><h3>Universe {universe}</h3><span>{count} fixtures · {usage.used}/512 kanalen bezet · {usage.free} vrij</span></header><meter min="0" max="512" value={usage.used} aria-label={`Kanaalgebruik universe ${universe}`} />{usage.overlapping > 0 && <p className="patch-problem">{usage.overlapping} kanalen dubbel toegewezen. Los de overlap op in Fixturepatch.</p>}{routes.filter(route => route.enabled).length > 1 && <p className="patch-problem">Meer dan één ingeschakelde route voor deze universe.</p>}{!routes.length && <><p>Geen netwerkroute ingesteld voor deze universe.</p><button onClick={() => onChange({ ...show, routes: [...show.routes, { id: crypto.randomUUID(), universe, protocol: universe > 32768 ? 'sacn' : 'artnet', host: '', enabled: false }] })} disabled={show.routes.length >= 256}>Route instellen</button></>}{routes.map(route => <RouteEditor key={`${route.id}:${route.universe}:${route.protocol}:${route.host}:${route.enabled}`} route={route} show={show} onDirty={() => markDirty(route.id)} onChange={onChange} />)}</section>
      })}
      <button disabled={show.routes.length >= 256} onClick={() => { let universe = 1; while (universes.includes(universe)) universe++; onChange({ ...show, routes: [...show.routes, { id: crypto.randomUUID(), universe, protocol: 'artnet', host: '', enabled: false }] }) }}>Universe met route toevoegen</button>
      <p className="patch-help">Nieuwe routes staan uit. Een route inschakelen is alleen een configuratiekeuze; fysieke output vereist afzonderlijke runtime-aansturing.</p>
    </div>}
  </section>
}

function FixturePatchEditor({ show, fixture, onChange, onDirty }: { show: ShowDocument; fixture: FixtureDeployment; onDirty: () => void; onChange: (show: ShowDocument) => void }) {
  const [universe, setUniverse] = useState(String(fixture.patch?.universe ?? 1))
  const [address, setAddress] = useState(String(fixture.patch?.address ?? ''))
  const [modeId, setModeId] = useState(fixture.modeId)
  const [message, setMessage] = useState('')
  const { profile } = fixturePatchInfo(show, fixture)
  const mode = profile?.modes.find(mode => mode.id === modeId)
  const error = mode ? mode.configurationWarning || patchInputError(universe, address, mode.channels) : 'Onbekende DMX-modus.'
  const candidate = { ...fixture, modeId, patch: { universe: Number(universe), address: Number(address) } }
  const { conflicts, end } = fixturePatchInfo(show, candidate)
  return <form onChangeCapture={onDirty} onSubmit={e => { e.preventDefault(); if (!error && !conflicts.length) { onChange({ ...show, fixtures: show.fixtures.map(item => item.id === fixture.id ? candidate : item) }); setMessage('Fixturepatch opgeslagen.') } }}>
    <a className="patch-back" href="#patch-fixture-list">Terug naar fixtures ↑</a><p className="section-label">FIXTUREDETAILS</p><h3>{fixture.name}</h3><p>{profile?.manufacturer} {profile?.model}</p><p className="patch-help">{show.groups.find(group => group.id === fixture.groupId)?.name} · {profile?.fixedColor ? 'Vast warmwit, geen kleursturing' : mode?.capabilities.includes('rgb') ? 'RGB-kleursturing' : 'Geen RGB-kleursturing'}</p>
    <label>DMX-modus<select value={modeId} onChange={e => setModeId(e.target.value)}>{profile?.modes.map(mode => <option key={mode.id} value={mode.id}>{mode.name}</option>)}</select></label><p className="patch-help">Kies dezelfde modus op de fysieke lamp. Een moduswijziging kan meer kanalen innemen.</p>
    <div className="patch-address"><label>Universe<input type="number" min="1" max="63999" value={universe} onChange={e => setUniverse(e.target.value)} /></label><label>Startadres<input type="number" min="1" max={513 - (mode?.channels ?? 1)} value={address} onChange={e => setAddress(e.target.value)} /></label></div>
    {!error && <p>{mode?.channels} kanalen · adres {address} t/m {end}</p>}{error && <p role="status" className="patch-problem">{error}</p>}{!error && conflicts.length > 0 && <p role="alert" className="patch-problem">Overlap met {conflicts.map(item => item.name).join(', ')}. Kies een vrij adres voordat je opslaat.</p>}
    <button type="submit" disabled={!!error || !!conflicts.length}>Patch opslaan</button><p role="status">{message}</p>
    <p className="patch-help">{mode?.verifiedForLiveOutput ? 'DMX-modus geverifieerd.' : 'Deze DMX-modus is nog niet fysiek geverifieerd.'} Dit is geen bevestiging van een aangesloten lamp.</p>
  </form>
}

function RouteEditor({ route, show, onChange, onDirty }: { route: OutputRoute; show: ShowDocument; onDirty: () => void; onChange: (show: ShowDocument) => void }) {
  const [universe, setUniverse] = useState(String(route.universe))
  const [protocol, setProtocol] = useState(route.protocol)
  const [host, setHost] = useState(route.host)
  const [enabled, setEnabled] = useState(route.enabled)
  const [message, setMessage] = useState('')
  const error = routeUniverseError(universe, protocol) || (enabled && !host.trim() ? 'Vul een bestemming in voordat je de route inschakelt.' : '') || (enabled && show.routes.some(other => other.id !== route.id && other.enabled && other.universe === Number(universe)) ? 'Deze universe heeft al een ingeschakelde route.' : '')
  return <form className="patch-route" onChangeCapture={onDirty} onSubmit={e => { e.preventDefault(); if (!error) { onChange({ ...show, routes: show.routes.map(item => item.id === route.id ? { ...route, universe: Number(universe), protocol, host: host.trim(), enabled } : item) }); setMessage('Route opgeslagen; geen netwerkverkeer gestart.') } }}>
    <div className="patch-route-fields"><label>Universe<input type="number" min="1" max="63999" value={universe} onChange={e => setUniverse(e.target.value)} /></label><label>Protocol<select value={protocol} onChange={e => setProtocol(e.target.value as OutputRoute['protocol'])}><option value="artnet">Art-Net</option><option value="sacn">sACN</option></select></label><label>Bestemming (IP of hostnaam)<input value={host} maxLength={255} placeholder="Bijv. 192.168.0.50" onChange={e => setHost(e.target.value)} /></label></div>
    <label className="patch-check"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Route inschakelen in configuratie</label><p className="patch-help">Opgeslagen: {route.enabled ? 'ingeschakeld' : 'uitgeschakeld'} · {route.host || 'geen bestemming'} · bereikbaarheid niet getest. Universe wijzigen verplaatst geen fixtures.</p>
    {error && <p role="alert" className="patch-problem">{error}</p>}<button type="submit" disabled={!!error}>Route opslaan</button><span role="status">{message}</span>
  </form>
}
