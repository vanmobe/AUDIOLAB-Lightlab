import { PatchWorkspace } from './PatchWorkspace'
import { StageEditor } from './StageEditor'
import { ControlSurfaceEditor } from './ControlSurfaceEditor'
import { LiveControlSurface } from './LiveControlSurface'
import { SidePanel } from './SidePanel'
import { LiveTransportBar } from './LiveTransportBar'
import { AudioInputSettings } from './AudioInputSettings'
import { ShowLibrary } from './ShowLibrary'
import { saveLibraryRecovery } from './show-library'
import { loadActivePackage, persistActivePackage } from './active-package'
import { ShowRegieSettings } from './ShowRegieSettings'
import { safetyLabel } from './CoverageStatus'
import { createLookTransitionPlayer, type TransitionResult } from './look-transitions'
import { LiveLookLibrary } from './LiveLookLibrary'
import { ShowDashboard } from './ShowDashboard'
import { lookLayerSummary } from './LookEditor'
import { createAudioLivePlayer, type AudioLiveSource } from './audio-live'
import { PatternDetails } from './PatternDetails'
import { LiveGroupControls } from './LiveGroupControls'
import { emptyLiveControls, linkedGroupIds, livePreview } from './live-controls'
import './flow.css'
import './workspace-flow.css'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  animationLabel,
  animationEffects,
  evaluateFrame,
  materializeGroupTiming,
  validateShow,
  type RuntimeMode,
  type RuntimeState,
  type ShowDocument,
} from './domain'
import { fixtureProfiles } from './fixtures'
import { initialShow } from './seed'
import type { StageSimulator } from './simulator'
import { simulationErrorMessage } from './simulation-errors'
import { ValidatedNameInput } from './ValidatedNameInput'
import { advancePreviewBeat } from './preview-clock'
import {
  defaultSimulationHaze,
  simulationHazeKey,
  validSimulationHaze,
  simulationBrightnessKey,
  validSimulationBrightness,
  type SimulationSettings,
} from './simulation-settings'
import { createShowPackage, createVersion, parseShowPackage, type ShowVersion, type ShowPackage } from './show-package'
import { chooseRehearsalItem, followRehearsalLook, rehearsalPreview, type RehearsalState } from './rehearsal'
import { LiveShortcutHelp } from './LiveShortcutHelp'
import { adjacentLookId, isLiveShortcutTextInput, liveShortcutAction } from './live-shortcuts'
import { WorkspaceNavigation, type Workspace } from './WorkspaceNavigation'
import { DesignNavigation, type DesignSection } from './DesignNavigation'
import { BrowserLiveStage } from './BrowserLiveStage'

// Access to the browser Storage object itself may throw; defer it into the guarded loader.
const activeStorage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
}

const AudioStudio = lazy(() => import('./AudioStudio').then(({ AudioStudio }) => ({ default: AudioStudio })))
const DesignAssistant = lazy(() =>
  import('./DesignAssistant').then(({ DesignAssistant }) => ({ default: DesignAssistant })),
)
const LookStudio = lazy(() => import('./LookStudio').then(({ LookStudio }) => ({ default: LookStudio })))
const RuntimeLiveView = lazy(() =>
  import('./RuntimeLiveView').then(({ RuntimeLiveView }) => ({ default: RuntimeLiveView })),
)

