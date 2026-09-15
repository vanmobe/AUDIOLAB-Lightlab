import { useEffect, useMemo, useRef, useState } from 'react'
import type { ShowDocument } from './domain'
import { evaluateFrame, animationLabel, resolveLookLayers } from './domain'
import { layerAnimationLabel } from './GroupTimingControls'
import { rehearsalPreview } from './rehearsal'
import { fixtureProfiles } from './fixtures'
import { StageSimulator } from './simulator'
import { simulationErrorMessage } from './simulation-errors'
import { SimulationControls, type SimulationControlProps } from './SimulationControls'
import { designConfigurationError, designDefaults, fingerprint, proposalCandidate, type DesignOptions, type DesignProposal } from './design-proposal'
import { collectionKeys, emptySelection, resolveProposalSelection, selectedProposalCandidate, type ProposalSelection } from './proposal-selection'
import './DesignAssistant.css'
import { designQualityWarnings } from './design-quality'
import { PatternDetails } from './PatternDetails'
import { BandProfileEditor } from './BandProfileEditor'
import { bandProfileSummary, type BandProfile } from './band-profile'
import { parseAiTrace, downloadAiTrace, type AiTrace } from './ai-trace'
import { readAiResponse, phaseLabels, type AiProgress } from './ai-progress'