export default function App() {
  const [initialPackage] = useState(() => loadActivePackage(activeStorage, initialShow))
  const storageBlocked = initialPackage.blocked
  const [show, setShow] = useState<ShowDocument>(() => materializeGroupTiming(initialPackage.bundle.show))
  const [state, setState] = useState<RuntimeState>({ mode: 'automation', activeLookId: show.activeLookId })
  const [liveControls, setLiveControls] = useState(emptyLiveControls)
  const [liveSource, setLiveSource] = useState<'browser' | 'runtime'>('browser')
  const [liveController, setLiveController] = useState<'looks' | 'wing'>('looks')
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [armedLookId, setArmedLookId] = useState<string>()
  const [largeLiveControls, setLargeLiveControls] = useState(false)
  const [stageFocus, setStageFocus] = useState(false)
  const [showSettingsOpen, setShowSettingsOpen] = useState(false)
  const [runtimeMayContinue, setRuntimeMayContinue] = useState(false)
  const [rehearsal, setRehearsal] = useState<RehearsalState>({ mode: 'automation', activeLookId: show.activeLookId })
  const [beats, setBeats] = useState(0)
  const [workspace, setWorkspaceState] = useState<Workspace>('start')
  const patchDirty = useRef(false)
  const onPatchDirtyChange = useCallback((dirty: boolean) => {
    patchDirty.current = dirty
  }, [])
  function setWorkspace(next: typeof workspace) {
    if (
      next !== workspace &&
      workspace === 'patch' &&
      patchDirty.current &&
      !window.confirm('Je hebt niet-opgeslagen patchwijzigingen. Wil je deze verwerpen en verdergaan?')
    )
      return false
    const staysInRuntime =
      (workspace === 'runtime' || (workspace === 'live' && liveSource === 'runtime')) &&
      (next === 'runtime' || next === 'live')
    if (next !== workspace && !staysInRuntime && !confirmAudioDeparture()) return false
    if (
      next !== workspace &&
      !staysInRuntime &&
      (workspace === 'runtime' || (workspace === 'live' && liveSource === 'runtime'))
    )
      setRuntimeMayContinue(true)
    if (next === 'runtime' || staysInRuntime) {
      setLiveSource('runtime')
      setRuntimeMayContinue(false)
    }
    if (next === 'live' && liveSource === 'runtime') setRuntimeMayContinue(false)
    if (showMenu.current) showMenu.current.open = false
    setWorkspaceState(next)
    return true
  }
  function confirmAudioDeparture() {
    return (
      (workspace !== 'live' && workspace !== 'runtime') ||
      liveSource !== 'runtime' ||
      window.confirm(
        'De livebediening verlaten? Een zelfstandige livesessie kan blijven uitzenden; de simulatieknoppen bedienen die niet. Een gekoppelde WAV wordt ontkoppeld en de bijbehorende lichtuitvoer wordt uitgeschakeld. Stop de sessie eerst als alles moet stoppen. Doorgaan?',
      )
    )
  }
  function changeLiveSource(next: typeof liveSource) {
    if (next !== liveSource && !confirmAudioDeparture()) return
    if (next !== liveSource) setRuntimeMayContinue(next === 'browser')
    setLiveSource(next)
  }
  const [previewBpm, setPreviewBpm] = useState(120)
  const [simulationSettings, setSimulationSettings] = useState<SimulationSettings>(() => {
    let brightness = 100
    let haze = defaultSimulationHaze
    try {
      const raw = localStorage.getItem(simulationBrightnessKey)
      if (raw !== null) brightness = validSimulationBrightness(Number(raw))
    } catch {
      /* Preview still works without local storage. */
    }
    try {
      const raw = localStorage.getItem(simulationHazeKey)
      if (raw !== null) haze = validSimulationHaze(Number(raw))
    } catch {
      /* Preview still works without local storage. */
    }
    return { brightness, haze, hiddenGroupIds: [] }
  })
  const simulationControls = { simulationSettings, onSimulationSettingsChange: setSimulationSettings }
  const onCameraChange = (camera: ShowDocument['camera']) => setShow((current) => ({ ...current, camera }))
  const [designSection, setDesignSection] = useState<DesignSection>('ai')
  const [versions, setVersions] = useState<ShowVersion[]>(initialPackage.bundle.versions)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [packageBusy, setPackageBusy] = useState(false)
  const packageOperation = useRef(false)
  const [packageMessage, setPackageMessage] = useState(initialPackage.message)
  const [storageUnsaved, setStorageUnsaved] = useState(storageBlocked)
  const storageUnsavedRef = useRef(storageBlocked)
  const importRef = useRef<HTMLInputElement>(null)
  const showMenu = useRef<HTMLDetailsElement>(null)
  function runShowAction(action: () => void) {
    if (showMenu.current) showMenu.current.open = false
    action()
  }
  const stage = useRef<HTMLDivElement>(null)
  const simulator = useRef<StageSimulator | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [previewRetry, setPreviewRetry] = useState(0)
  const preview = useMemo(() => rehearsalPreview(show, rehearsal), [show, rehearsal])
  const live = useMemo(() => livePreview(show, state, liveControls), [show, state, liveControls])
  const rehearsing = workspace === 'audition'
  const displayedShow = rehearsing ? preview.show : live.show
  const displayedState = rehearsing ? preview.state : live.state
  const audioSource = useRef<AudioLiveSource | null>(null)
  const runtimeAudioGroups = useRef<((id: string) => string[]) | null>(null)
  const players = useRef({ live: createAudioLivePlayer(), rehearsal: createLookTransitionPlayer() })
  const [rendered, setRendered] = useState<TransitionResult>(() => ({
    frame: evaluateFrame(displayedShow, fixtureProfiles, displayedState, beats),
  }))
  const frame = rendered.frame
  useEffect(() => {
    players.current.live.reset()
    players.current.rehearsal.reset()
  }, [show.fixtures, show.bandMembers])
  useEffect(() => {
    // Advance stateful transitions only after committed input, never during speculative React rendering.
    setRendered(
      rehearsing
        ? players.current.rehearsal.evaluate(displayedShow, fixtureProfiles, displayedState, beats)
        : players.current.live.evaluate(
            displayedShow,
            displayedState,
            beats,
            workspace === 'live' && liveSource === 'browser' ? audioSource.current?.read() : undefined,
          ),
    )
  }, [displayedShow, displayedState, beats, rehearsing, workspace, liveSource])
  const issues = useMemo(() => validateShow(show, fixtureProfiles), [show])
  const errors = issues.filter((issue) => issue.severity === 'error')
  const activeLook = rehearsing ? preview.look : show.looks.find((look) => look.id === state.activeLookId)

  useEffect(() => {
    if (storageBlocked) return
    try {
      persistActivePackage(activeStorage, createShowPackage(show, versions))
      storageUnsavedRef.current = false
      setStorageUnsaved(false)
    } catch {
      // The unload listener reads the ref immediately, even before React renders the warning.
      storageUnsavedRef.current = true
      setStorageUnsaved(true)
    }
  }, [show, versions, storageBlocked])
  useEffect(() => {
    try {
      localStorage.setItem(simulationBrightnessKey, String(simulationSettings.brightness))
    } catch {
      /* Nonessential display preference; retain the session value. */
    }
  }, [simulationSettings.brightness])
  useEffect(() => {
    try {
      localStorage.setItem(simulationHazeKey, String(simulationSettings.haze ?? defaultSimulationHaze))
    } catch {
      /* Nonessential display preference; retain the session value. */
    }
  }, [simulationSettings.haze])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (patchDirty.current || packageOperation.current || storageUnsavedRef.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [patchDirty, packageOperation, storageUnsavedRef])
  useEffect(() => {
    if ((workspace === 'live' || workspace === 'runtime') && liveSource === 'runtime') return
    let previous = performance.now()
    // Free-clock fallback and render cadence. Audio-follow reads the media clock separately.
    const timer = window.setInterval(() => {
      const now = performance.now(),
        elapsed = now - previous
      previous = now
      setBeats((value) => advancePreviewBeat(value, elapsed, 60))
    }, 50)
    return () => window.clearInterval(timer)
  }, [workspace, liveSource])
  useEffect(() => {
    if (!stage.current) return
    let cancelled = false
    let view: StageSimulator | null = null
    void import('./simulator')
      .then(({ StageSimulator }) => {
        if (cancelled || !stage.current) return
        try {
          view = new StageSimulator(stage.current, show.fixtures, show.camera, show.bandMembers)
          simulator.current = view
          setPreviewError('')
        } catch (error) {
          simulator.current = null
          setPreviewError(
            simulationErrorMessage(
              error,
              'De 3D-weergave kon niet starten. Je show blijft beschikbaar; controleer WebGL en probeer opnieuw.',
            ),
          )
        }
      })
      .catch((error) => {
        if (cancelled) return
        setPreviewError(
          simulationErrorMessage(
            error,
            'De 3D-weergave kon niet laden. Je show blijft beschikbaar; controleer WebGL en probeer opnieuw.',
          ),
        )
      })
    return () => {
      cancelled = true
      view?.dispose()
      if (simulator.current === view) simulator.current = null
    }
  }, [workspace, liveSource, show.fixtures, show.bandMembers, previewRetry])
  useEffect(
    () => simulator.current?.update(frame, simulationSettings),
    [frame, workspace, simulationSettings, previewRetry],
  )
  useEffect(() => simulator.current?.setCamera(show.camera), [show.camera])

  function selectLook(id: string) {
    if (rehearsing) setRehearsal((current) => followRehearsalLook(current, id))
    else {
      setState({ mode: 'automation', activeLookId: id })
      setLiveControls((current) => ({ ...current, overrides: {} }))
    }
  }
  function setMode(mode: RuntimeMode) {
    if (rehearsing)
      setRehearsal((current) => ({ ...current, mode, heldAtBeats: mode === 'static' ? beats : undefined }))
    else setState((current) => ({ ...current, mode, heldAtBeats: mode === 'static' ? beats : undefined }))
  }
  function triggerLiveLook(id: string) {
    selectLook(id)
    setArmedLookId(undefined)
  }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (workspace !== 'live' || isLiveShortcutTextInput(event.target)) return
      const action = liveShortcutAction(event)
      if (!action) return
      if (action === 'help') {
        event.preventDefault()
        setShortcutsOpen(true)
        return
      }
      if (liveSource !== 'browser') return
      if (action === 'previous-look' || action === 'next-look') {
        const next =
          action === 'next-look' && armedLookId
            ? armedLookId
            : adjacentLookId(show.looks, state.activeLookId, action === 'previous-look' ? -1 : 1)
        if (next) {
          event.preventDefault()
          triggerLiveLook(next)
        }
      } else if (action === 'blackout') {
        event.preventDefault()
        setMode('blackout')
      } else if (action === 'toggle-playback') {
        event.preventDefault()
        setMode(state.mode === 'automation' ? 'static' : 'automation')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [workspace, liveSource, show.looks, state.activeLookId, state.mode, armedLookId])
  function setGroupIntensity(groupId: string, intensity: number) {
    if (rehearsing) {
      setRehearsal((current) => ({
        ...current,
        groupIntensities: { ...current.groupIntensities, [groupId]: intensity },
      }))
      return
    }
    const targets = workspace === 'live' ? linkedGroupIds(show, liveControls, groupId) : [groupId]
    setShow((current) => ({
      ...current,
      groups: current.groups.map((group) => (targets.includes(group.id) ? { ...group, intensity } : group)),
    }))
  }
  function persistVersions(next: ShowVersion[]) {
    if (storageBlocked) {
      setPackageMessage('Versieopslag is geblokkeerd. Exporteer je showpakket.')
      return false
    }
    try {
      persistActivePackage(activeStorage, createShowPackage(show, next))
      return true
    } catch {
      setPackageMessage('Versie kon niet worden opgeslagen. Exporteer je showpakket; je show blijft ongewijzigd.')
      return false
    }
  }
  function saveVersion() {
    if (versions.length >= 100) {
      setPackageMessage('Maximum 100 versies bereikt. Exporteer je showpakket.')
      return
    }
    const version = createVersion(show, `Versie ${versions.length + 1}`),
      next = [version, ...versions]
    if (!persistVersions(next)) return
    setVersions(next)
    setPackageMessage(`Versie opgeslagen om ${new Date(version.createdAt).toLocaleTimeString('nl-BE')}.`)
  }
  function openLibrary() {
    if (patchDirty.current) {
      setPackageMessage('Bewaar of verwerp eerst je patchwijzigingen voordat je de showbibliotheek opent.')
      return
    }
    if (showMenu.current) showMenu.current.open = false
    setLibraryOpen(true)
  }
  async function openLibraryPackage(bundle: ShowPackage) {
    if (packageOperation.current) return false
    if (patchDirty.current || storageBlocked)
      throw new Error(
        'Openen geblokkeerd door een patchdraft of ontoegankelijke actieve opslag. Bewaar of verwerp je patchwijzigingen; exporteer bij opslagproblemen je huidige werk.',
      )
    const leavesRuntime = (workspace === 'live' || workspace === 'runtime') && liveSource === 'runtime'
    if (
      !window.confirm(
        'Deze show openen? Je huidige show en alle versies worden eerst als herstelkopie in de bibliotheek bewaard. Een draaiende runtime blijft zijn eigen snapshot gebruiken.' +
          (leavesRuntime
            ? ' Een zelfstandige DMX-sessie kan blijven uitzenden. Een gekoppelde WAV wordt ontkoppeld en de bijbehorende lichtuitvoer uitgeschakeld.'
            : ''),
      )
    )
      return false
    packageOperation.current = true
    setPackageBusy(true)
    try {
      const recoveryName = `${show.name.slice(0, 75)} · herstel ${new Date().toLocaleString('nl-BE')}`
      await saveLibraryRecovery(recoveryName, createShowPackage(show, versions))
      const next = { ...bundle, show: materializeGroupTiming(bundle.show) }
      persistActivePackage(localStorage, next)
      setShow(next.show)
      setVersions(next.versions)
      setState({ mode: 'blackout', activeLookId: next.show.activeLookId })
      setLiveControls(emptyLiveControls())
      setRehearsal({ mode: 'automation', activeLookId: next.show.activeLookId })
      setSimulationSettings((current) => ({ ...current, hiddenGroupIds: [] }))
      if (leavesRuntime) setRuntimeMayContinue(true)
      setWorkspaceState('start')
      setLibraryOpen(false)
      setPackageMessage(
        'Show geopend. De vorige show en versies staan als herstelkopie in de bibliotheek. De browsersimulatie staat op blackout.',
      )
      return true
    } catch (error) {
      setPackageMessage(error instanceof Error ? error.message : 'Show kon niet worden geopend.')
      throw error
    } finally {
      packageOperation.current = false
      setPackageBusy(false)
    }
  }
  async function restoreLibraryVersion(id: string) {
    const version = versions.find((item) => item.id === id)
    if (!version || storageBlocked || versions.length >= 100) {
      setPackageMessage('Herstellen niet mogelijk: versie ontbreekt, opslag is geblokkeerd of er zijn al 100 versies.')
      return false
    }
    try {
      await saveLibraryRecovery(`${show.name.slice(0, 75)} · vóór versieherstel`, createShowPackage(show, versions))
      const nextShow = materializeGroupTiming(version.show),
        nextVersions = [createVersion(show, 'Vóór versieherstel'), ...versions]
      persistActivePackage(localStorage, createShowPackage(nextShow, nextVersions))
      setShow(nextShow)
      setVersions(nextVersions)
      setState({ mode: 'blackout', activeLookId: nextShow.activeLookId })
      setLiveControls(emptyLiveControls())
      setRehearsal({ mode: 'automation', activeLookId: nextShow.activeLookId })
      setSimulationSettings((current) => ({ ...current, hiddenGroupIds: [] }))
      setPackageMessage('Versie hersteld; de vorige toestand is als herstelversie én bibliotheekkopie bewaard.')
      return true
    } catch (error) {
      setPackageMessage(error instanceof Error ? error.message : 'Versieherstel mislukt.')
      throw error
    }
  }
  function deleteLibraryVersion(id: string) {
    const next = versions.filter((item) => item.id !== id)
    if (next.length === versions.length || !persistVersions(next)) return false
    setVersions(next)
    setPackageMessage(
      'Versie verwijderd uit de actieve geschiedenis. Eerder geëxporteerde pakketten en bibliotheekkopieën blijven intact.',
    )
    return true
  }
  function restoreStartShow() {
    if (
      !window.confirm(
        'De huidige show vervangen door de startshow? Je huidige show wordt eerst als herstelversie bewaard.',
      )
    )
      return
    if (versions.length >= 100 || storageBlocked) {
      setPackageMessage(
        'Herstel geblokkeerd: onvoldoende versieplaatsen of lokale opslag niet beschikbaar. Exporteer eerst je show.',
      )
      return
    }
    const recoveryVersions = [createVersion(show, 'Vóór herstel startshow'), ...versions]
    try {
      persistActivePackage(activeStorage, createShowPackage(materializeGroupTiming(initialShow), recoveryVersions))
    } catch {
      setPackageMessage(
        'Herstelversie kon niet worden bewaard. Je huidige show is niet gewijzigd. Exporteer eerst je show.',
      )
      return
    }
    setVersions(recoveryVersions)
    setShow(materializeGroupTiming(initialShow))
    setSimulationSettings((current) => ({ ...current, hiddenGroupIds: [] }))
    setState((current) => ({ ...current, activeLookId: initialShow.activeLookId, colorLockId: undefined }))
    setLiveControls(emptyLiveControls())
    setRehearsal({ mode: 'automation', activeLookId: initialShow.activeLookId })
    setPackageMessage('Startshow hersteld. De vorige show is als herstelversie bewaard in het showpakket.')
  }
  function exportShow() {
    const file = new Blob([JSON.stringify(createShowPackage(show, versions), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = `${show.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'show'}.lightflow.json`
    link.click()
    URL.revokeObjectURL(url)
    setPackageMessage('Showpakket gedownload.')
  }
  async function importShow(file?: File) {
    if (!file || packageOperation.current) return
    try {
      if (file.size > 20_000_000) throw new Error('Showpakket is te groot (maximaal 20 MB).')
      // Parsing and the native file picker do not replace editor state; opening uses the same durable recovery path as the library.
      const bundle = parseShowPackage(await file.text())
      await openLibraryPackage(bundle)
    } catch (error) {
      setPackageMessage(error instanceof Error ? error.message : 'Import mislukt.')
    }
  }
  function acceptDesign(candidate: ShowDocument, note: string, replacement = false) {
    if (versions.length + (replacement ? 2 : 1) > 100) {
      setPackageMessage('Onvoldoende versieplaatsen. Exporteer je showpakket.')
      return false
    }
    const nextVersions = [
      createVersion(candidate, note),
      ...(replacement ? [createVersion(show, 'Vóór volledige vervanging van de ontwerpcollectie')] : []),
      ...versions,
    ]
    // Acceptance promises a saved version for additions too, not just replacements.
    if (storageBlocked) {
      setPackageMessage('Opslag is geblokkeerd. Exporteer je showpakket.')
      return false
    }
    try {
      persistActivePackage(activeStorage, createShowPackage(materializeGroupTiming(candidate), nextVersions))
    } catch {
      setPackageMessage('Ontwerp kon niet worden opgeslagen. Je show blijft ongewijzigd. Exporteer je werk.')
      return false
    }
    setShow(materializeGroupTiming(candidate))
    setState((current) => ({
      ...current,
      activeLookId: candidate.activeLookId,
      colorLockId: replacement ? undefined : current.colorLockId,
    }))
    if (replacement) setLiveControls((current) => ({ ...current, overrides: {} }))
    if (replacement) setRehearsal({ mode: 'automation', activeLookId: candidate.activeLookId })
    setVersions(nextVersions)
    setPackageMessage('Ontwerp toegepast en als nieuwe versie bewaard.')
    return true
  }
  const liveAudio = workspace === 'live' ? audioSource.current?.read() : undefined
  const simulationStatus = `${liveAudio?.playing ? 'WAV volgt' : liveAudio ? 'WAV gereed' : 'Vrije klok'} · ${Math.round(liveAudio?.bpm ?? previewBpm)} BPM · geen DMX`

  return (
    <>
      <main
        className="app-shell"
        data-workspace={workspace}
        data-live-density={largeLiveControls ? 'large' : 'standard'}
        data-live-stage-focus={stageFocus ? 'focused' : 'standard'}
        inert={packageBusy}
      >
        <header className="topbar">
          <div className="brand-lockup">
            <img className="brand-symbol" src="/favicon.svg" alt="" width="48" height="48" />
            <div>
              <span className="eyebrow">
                LIGHTLAB <small>by Audiolab</small>
              </span>
              <h1>{show.name}</h1>
            </div>
          </div>
          <details
            className="show-menu"
            ref={showMenu}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && showMenu.current?.open) {
                showMenu.current.open = false
                showMenu.current.querySelector('summary')?.focus()
              }
            }}
          >
            <summary>
              Show <span aria-hidden="true">⌄</span>
            </summary>
            <div className="show-menu-content">
              <p className="section-label">SHOWBEHEER</p>
              <p className="muted">{show.name}</p>
              <button onClick={() => runShowAction(() => importRef.current?.click())}>Show openen…</button>
              <button onClick={() => runShowAction(exportShow)}>Show exporteren</button>
              <button onClick={() => runShowAction(saveVersion)}>
                Versie bewaren <small>{versions.length}/100</small>
              </button>
              <hr />
              <button className="lab-danger" onClick={() => runShowAction(restoreStartShow)}>
                Herstel startshow…
              </button>
              <p className="muted">Lokaal opgeslagen in deze browser. Exporteer voor een back-up.</p>
            </div>
          </details>
          <input
            ref={importRef}
            hidden
            type="file"
            accept="application/json,.lightflow.json"
            onChange={(event) => {
              void importShow(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <button onClick={openLibrary}>Bibliotheek & versies</button>
        </header>
        {runtimeMayContinue && (
          <p className="app-notice" role="status">
            Een livesessie kan nog actief zijn. De simulatie bedient die niet.{' '}
            <button
              onClick={() => {
                if (setWorkspace('live')) {
                  setLiveSource('runtime')
                  setRuntimeMayContinue(false)
                }
              }}
            >
              Terug naar livesessie
            </button>
          </p>
        )}
        {packageMessage && (
          <p className="app-notice" role="status">
            {packageMessage}
          </p>
        )}
        {storageUnsaved && !storageBlocked && (
          <p className="app-notice" role="alert">
            Niet opgeslagen: lokale opslag kon je show met versies niet bijwerken. Exporteer je show voordat je dit
            tabblad sluit. Een volgende geslaagde opslag heft deze waarschuwing op.
          </p>
        )}
        {libraryOpen && (
          <ShowLibrary
            show={show}
            versions={versions}
            onClose={() => setLibraryOpen(false)}
            onOpen={openLibraryPackage}
            onRestoreVersion={restoreLibraryVersion}
            onDeleteVersion={deleteLibraryVersion}
          />
        )}
        <WorkspaceNavigation workspace={workspace} onWorkspaceChange={setWorkspace} />
        {workspace === 'start' && (
          <ShowDashboard
            show={show}
            versionCount={versions.length}
            onSetup={() => setWorkspace('stage')}
            onDesign={() => setWorkspace('design')}
            onLive={() => setWorkspace('live')}
            onImport={() => importRef.current?.click()}
            onExport={exportShow}
          />
        )}
        {workspace === 'stage' && <StageEditor show={show} onChange={setShow} />}
        {workspace === 'live' && (
          <div className="live-source-switch" role="group" aria-label="Bron livebediening">
            <button
              className="live-exit"
              aria-label="Terug naar overzicht"
              title="Terug naar overzicht"
              onClick={() => setWorkspace('start')}
            >
              ← Overzicht
            </button>
            <span>Bedien</span>
            <button
              aria-pressed={liveSource === 'browser'}
              className={liveSource === 'browser' ? 'active' : ''}
              onClick={() => changeLiveSource('browser')}
            >
              Simulatie
            </button>
            <button
              aria-pressed={liveSource === 'runtime'}
              className={liveSource === 'runtime' ? 'active' : ''}
              onClick={() => changeLiveSource('runtime')}
            >
              Livesessie
            </button>
            <button
              className="live-density-toggle"
              aria-label={largeLiveControls ? 'Normale knoppen gebruiken' : 'Grote knoppen gebruiken'}
              aria-pressed={largeLiveControls}
              onClick={() => setLargeLiveControls((value) => !value)}
            >
              <span className="live-density-label-full">{largeLiveControls ? 'Normale knoppen' : 'Grote knoppen'}</span>
              <span className="live-density-label-short">{largeLiveControls ? 'Normaal' : 'Groot'}</span>
            </button>
            <span className="scope-label">
              {liveSource === 'browser'
                ? 'Alleen simulatiebediening · een bestaande livesessie kan blijven uitzenden'
                : 'Livesessie · DMX apart aan/uit'}
            </span>
          </div>
        )}
        {workspace === 'live' && liveSource === 'browser' && (
          <LiveTransportBar
            target="Simulatie"
            lookName={activeLook?.name ?? 'Geen Look'}
            mode={displayedState.mode}
            safetyLabel={safetyLabel(show)}
            status={simulationStatus}
            output={{ state: 'simulation', label: 'SIMULATIE' }}
            onShortcutHelp={() => setShortcutsOpen(true)}
            onMode={setMode}
          >
            <button onClick={() => setStageFocus((value) => !value)}>
              {stageFocus ? 'Bediening tonen' : 'Focus podium'}
            </button>
            <button onClick={() => changeLiveSource('runtime')}>Naar DMX-bediening</button>
          </LiveTransportBar>
        )}
        {(workspace === 'design' || workspace === 'audition') && (
          <>
            <DesignNavigation
              workspace={workspace}
              section={designSection}
              show={show}
              onWorkspaceChange={setWorkspace}
              onSectionChange={setDesignSection}
              onOpenShowSettings={() => setShowSettingsOpen(true)}
            />
            {/* Keep proposals and in-flight requests intact when browsing another design category. */}
            <div hidden={workspace !== 'design' || designSection !== 'ai'}>
              <Suspense fallback={<p className="muted">AI-ontwerp laden…</p>}>
                <DesignAssistant
                  {...simulationControls}
                  show={show}
                  onAccept={acceptDesign}
                  onBandProfileChange={(bandProfile) =>
                    setShow((current) => {
                      const { bandProfile: _previous, ...rest } = current
                      return bandProfile ? { ...rest, bandProfile } : rest
                    })
                  }
                  active={workspace === 'design' && designSection === 'ai'}
                />
              </Suspense>
            </div>
          </>
        )}
        <SidePanel open={showSettingsOpen} onClose={() => setShowSettingsOpen(false)} title="Showinstellingen">
          <p className="scope-label">Bewaard in show</p>
          <ShowRegieSettings expanded show={show} onChange={setShow} />
        </SidePanel>
        {workspace === 'audio' && <AudioInputSettings show={show} onChange={setShow} />}
        <div className={workspace === 'live' ? 'live-workspace-body' : undefined}>
          {(workspace === 'audio' || workspace === 'live' || workspace === 'runtime') && (
            <div className={workspace === 'live' ? 'live-audio-region' : undefined} hidden={workspace === 'runtime'}>
              <Suspense fallback={<p className="muted">Audio laden…</p>}>
                <AudioStudio
                  show={show}
                  {...simulationControls}
                  onCameraChange={onCameraChange}
                  active
                  onConfigure={() => setWorkspace('audio')}
                  live={workspace === 'live' || workspace === 'runtime'}
                  runtime={(workspace === 'live' || workspace === 'runtime') && liveSource === 'runtime'}
                  sourceRef={audioSource}
                  selectedLiveLookId={state.activeLookId}
                  linkedGroups={(id) =>
                    (workspace === 'live' || workspace === 'runtime') && liveSource === 'runtime'
                      ? (runtimeAudioGroups.current?.(id) ?? [id])
                      : linkedGroupIds(show, liveControls, id)
                  }
                />
              </Suspense>
            </div>
          )}

          {workspace === 'start' || workspace === 'stage' || workspace === 'audio' ? null : workspace === 'patch' ? (
            <PatchWorkspace show={show} onChange={setShow} onDirtyChange={onPatchDirtyChange} />
          ) : workspace === 'design' ? (
            <section className="design-library" aria-label="Ontwerpen">
              {designSection === 'colors' && (
                <>
                  <p className="muted">Je palet bepaalt de sfeer. Open een profiel om de kleuren aan te passen.</p>
                  {show.colorProfiles.map((profile) => (
                    <details className="design-card" key={profile.id}>
                      <summary>
                        <span>{profile.name}</span>
                        <span className="design-card-swatches" aria-label="Hoofdkleur en accentkleur">
                          <i style={{ backgroundColor: profile.primary }} />
                          <i style={{ backgroundColor: profile.accent }} />
                        </span>
                      </summary>
                      <fieldset>
                        <legend>Kleurprofiel</legend>
                        <label className="editor-row">
                          Naam
                          <ValidatedNameInput
                            key={profile.id}
                            value={profile.name}
                            onChange={(name) =>
                              setShow((current) => ({
                                ...current,
                                colorProfiles: current.colorProfiles.map((item) =>
                                  item.id === profile.id ? { ...item, name } : item,
                                ),
                              }))
                            }
                          />
                        </label>
                        {(['primary', 'secondary', 'accent', 'white'] as const).map((role) => (
                          <label className="editor-row" key={role}>
                            {
                              {
                                primary: 'Hoofdkleur',
                                secondary: 'Nevenskleur',
                                accent: 'Accentkleur',
                                white: 'Wittint',
                              }[role]
                            }
                            <input
                              type="color"
                              value={profile[role]}
                              onChange={(event) =>
                                setShow((current) => ({
                                  ...current,
                                  colorProfiles: current.colorProfiles.map((item) =>
                                    item.id === profile.id ? { ...item, [role]: event.target.value } : item,
                                  ),
                                }))
                              }
                            />
                          </label>
                        ))}
                      </fieldset>
                    </details>
                  ))}
                </>
              )}
              {designSection === 'programs' && (
                <>
                  <p className="muted">
                    Ollama kan patronen samenstellen uit selecties, richtingen en lichtverlopen. Bekijk hieronder de
                    stappen die werkelijk worden uitgevoerd. Duur en offset stel je per groep in bij Looks.
                  </p>
                  {show.programs.map((program) => (
                    <details className="design-card" key={program.id}>
                      <summary>
                        <span>{animationLabel(program)}</span>
                      </summary>
                      <fieldset>
                        <legend>Animatie</legend>
                        {program.pattern ? (
                          <>
                            <PatternDetails pattern={program.pattern} />
                            <button onClick={() => setDesignSection('ai')}>Naar AI-ontwerp →</button>
                          </>
                        ) : (
                          <label className="editor-row">
                            Basiseffect
                            <select
                              value={program.effect}
                              onChange={(event) =>
                                setShow((current) => ({
                                  ...current,
                                  programs: current.programs.map((item) =>
                                    item.id === program.id
                                      ? { ...item, effect: event.target.value as typeof item.effect }
                                      : item,
                                  ),
                                }))
                              }
                            >
                              {animationEffects.map((effect) => (
                                <option
                                  key={effect.id}
                                  value={effect.id}
                                  disabled={
                                    effect.id !== program.effect &&
                                    show.programs.some(
                                      (other) =>
                                        !other.pattern && other.id !== program.id && other.effect === effect.id,
                                    )
                                  }
                                >
                                  {effect.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <p className="muted">Beatduur hoort bij de groep, niet bij dit patroon.</p>
                      </fieldset>
                    </details>
                  ))}
                </>
              )}
              {designSection === 'looks' && (
                <>
                  <Suspense fallback={<p className="muted">Looks laden…</p>}>
                    <LookStudio
                      {...simulationControls}
                      onCameraChange={onCameraChange}
                      show={show}
                      onChange={setShow}
                      bpm={previewBpm}
                      onBpmChange={setPreviewBpm}
                      selectedLookId={rehearsal.activeLookId ?? show.activeLookId}
                      onSelectLook={(id) => setRehearsal((current) => followRehearsalLook(current, id))}
                    />
                  </Suspense>
                  <button className="studio-audition-link" onClick={() => setWorkspace('audition')}>
                    Open Testlab voor losse animaties en kleuren →
                  </button>
                </>
              )}
            </section>
          ) : workspace === 'control' ? (
            <ControlSurfaceEditor
              show={show}
              onChange={setShow}
              onPreviewLook={(id) => {
                setRehearsal((current) => followRehearsalLook(current, id))
                setDesignSection('looks')
                setWorkspace('design')
              }}
            />
          ) : (workspace === 'live' || workspace === 'runtime') && liveSource === 'runtime' ? (
            <Suspense fallback={<p className="muted">Livesessie laden…</p>}>
              <RuntimeLiveView
                show={show}
                {...simulationControls}
                management={workspace === 'runtime'}
                onNavigate={setWorkspace}
                audioSource={audioSource}
                audioGroupTargets={runtimeAudioGroups}
                onConfigure={() => setWorkspace('control')}
                onOpenConnections={() => setWorkspace('runtime')}
                onShortcutHelp={() => setShortcutsOpen(true)}
              />
            </Suspense>
          ) : (
            <>
              {workspace === 'audition' && (
                <div className="app-notice">
                  <strong>Testlab</strong>
                  <p>
                    Probeer een opgeslagen Look met een losse animatie, kleur en groepsmasters in de simulatie. Dit
                    verandert je show niet; bewaren doe je daarna bewust bij Kleuren, Animaties of Looks.
                  </p>
                </div>
              )}
              <section className="workspace">
                <BrowserLiveStage
                  show={show}
                  stageRef={stage}
                  rehearsing={rehearsing}
                  displayedState={displayedState}
                  displayedShow={displayedShow}
                  rehearsal={rehearsal}
                  preview={preview}
                  activeLook={activeLook}
                  frame={frame}
                  transition={rendered.transition}
                  previewError={previewError}
                  onRetryPreview={() => setPreviewRetry((value) => value + 1)}
                  simulationControls={simulationControls}
                  onCameraChange={onCameraChange}
                />
                <aside className="control-panel">
                  {rehearsing && (
                    <section className="rehearsal-controls" aria-label="Vrij combineren">
                      <p className="section-label">
                        VRIJ COMBINEREN <span>Alleen preview</span>
                      </p>
                      <p className="muted">
                        Een vrije animatie vervangt het patroon op alle lichtgroepen (niet de hazer). Een kleurwissel
                        geldt alleen voor lagen die de Lookkleur volgen. Je opgeslagen Looks blijven ongewijzigd.
                      </p>
                      <label>
                        Animatie <small>{show.programs.length} beschikbaar</small>
                        <select
                          aria-label="Animatie uitproberen"
                          value={rehearsal.programId ?? ''}
                          disabled={!show.programs.length}
                          onChange={(event) =>
                            setRehearsal((current) => chooseRehearsalItem(show, current, 'program', event.target.value))
                          }
                        >
                          <option value="" disabled>
                            Volgt lagen van gekozen Look
                          </option>
                          {show.programs.map((program) => (
                            <option key={program.id} value={program.id}>
                              {animationLabel(program)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Kleurprofiel <small>{show.colorProfiles.length} beschikbaar</small>
                        <select
                          aria-label="Kleurprofiel uitproberen"
                          value={preview.profile?.id ?? ''}
                          disabled={!show.colorProfiles.length}
                          onChange={(event) =>
                            setRehearsal((current) => chooseRehearsalItem(show, current, 'profile', event.target.value))
                          }
                        >
                          {show.colorProfiles.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                              {profile.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {preview.profile && (
                        <div className="rehearsal-swatches" aria-label="Kleuren in dit profiel">
                          {(['primary', 'secondary', 'accent', 'white'] as const).map((role, index) => (
                            <span key={role}>
                              <i style={{ background: preview.profile![role] }} />
                              <small>{['Hoofd', 'Tweede', 'Accent', 'Wit'][index]}</small>
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="muted">
                        {rehearsal.programId && preview.program
                          ? animationLabel(preview.program)
                          : preview.look
                            ? lookLayerSummary(show, preview.look)
                            : 'Geen Look geselecteerd'}
                      </p>
                      <p role="status">
                        {rehearsal.programId
                          ? 'Losse animatie actief: de groepsanimaties, timing en offsets van de Look worden niet gebruikt. Kies “Volg gekozen Look” om die te bekijken.'
                          : preview.custom
                            ? 'Vrije combinatie'
                            : `Volgt Look: ${preview.look?.name ?? 'geen'}`}
                      </p>
                      <button disabled={!preview.look} onClick={() => selectLook(preview.look!.id)}>
                        Volg gekozen Look
                      </button>
                      <details>
                        <summary>Wat zie je in de preview?</summary>
                        <p>
                          De huidige animaties gebruiken de hoofd- en accentkleur. Varytec-frontspots blijven warmwit.
                          Elke Look bevat het lichtgedrag per groep; groepsniveaus hieronder gelden alleen voor deze
                          repetitie.
                        </p>
                      </details>
                    </section>
                  )}
                  {rehearsing && (
                    <section>
                      <p className="section-label">SHOWBEDIENING</p>
                      <div className="state-grid">
                        <button
                          aria-pressed={displayedState.mode === 'automation'}
                          className={displayedState.mode === 'automation' ? 'active' : ''}
                          onClick={() => setMode('automation')}
                        >
                          Show afspelen
                        </button>
                        <button
                          aria-pressed={displayedState.mode === 'static'}
                          className={displayedState.mode === 'static' ? 'active' : ''}
                          onClick={() => setMode('static')}
                        >
                          Beeld vasthouden
                        </button>
                        <button
                          aria-pressed={displayedState.mode === 'safety'}
                          className={displayedState.mode === 'safety' ? 'active' : ''}
                          onClick={() => setMode('safety')}
                        >
                          {safetyLabel(show)}
                        </button>
                        <button
                          aria-pressed={displayedState.mode === 'blackout'}
                          className="blackout"
                          onClick={() => setMode('blackout')}
                        >
                          Blackout
                        </button>
                      </div>
                    </section>
                  )}
                  {!rehearsing && (
                    <>
                      <div className="controller-switch" role="group" aria-label="Schermbediening">
                        <button aria-pressed={liveController === 'looks'} onClick={() => setLiveController('looks')}>
                          Looks
                        </button>
                        <button aria-pressed={liveController === 'wing'} onClick={() => setLiveController('wing')}>
                          WING-banken
                        </button>
                      </div>
                      <div hidden={liveController !== 'wing'}>
                        <LiveControlSurface
                          show={show}
                          state={state}
                          modified={Object.keys(liveControls.overrides).length > 0}
                          linkedGroups={show.groups
                            .filter((group) => linkedGroupIds(show, liveControls, group.id).length > 1)
                            .map((group) => group.id)}
                          onLook={triggerLiveLook}
                          onMode={setMode}
                          onColor={(id) => setState((current) => ({ ...current, colorLockId: id }))}
                          onIntensity={setGroupIntensity}
                          onConfigure={() => setWorkspace('control')}
                        />
                      </div>
                    </>
                  )}
                  {!rehearsing && (
                    <details className="live-group-panel">
                      <summary>
                        Groepen apart bedienen / koppelen
                        {Object.keys(liveControls.overrides).length > 0
                          ? ` · ${Object.keys(liveControls.overrides).length} aangepast`
                          : ''}
                      </summary>
                      <LiveGroupControls show={show} state={state} controls={liveControls} onChange={setLiveControls} />
                    </details>
                  )}
                  {!rehearsing ? (
                    <div hidden={liveController !== 'looks'}>
                      <LiveLookLibrary
                        show={show}
                        activeLookId={
                          state.mode === 'automation' &&
                          !state.colorLockId &&
                          !Object.keys(liveControls.overrides).length
                            ? state.activeLookId
                            : undefined
                        }
                        currentLookId={state.activeLookId}
                        armedLookId={armedLookId}
                        mode={state.mode}
                        onArm={setArmedLookId}
                        onSelect={triggerLiveLook}
                      />
                    </div>
                  ) : (
                    <section>
                      <p className="section-label">LOOKS</p>
                      <div className="look-list">
                        {show.looks.map((look) => (
                          <button
                            key={look.id}
                            className={
                              look.id === activeLook?.id && displayedState.mode === 'automation' && !preview.custom
                                ? 'look active'
                                : 'look'
                            }
                            onClick={() => selectLook(look.id)}
                          >
                            <span>{look.name}</span>
                            <small>{lookLayerSummary(show, look)}</small>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                  <details className="live-master-disclosure" open={rehearsing}>
                    <summary>
                      Groepsmasters <span>{rehearsing ? 'Alleen preview' : 'Bewaard in show'}</span>
                    </summary>
                    <section>
                      <p className="section-label">
                        GROEPSMASTERS <span>{rehearsing ? 'Alleen preview' : 'Bewaard in show'}</span>
                      </p>
                      {!rehearsing && (
                        <p className="muted">
                          Vermenigvuldigen het Lookniveau. Gelinkte groepen volgen dezelfde masterwijziging.
                        </p>
                      )}
                      {displayedShow.groups.map((group) => (
                        <label className="master" key={group.id}>
                          <span>
                            {group.name}
                            {!rehearsing && linkedGroupIds(show, liveControls, group.id).length > 1 && ' · gelinkt'}
                          </span>
                          <output>{Math.round(group.intensity * 100)}%</output>
                          <input
                            aria-label={`${group.name} intensity`}
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={group.intensity}
                            onChange={(event) => setGroupIntensity(group.id, Number(event.target.value))}
                          />
                        </label>
                      ))}
                      {rehearsing && (
                        <button
                          onClick={() => setRehearsal((current) => ({ ...current, groupIntensities: undefined }))}
                        >
                          Herstel groepsniveaus
                        </button>
                      )}
                    </section>
                  </details>
                </aside>
              </section>
            </>
          )}
        </div>

        {['stage', 'patch', 'control', 'audio'].includes(workspace) && (
          <div className="step-heading">
            <button onClick={() => setWorkspace('design')}>Verder naar ontwerpen →</button>
          </div>
        )}
        {workspace === 'audition' && (
          <div className="step-heading">
            <button
              onClick={() => {
                setDesignSection('looks')
                setWorkspace('design')
              }}
            >
              Terug naar Looks →
            </button>
          </div>
        )}
        {workspace === 'start' && errors.length > 0 && (
          <p className="app-notice" role="status">
            {errors.length} configuratiefouten verdienen aandacht.{' '}
            <button onClick={() => setWorkspace('patch')}>Bekijk patch</button>
          </p>
        )}
      </main>
      {packageBusy && (
        <div className="package-busy" role="status">
          Herstelkopie bewaren en show openen…
        </div>
      )}
      <LiveShortcutHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  )
}