const labels = { colorProfiles: 'kleurprofielen', programs: 'animaties', looks: 'Looks' }
const providerLabels: Record<string, string> = { ollama: 'Ollama · lokaal', copilot: 'GitHub Copilot · cloud', openai: 'OpenAI · cloud', 'offline-templates': 'Offline sjablonen' }
const duplicateCorrection = 'Correctie na afwijzing wegens dubbele animatierecepten: lever minder unieke patronen als dat nodig is; het gevraagde aantal animaties is een maximum. Controleer recepten op gelijke stappen, genegeerde velden en proportioneel gelijke gewichten. Een andere naam, kleur, groep of snelheid maakt geen nieuw patroon. Bij toevoegen: hergebruik bestaande patronen via hun ID in Looks, maar lever ze niet opnieuw als nieuw patroon. Bij vervangen: gebruik uitsluitend IDs uit de nieuwe reeks. Behoud de gevraagde aantallen kleurprofielen en Looks en laat alle Looklagen naar geldige patronen verwijzen.'
export function CandidatePreview({ show, lookId, profileId, programId, auditionStatic, simulationSettings }: SimulationControlProps & { show: ShowDocument; lookId: string; profileId?: string; programId?: string; auditionStatic?: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const [previewError, setPreviewError] = useState('')
  const [retry, setRetry] = useState(0)
  const settings = useRef(simulationSettings)
  settings.current = simulationSettings
  useEffect(() => {
    if (!host.current) return
    const preview = rehearsalPreview(show, { mode: 'automation', activeLookId: lookId, colorLockId: profileId || undefined, programId: programId || undefined, auditionStatic })
    let sim: StageSimulator
    try {
      sim = new StageSimulator(host.current, show.fixtures, show.camera, show.bandMembers)
      setPreviewError('')
    } catch (error) {
      setPreviewError(simulationErrorMessage(error, 'De 3D-preview kon niet starten. Controleer WebGL en probeer opnieuw. Je voorstel blijft beschikbaar om te bekijken of te bewaren.'))
      return
    }
    const start = performance.now()
    let frame = 0
    function draw() { sim.update(evaluateFrame(preview.show, fixtureProfiles, preview.state, (performance.now() - start) / 500), settings.current); frame = requestAnimationFrame(draw) }
    draw()
    return () => { cancelAnimationFrame(frame); sim.dispose() }
  }, [show, lookId, profileId, programId, auditionStatic, retry])
  return <><div className="candidate-stage" ref={host} aria-label="Voorbeeld van ontwerp in de simulator" />{previewError && <div><p role="alert">{previewError}</p><button onClick={() => setRetry(value => value + 1)}>Preview opnieuw starten</button></div>}</>
}

export function DesignAssistant({ show, onAccept, onBandProfileChange, active = true, ...simulationControls }: SimulationControlProps & { show: ShowDocument; onAccept: (candidate: ShowDocument, note: string, replacement?: boolean) => boolean; onBandProfileChange?: (profile: BandProfile | undefined) => void; active?: boolean }) {
  const [options, setOptions] = useState<DesignOptions>(designDefaults)
  const [intent, setIntent] = useState('Ontwerp een samenhangende lichtshow die past bij het bandprofiel en de beschikbare opstelling.')
  const [feedback, setFeedback] = useState('')
  const [rejections, setRejections] = useState(0)
  const [lastFeedback, setLastFeedback] = useState('')
  const [provider, setProvider] = useState('Verbinding controleren…')
  const [providerModel, setProviderModel] = useState('')
  const [runtimeInfo, setRuntimeInfo] = useState('')
  const [ollama, setOllama] = useState(false)
  const [models, setModels] = useState<string[] | null>(null)
  const [selectedModel, setSelectedModel] = useState(() => { try { return localStorage.getItem('lightflow-ollama-model') || '' } catch { return '' } })
  const [modelError, setModelError] = useState('')
  const [modelRefresh, setModelRefresh] = useState(0)
  const [pending, setPending] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const [proposal, setProposal] = useState<{ data: DesignProposal; base: string; options: DesignOptions; intent: string; model?: string }>()
  const [profileId, setProfileId] = useState('')
  const [programId, setProgramId] = useState('')
  const [lookId, setLookId] = useState('')
  const [auditionStatic, setAuditionStatic] = useState(false)
  const [compareOriginal, setCompareOriginal] = useState(false)
  const [includeTrace, setIncludeTrace] = useState(true)
  const [trace, setTrace] = useState<AiTrace>()
  const [ollamaTimeoutMinutes, setOllamaTimeoutMinutes] = useState(() => { try { const saved = Number(localStorage.getItem('lightlab-ollama-timeout-minutes')); return Number.isInteger(saved) && saved >= 1 && saved <= 60 ? saved : 15 } catch { return 15 } })
  const controller = useRef<AbortController | null>(null)
  const [progress, setProgress] = useState<{ phase: AiProgress['phase']; attempt: number; text: string; clipped: boolean; activity: number; heartbeat: number }>({ phase: 'waiting', attempt: 1, text: '', clipped: false, activity: -1, heartbeat: 0 })
  const [providerChoices, setProviderChoices] = useState<string[]>([])
  const [chosenProvider, setChosenProvider] = useState('')
  const [defaultProvider, setDefaultProvider] = useState('')
  const [copilotModel, setCopilotModel] = useState('')
  const [cloudConsent, setCloudConsent] = useState(false)
  const modelProvider = chosenProvider || defaultProvider || (ollama ? 'ollama' : '')
  const copilot = modelProvider === 'copilot'
  const localModel = modelProvider === 'ollama'
  const usesModelList = localModel || copilot
  const requestModel = copilot ? copilotModel : selectedModel
  useEffect(() => {
    const abort = new AbortController()
    fetch('http://127.0.0.1:5188/ai/status', { signal: abort.signal }).then(r => r.ok ? r.json() : Promise.reject()).then(r => {
      if (abort.signal.aborted) return
      setProvider(r.provider === 'openai-unavailable' ? 'AI niet beschikbaar · API-sleutel ontbreekt' : r.provider === 'ollama' ? 'Lokale AI · Ollama' : r.aiConfigured ? 'AI · ' + r.provider : 'Offline sjablonen · geen AI')
      setProviderModel(typeof r.model === 'string' ? r.model : '')
      setOllama(r.provider === 'ollama')
      setDefaultProvider(r.provider === 'openai-unavailable' ? 'openai' : r.provider)
      setProviderChoices(Array.isArray(r.providers) ? r.providers.filter((id: unknown) => typeof id === 'string' && Object.hasOwn(providerLabels, id)) : [])
      setRuntimeInfo(`${typeof r.runtimeVersion === 'string' ? `Runtime ${r.runtimeVersion}` : 'Runtime versie onbekend'}${typeof r.aiContractVersion === 'string' ? ` · AI-contract ${r.aiContractVersion}` : ''}`)
    }).catch(() => { if (!abort.signal.aborted) setProvider('Runtime niet verbonden') })
    return () => { abort.abort(); controller.current?.abort() }
  }, [])
  useEffect(() => {
    if (!usesModelList) return
    const abort = new AbortController()
    setModels(null); setModelError('')
    fetch(`http://127.0.0.1:5188/ai/models${chosenProvider ? `?provider=${encodeURIComponent(chosenProvider)}` : ''}`, { signal: abort.signal }).then(async response => {
      const data = await response.json()
      if (abort.signal.aborted) return
      if (!response.ok) throw new Error(data.error || 'Modellen ophalen mislukt.')
      if (!Array.isArray(data.models) || !data.models.every((model: unknown) => typeof model === 'string')) throw new Error('Ongeldige modellenlijst ontvangen.')
      setModels(data.models)
      if (!copilot) setSelectedModel(current => current || data.defaultModel || data.models[0] || '')
    }).catch(error => { if (!abort.signal.aborted) setModelError(error instanceof Error ? error.message : 'AI-provider niet bereikbaar.') })
    return () => abort.abort()
  }, [usesModelList, chosenProvider, copilot, modelRefresh])
  useEffect(() => {
    if (!pending) return
    const start = Date.now()
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [pending])
  const result = useMemo(() => {
    if (!proposal) return null
    try { return { candidate: proposalCandidate(show, proposal.data, proposal.options, proposal.base), error: '' } }
    catch (e) { return { candidate: null, error: e instanceof Error ? e.message : 'Ongeldig voorstel' } }
  }, [show, proposal])
  const configurationError = designConfigurationError(show, options)
  async function request(correction = '') {
    if (copilot && !cloudConsent) { setError('Bevestig eerst dat je deze ontwerpgegevens naar GitHub Copilot wilt sturen.'); return }
    controller.current?.abort()
    const abort = new AbortController(); controller.current = abort
    setElapsed(0); setPending(true); setStep(3); setError(''); setProposal(undefined); setTrace(undefined)
    const started = Date.now()
    setProgress({ phase: 'waiting', attempt: 1, text: '', clipped: false, activity: -1, heartbeat: 0 })
    setLastFeedback(feedback.trim())
    const base = fingerprint(show)
    const chosen = { ...options }
    // Hidden editor drafts are not part of a scoped request; preserve them locally.
    const wireOptions = { ...chosen,
      profileCount: chosen.scope === 'all' || chosen.scope === 'colorProfiles' ? chosen.profileCount : 0,
      programCount: chosen.scope === 'all' || chosen.scope === 'programs' ? chosen.programCount : 0,
      lookCount: chosen.scope === 'all' || chosen.scope === 'looks' ? chosen.lookCount : 0,
    }
    try {
      const response = await fetch('http://127.0.0.1:5188/ai/propose', { method: 'POST', signal: abort.signal, headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' }, body: JSON.stringify({ intent: intent + (feedback ? '\nFeedback op eerder voorstel: ' + feedback : '') + (correction ? '\n' + correction : ''), options: wireOptions, show, includeTrace, ollamaTimeoutMinutes, ...(chosenProvider ? { provider: chosenProvider } : {}), ...(usesModelList ? { model: requestModel } : {}) }) }).catch(() => { throw new Error('Runtime niet bereikbaar. Controleer of de lokale runtime actief is en probeer opnieuw.') })
      if (abort.signal.aborted || controller.current !== abort) return
      const data = await readAiResponse(response, abort.signal, event => {
        if (abort.signal.aborted || controller.current !== abort) return
        const seconds = Math.floor((Date.now() - started) / 1000)
        setProgress(previous => {
          if (event.type === 'heartbeat') return { ...previous, heartbeat: seconds }
          const boundary = (previous.phase !== event.phase || previous.attempt !== event.attempt) ? `\n\n— ${phaseLabels[event.phase]} · poging ${event.attempt} —\n` : ''
          return { ...previous, phase: event.phase, attempt: event.attempt, text: (previous.text + boundary + (event.thinking || '') + (event.content || '')).slice(0, 32768), clipped: previous.clipped || !!event.clipped, activity: event.phase === 'thinking' || event.phase === 'generating' ? seconds : previous.activity }
        })
      })
      if (abort.signal.aborted || controller.current !== abort) return
      setTrace(includeTrace ? parseAiTrace(data.trace) : undefined)
      if (!response.ok || data.error) {
        if (response.status === 400 && data.error === 'Ontwerpaanvraag heeft ongeldige of ontbrekende velden.') throw new Error('De runtime heeft de aanvraag afgewezen vóór verzending: je vraag is niet naar het AI-model gestuurd. Deze runtime vermeldt niet welk veld faalt. De webapp en runtime passen mogelijk niet bij elkaar; herstart de lokale runtime met dezelfde Lightlab-versie en probeer opnieuw. Je show is niet gewijzigd.')
        throw new Error(data.error || `Aanvraag mislukt (${response.status}).`)
      }
      const candidate = proposalCandidate(show, data, chosen, base)
      setProvider(providerLabels[data.provider] || 'AI · ' + data.provider)
      if (typeof data.model === 'string') setProviderModel(data.model)
      setLookId(data.looks[0]?.id || candidate.activeLookId)
      setProfileId(data.looks.length ? '' : data.colorProfiles[0]?.id || '')
      setProgramId(data.looks.length ? '' : data.programs[0]?.id || '')
      setAuditionStatic(chosen.scope === 'colorProfiles')
      // Keep diagnostics out of proposal state so clearing them really releases the capture.
      const cleanProposal = { provider: data.provider, summary: data.summary, colorProfiles: data.colorProfiles, programs: data.programs, looks: data.looks } as DesignProposal
      setCompareOriginal(false); setProposal({ data: cleanProposal, base, options: chosen, intent, model: typeof data.model === 'string' ? data.model : undefined })
    } catch (e) { if (!abort.signal.aborted && controller.current === abort) setError(e instanceof TypeError ? 'Het AI-antwoord kon niet worden verwerkt. Je show is niet gewijzigd.' : e instanceof Error ? e.message : 'Aanvraag mislukt.') }
    finally { if (!abort.signal.aborted && controller.current === abort) { setPending(false); setProgress(previous => ({ ...previous, text: '' })) } }
  }
  const candidate = result?.candidate
  const hasChanges = candidate && fingerprint(candidate) !== fingerprint(show)
  const qualityWarnings = useMemo(() => candidate && proposal ? designQualityWarnings(proposal.data, candidate) : [], [candidate, proposal])
  const modelUnavailable = usesModelList && (!models || !models.includes(requestModel)) || copilot && !cloudConsent
  const [selection, setSelection] = useState<ProposalSelection>(emptySelection)
  useEffect(() => setSelection(emptySelection()), [proposal])
  const resolvedSelection = proposal ? resolveProposalSelection(proposal.data, selection) : emptySelection()
  let selectionError = '', selectedCandidate: ShowDocument | undefined
  if (proposal) {
    try { selectedCandidate = selectedProposalCandidate(show, proposal.data, proposal.options, proposal.base, selection) }
    catch (e) { selectionError = e instanceof Error ? e.message : 'Selectie kon niet worden verwerkt.' }
  }
  function acceptSelection() {
    if (!proposal) return
    try {
      const accepted = selectedProposalCandidate(show, proposal.data, proposal.options, proposal.base, selection)
      if (!onAccept(accepted, `Geselecteerde AI-ideeën: ${proposal.intent}`.slice(0, 4096), proposal.options.replace && proposal.options.scope !== 'all')) { setError('Opslaan niet gelukt; je show is niet gewijzigd.'); return }
      setProposal(undefined); setRejections(0); setFeedback(''); setStep(1)
    } catch (e) { setError(e instanceof Error ? e.message : 'Selectie kon niet worden bewaard.') }
  }
  const duplicateError = /Dubbel (animatierecept|patroon)/i.test(error)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const visibleStep = pending || proposal ? 3 : step
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const previousStep = useRef(visibleStep)
  useEffect(() => {
    if (active && previousStep.current !== visibleStep) stepHeading.current?.focus({ preventScroll: true })
    previousStep.current = visibleStep
  }, [visibleStep, active])
  return <section className="design-assistant">
    <div className="assistant-heading"><div><p className="eyebrow">ONTWERPSTUDIO</p><h2>Welke sfeer zoek je?</h2></div><span>{providerLabels[modelProvider] || provider}{usesModelList ? requestModel ? ` · ${requestModel}` : '' : providerModel ? ` · ${providerModel}` : ''}</span></div>
    <p>Van idee naar podium. Je show verandert pas wanneer je een voorstel bewaart.</p>
    <nav className="assistant-steps" aria-label="Stappen van je AI-ontwerp">{(['Wat maken we?', 'Beschrijf je idee', 'Bekijk & selecteer'] as const).map((title, index) => <button key={title} aria-current={visibleStep === index + 1 ? 'step' : undefined} disabled={pending || !!proposal || index === 2 && !error} onClick={() => setStep((index + 1) as 1 | 2 | 3)}><span>{index + 1}</span>{title}</button>)}</nav>
    <h3 ref={stepHeading} tabIndex={-1} className="assistant-step-title">{visibleStep === 1 ? 'Wat wil je ontwerpen?' : visibleStep === 2 ? 'Vertel welke sfeer je zoekt' : pending ? 'Je ontwerp wordt gemaakt' : 'Bekijk en selecteer je ideeën'}</h3>
    <details className="assistant-technical" open><summary>AI-provider & model · {providerLabels[modelProvider] || provider}{requestModel ? ` · ${requestModel}` : ''}{runtimeInfo ? ` · ${runtimeInfo}` : ''}</summary>
    {providerChoices.length > 1 && <label className="assistant-brief">AI-provider<select aria-label="AI-provider" value={modelProvider} disabled={pending} onChange={event => { setChosenProvider(event.target.value); setModels(null); setModelError(''); setCloudConsent(false); setProposal(undefined); setTrace(undefined); setError('') }}>{providerChoices.map(id => <option key={id} value={id}>{providerLabels[id]}</option>)}</select></label>}
    {usesModelList && <div className="assistant-options assistant-model-options"><label>{copilot ? 'Copilot-model' : 'Ollama-model'}<select aria-label={copilot ? 'Copilot-model' : 'Ollama-model'} disabled={pending || !models} value={requestModel} onChange={event => { const model = event.target.value; if (copilot) setCopilotModel(model); else { setSelectedModel(model); try { localStorage.setItem('lightflow-ollama-model', model) } catch { setModelError('Modelkeuze kon niet worden onthouden; geldt wel voor deze sessie.') } } }}>
      {requestModel && !models?.includes(requestModel) && <option value={requestModel}>{requestModel} — niet beschikbaar</option>}
      {!requestModel && <option value="">{models ? 'Kies een model' : 'Modellen laden…'}</option>}
      {models?.map(model => <option key={model} value={model}>{model}</option>)}
    </select><small>{copilot ? 'Beschikbare modellen van je Copilot-account; keuze geldt voor de volgende aanvraag.' : 'Voor de volgende aanvraag. Alleen geïnstalleerde lokale modellen; geen downloads.'}</small></label><button disabled={pending} onClick={() => setModelRefresh(value => value + 1)}>Ververs modellen</button>{(modelError || models?.length === 0) && <p role="alert">{modelError || 'Geen beschikbare modellen gevonden.'}</p>}</div>}
    <details className="assistant-advanced-settings">
      <summary>Geavanceerd · {usesModelList ? `${copilot ? 'AI' : 'Ollama'}-tijdslimiet ${ollamaTimeoutMinutes} min` : 'aanvraaginformatie'}</summary>
      {usesModelList && <label>{copilot ? 'AI-tijdslimiet' : 'Ollama-tijdslimiet'}<select disabled={pending} value={ollamaTimeoutMinutes} onChange={e => { const minutes = Number(e.target.value); setOllamaTimeoutMinutes(minutes); try { localStorage.setItem('lightlab-ollama-timeout-minutes', String(minutes)) } catch { /* preference remains in memory */ } }}>{Array.from({ length: 60 }, (_, index) => index + 1).map(minutes => <option key={minutes} value={minutes}>{minutes} minuten</option>)}</select></label>}
      <p className="muted">Model en tijdslimiet gelden voor je volgende aanvraag, niet voor je show.{localModel && ' Inclusief maximaal één automatische correctiepoging.'}{runtimeInfo && ` ${runtimeInfo}.`}</p>
    </details>
    </details>
    {modelUnavailable && <p className="assistant-model-status" role="status">{copilot && !cloudConsent ? 'Kies je model; bevestig vervolgens bij je ontwerpvraag het gebruik van Copilot.' : 'Kies een beschikbaar model of vernieuw de modellenlijst.'}</p>}
    <div hidden={visibleStep !== 2} className="assistant-step-settings">
    {onBandProfileChange && <BandProfileEditor value={show.bandProfile} onChange={onBandProfileChange} disabled={pending} initiallyExpanded={false} />}
    {!onBandProfileChange && <p>{bandProfileSummary(show.bandProfile)}</p>}
    </div>
    <div hidden={visibleStep !== 1} className="assistant-step-scope">
    <p className="muted">Kies je collectie en de gewenste aantallen. Je kunt dit later nog wijzigen.</p>
    <div className="assistant-options">
      <label>Wat maken we?<select disabled={pending} value={options.scope} onChange={e => setOptions({ ...options, scope: e.target.value as DesignOptions['scope'] })}><option value="all">Complete collectie</option><option value="colorProfiles">Alleen kleurprofielen</option><option value="programs">Alleen animaties</option><option value="looks">Alleen Looks</option></select></label>
      <label>Werkwijze<select disabled={pending} value={options.replace ? 'replace' : options.revision ? 'revision' : 'new'} onChange={e => { setOptions({ ...options, revision: e.target.value === 'revision', replace: e.target.value === 'replace' }); setProposal(undefined); setError('') }}><option value="new">Nieuwe items toevoegen</option><option value="revision">Bestaande items verfijnen</option><option value="replace">Reeks vervangen</option></select></label>
      {(['colorProfiles', 'programs', 'looks'] as const).map((key, i) => (options.scope === 'all' || options.scope === key) && <label key={key}>{key === 'programs' ? 'Maximaal' : 'Aantal'} {labels[key]}<input disabled={pending} aria-label={`Aantal ${labels[key]}`} type="number" min={options.scope === 'all' && !options.replace ? 0 : 1} max="32" value={[options.profileCount, options.programCount, options.lookCount][i]} onChange={e => setOptions({ ...options, [(['profileCount', 'programCount', 'lookCount'] as const)[i]]: Number(e.target.value) })} /><small>{show[key].length}/32 in de show{key === 'programs' && ' · unieke samengestelde patronen, geen opvulling met duplicaten'}</small></label>)}
    </div>
    {options.replace && <p className="app-notice">Vervangt {options.scope === 'all' ? `alle ${show.colorProfiles.length} kleurprofielen, ${show.programs.length} animaties en ${show.looks.length} Looks` : options.scope === 'colorProfiles' ? `alle ${show.colorProfiles.length} kleurprofielen` : options.scope === 'programs' ? `alle ${show.programs.length} animaties` : `alle ${show.looks.length} Looks`} door de gekozen suggesties. Je huidige show blijft intact tot je accepteert; vooraf bewaren we een versie. Podium, patch, groepen en audio blijven behouden.</p>}
    <button disabled={!!configurationError} onClick={() => setStep(2)}>Verder: beschrijf je idee</button>
    </div>
    <div hidden={visibleStep !== 2} className="assistant-step-brief">
    <label className="assistant-brief">Beschrijf kleur, energie en ritme<textarea disabled={pending} value={intent} onChange={e => setIntent(e.target.value)} rows={3} /></label>
    <p className="muted">Vraag bijvoorbeeld: “Twee lichtpunten bewegen van buiten naar binnen met een zachte staart, daarna willekeurige accenten.” De AI combineert maximaal zestien stappen per patroon. Lightlab controleert de beschrijving en voert alleen ondersteunde bouwstenen uit, geen gegenereerde code. Beatduur, offset en kleur kies je per groep in de Look.</p>
    {(rejections > 0 || duplicateError) && <label className="assistant-brief">Wat moet anders? {rejections >= 3 && 'Maak je feedback concreet voor een volgende poging.'}<textarea disabled={pending} value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="Bijvoorbeeld: minder contrast, tragere pulsen, alleen wash bewegen" /></label>}
    {copilot && <div className="app-notice"><strong>Ontwerpen via je GitHub Copilot-abonnement</strong><p>Bij ‘Maak voorstel’ gaan je vraag, bandprofiel, aantallen, fixturemogelijkheden, opstelling en bestaande ontwerpen naar GitHub Copilot. Je abonnement en modelkeuze bepalen het verbruik. Er is geen automatische overstap naar een andere provider.</p><label><input type="checkbox" disabled={pending} checked={cloudConsent} onChange={event => setCloudConsent(event.target.checked)} />Ik wil deze ontwerpgegevens via Copilot verwerken.</label><details><summary>Aanmelden of een ander account gebruiken</summary><p>Voer <code>copilot login</code> uit in een terminal en voltooi de GitHub-aanmelding. Klik daarna op ‘Ververs modellen’. Lightlab vraagt of bewaart zelf geen token. De beschikbare modellen worden bij je aangemelde account opgehaald.</p></details></div>}
    </div>
    {(error || configurationError || result?.error) && <div className="assistant-error"><p role="alert">{error || configurationError || result?.error}</p>{visibleStep === 3 && !pending && <button onClick={() => { setProposal(undefined); setStep(configurationError ? 1 : 2) }}>Aanvraag aanpassen</button>}</div>}
    {duplicateError && <div className="app-notice"><p>Je show is niet gewijzigd. Het model leverde gelijke patronen binnen de reeks of ten opzichte van bestaande animaties. Je hoeft dit niet zelf in de recepten op te lossen.</p><p>Probeer opnieuw met een gerichte correctie. Vraag eventueel een lager maximum aan animaties; kleurprofielen en Looks kunnen hetzelfde aantal behouden.</p><button disabled={pending || modelUnavailable || !intent.trim() || !!configurationError} onClick={() => request(duplicateCorrection)}>Opnieuw met correctie</button></div>}
    <div hidden={visibleStep !== 2} className="assistant-actions assistant-submit">
      <button className="secondary" onClick={() => setStep(1)}>Terug naar aantallen</button>
      <button disabled={pending || modelUnavailable || !intent.trim() || !!configurationError || (rejections >= 3 && (!feedback.trim() || feedback.trim() === lastFeedback))} onClick={() => request()}>{pending ? 'Ontwerp wordt gemaakt…' : 'Maak voorstel'}</button>
    </div>
    {pending && <div className="ai-progress app-notice">
      <p role="status">{phaseLabels[progress.phase]} · poging {progress.attempt}</p>
      <p>{elapsed} s verstreken{usesModelList ? ` · tijdslimiet ${ollamaTimeoutMinutes} minuten` : ''} · {progress.activity < 0 ? 'nog geen modelsignaal ontvangen' : `laatste modelsignaal ${Math.max(0, elapsed - progress.activity)} s geleden`}{progress.heartbeat > 0 ? ` · laatste runtimecontact ${Math.max(0, elapsed - progress.heartbeat)} s geleden` : ''}</p>
      <button onClick={() => { controller.current?.abort(); setPending(false); setProgress(previous => ({ ...previous, text: '' })); setError('Aanvraag geannuleerd. Je show is niet gewijzigd.') }}>Annuleer aanvraag</button>
      <details><summary>Voorlopige modeluitvoer bekijken</summary><p>Ruwe, onvolledige uitvoer; nog niet gecontroleerd. Alleen tijdelijk zichtbaar, niet in je show opgeslagen.</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 240, overflow: 'auto' }}>{progress.text || 'Nog geen modeltekst ontvangen. Laden en voorbereiden kan even duren.'}</pre>{progress.clipped && <p>Tekst ingekort; activiteit en validatie blijven gevolgd.</p>}</details>
    </div>}
    <details hidden={visibleStep === 1} className="ai-diagnostics"><summary>AI-aanvraag en antwoord bekijken</summary>
      <label><input type="checkbox" checked={includeTrace} disabled={pending} onChange={e => { setIncludeTrace(e.target.checked); if (!e.target.checked) setTrace(undefined) }} />Bewaar diagnose voor de volgende aanvraag</label>
      <p>Alleen tijdelijk in het geheugen; niet in je show of versiegeschiedenis. Bevat je vraag, bandgegevens, opstelling, schema en modelinstellingen. De gekozen provider blijft de bestemming van je aanvraag. Een download kan privégegevens bevatten. Autorisatieheaders worden niet opgenomen. Bij Copilot toont dit de SDK-aanvraag en het ontvangen antwoord, niet de volledige interne cloud-uitwisseling.</p>
      {!trace && <p>Geen diagnose beschikbaar. Start een nieuwe aanvraag met diagnose ingeschakeld. Bij annuleren wordt geen antwoord opgehaald.</p>}
      {trace && <><p>{trace.provider} · {trace.model || 'standaardmodel'} · {trace.attempts.length} poging(en). {trace.truncated ? 'Ingekort: dit is niet de volledige uitwisseling.' : 'Volledige vastgelegde berichten, tenzij hieronder geredigeerd.'}</p>
        {trace.attempts.map((attempt, index) => <details key={index}><summary>Poging {index + 1} · {attempt.responseStatus ? `HTTP ${attempt.responseStatus}` : 'geen HTTP-antwoord'}</summary>
          {attempt.redacted && <p>API-sleutel geredigeerd indien deze in berichttekst voorkwam.</p>}
          <h4>{trace.provider === 'copilot' ? 'SDK-aanvraag' : 'Verzonden provider-body'}{attempt.requestTruncated ? ' (ingekort)' : ''}</h4><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 360, overflow: 'auto' }}>{attempt.requestBody}</pre>
          <h4>{trace.provider === 'copilot' ? 'Ontvangen modelantwoord' : 'Ruw providerantwoord'}{attempt.responseTruncated ? ' (ingekort/onvolledig)' : ''}</h4><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 360, overflow: 'auto' }}>{attempt.responseBody ?? 'Geen antwoord ontvangen.'}</pre>
        </details>)}<button onClick={() => downloadAiTrace(trace)}>Download diagnose</button><button onClick={() => setTrace(undefined)}>Wis diagnose</button></>}
    </details>
    {candidate && proposal && <div className="proposal-review">
      <p>Gemaakt met {providerLabels[proposal.data.provider] || proposal.data.provider}{proposal.model ? ` · ${proposal.model}` : ''}. De modelkeuze hierboven geldt voor je volgende aanvraag.</p>
      <h3>Bekijk je voorstel</h3><p>{proposal.data.summary}</p>
      <p>Kies welke ideeën je wilt bewaren. Benodigde paletten en patronen worden zichtbaar mee geselecteerd. Uitproberen verandert je selectie niet.</p>
      <div className="proposal-review-workspace">
        <aside className="proposal-live-preview">
          <div className="proposal-preview-heading"><div><p className="section-label">DIRECTE SIMULATIE</p><h4>Bekijk voordat je kiest</h4></div><span role="status">Alleen preview</span></div>
          <p className="proposal-preview-guidance">Gebruik <strong>Bekijk kleur</strong>, <strong>Bekijk animatie</strong> of <strong>Bekijk Look</strong> in de selectie. De simulator verandert direct zonder je selectie te wijzigen.</p>
          <button className="proposal-compare-button" aria-pressed={compareOriginal} onClick={() => setCompareOriginal(!compareOriginal)}>{compareOriginal ? 'Toon voorstel' : 'Vergelijk met huidige show'}</button>
          {compareOriginal && <p role="status">Huidige show · {show.looks.find(look => look.id === show.activeLookId)?.name}</p>}
          {active && visibleStep === 3 && <CandidatePreview simulationSettings={simulationControls.simulationSettings} show={compareOriginal ? show : candidate} lookId={compareOriginal ? show.activeLookId : lookId || candidate.activeLookId} profileId={compareOriginal ? undefined : profileId} programId={compareOriginal ? undefined : programId} auditionStatic={!compareOriginal && auditionStatic} />}
          <SimulationControls show={show} {...simulationControls} />
          {(auditionStatic || programId || profileId) && <p className="proposal-preview-state" role="status">Tijdelijke proef: {auditionStatic ? 'vast licht op alle lichtgroepen' : programId ? 'één animatie op alle lichtgroepen' : 'kleurwissel voor volgende lagen'}. {profileId && candidate.colorProfiles.find(profile => profile.id === profileId)?.name}</p>}
        </aside>
        <div className="proposal-selection-panel">
          <div className="assistant-actions"><button onClick={() => setSelection(Object.fromEntries(collectionKeys.map(key => [key, proposal.data[key].map(item => item.id)])) as ProposalSelection)}>Selecteer alles</button><button onClick={() => setSelection(emptySelection())}>Wis selectie</button></div>
          {!hasChanges && <p role="status">Geen nieuwe wijzigingen om op te slaan. De bestaande patronen blijven beschikbaar voor je Looks.</p>}
          {(proposal.options.scope === 'all' || proposal.options.scope === 'programs') && proposal.data.programs.length < proposal.options.programCount && <p role="status">{proposal.data.programs.length} unieke animaties voorgesteld van maximaal {proposal.options.programCount} gevraagd. Geen duplicaten toegevoegd om het aantal te vullen. Bestaande patronen kunnen door Looks worden hergebruikt.</p>}
          {qualityWarnings.length > 0 && <div className="quality-review"><h4>Aandachtspunten bij dit ontwerp</h4><ul>{qualityWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul><p>Dit zijn aandachtspunten, geen verbod: een bewust rustige reeks mag weinig variatie hebben.</p><button onClick={() => { setFeedback(qualityWarnings.join('\n')); setProposal(undefined); setStep(2); setRejections(value => value + 1) }}>Gebruik als feedback voor nieuw voorstel</button></div>}
          {proposal.options.replace && <p className="app-notice">Alleen bij ‘Vervang volledige collectie’ bevat de show hierna precies {candidate.colorProfiles.length} kleurprofielen, {candidate.programs.length} animaties en {candidate.looks.length} Looks. Die actie vervangt alles, ongeacht je selectie. Los te koppelen knoppen: {show.controlSurface.bindings.filter(binding => !candidate.controlSurface.bindings.some(next => next.id === binding.id)).map(binding => binding.label).join(', ') || 'geen'}. ‘Voeg selectie toe’ behoudt je bestaande collectie en knoppen. Voor beide acties bewaren we een versie.</p>}
          <div className="proposal-collections">{(['colorProfiles', 'programs', 'looks'] as const).map(key => proposal.data[key].length > 0 && <div key={key}><h4>{proposal.data[key].length} {labels[key]} · {proposal.options.revision ? 'gewijzigd' : 'nieuw'}</h4>{proposal.data[key].map(item => <div key={item.id}>
        <label><input type="checkbox" checked={resolvedSelection[key].includes(item.id)} disabled={resolvedSelection[key].includes(item.id) && !selection[key].includes(item.id)} onChange={event => setSelection(current => ({ ...current, [key]: event.target.checked ? [...current[key], item.id] : current[key].filter(id => id !== item.id) }))} /> <b>{'effect' in item ? animationLabel(item) : item.name}</b></label>
        {resolvedSelection[key].includes(item.id) && !selection[key].includes(item.id) && <small> Nodig voor je selectie</small>}
        {'effect' in item && item.pattern && <PatternDetails pattern={item.pattern} />}
        {'primary' in item && <span className="color-chips">{(candidate.regie?.colorRoles ?? ['primary', 'accent'] as const).map(role => <i key={role} style={{ background: item[role] }} title={`${{ primary: 'Hoofdkleur', accent: 'Accent', secondary: 'Subkleur', white: 'Wit' }[role]}: ${item[role]}`} />)}</span>}
        {'primary' in item && <button className="proposal-preview-button" aria-pressed={profileId === item.id && auditionStatic} onClick={() => { setProfileId(item.id); setProgramId(''); setAuditionStatic(true) }}>Bekijk kleur</button>}
        {'effect' in item && <button className="proposal-preview-button" aria-pressed={programId === item.id && !auditionStatic} onClick={() => { setProgramId(item.id); setProfileId(''); setAuditionStatic(false) }}>Bekijk animatie</button>}
        {'programId' in item && <button className="proposal-preview-button" aria-pressed={lookId === item.id && !profileId && !programId && !auditionStatic} onClick={() => { setLookId(item.id); setProfileId(''); setProgramId(''); setAuditionStatic(false) }}>Bekijk Look</button>}
        {'programId' in item && <small className="look-combination">{resolveLookLayers(candidate, item).map(layer => {
          const program = candidate.programs.find(program => program.id === layer.programId)
          const pattern = layer.mode === 'off' ? 'uit' : layer.mode === 'static' ? 'stabiel' : program ? layerAnimationLabel(program, { ...layer, offsetBeats: 0 }) : 'onbekend'
          const offset = layer.mode === 'animation' && layer.offsetBeats ? ` · ${Math.abs(layer.offsetBeats)} beats ${layer.offsetBeats > 0 ? 'later' : 'eerder'}` : ''
          return `${candidate.groups.find(group => group.id === layer.groupId)?.name}: ${pattern}${offset}${layer.mode === 'off' ? '' : ` · ${Math.round(layer.intensity * 100)}% · ${layer.colorProfileId ? candidate.colorProfiles.find(profile => profile.id === layer.colorProfileId)?.name : 'volgt Look'}`}`
        }).join(' / ')}</small>}
      </div>)}</div>)}</div>
          <p role="status">Selectie: {resolvedSelection.colorProfiles.length} kleurprofielen · {resolvedSelection.programs.length} patronen · {resolvedSelection.looks.length} Looks. {selectionError}</p>
          <button disabled={!selectedCandidate} onClick={acceptSelection}>{proposal.options.revision ? 'Bewaar geselecteerde wijzigingen' : proposal.options.replace && proposal.options.scope !== 'all' ? `Vervang geselecteerde ${labels[proposal.options.scope]}` : 'Voeg selectie toe aan collectie'}</button>
          <div className="assistant-actions">{proposal.options.replace && <button disabled={!hasChanges} onClick={() => { const accepted = proposalCandidate(show, proposal.data, proposal.options, proposal.base); if (!onAccept(accepted, `Ontwerp geaccepteerd: ${proposal.intent}`.slice(0, 4096), true)) { setError('Opslaan niet gelukt; je show is niet gewijzigd. Controleer de opslagmelding bovenaan. Vervangen vereist twee vrije versieplaatsen.'); return } setProposal(undefined); setRejections(0); setFeedback(''); setStep(1) }}>{proposal.options.scope === 'all' ? 'Vervang volledige collectie en bewaar versies' : `Vervang alle voorgestelde ${labels[proposal.options.scope]} en bewaar versies`}</button>}<button onClick={() => { setProposal(undefined); setStep(2); setRejections(n => n + 1) }}>Verwerp</button></div>
        </div>
      </div>
    </div>}
  </section>
}
