import { useEffect, useRef, useState } from 'react'
import type { ShowDocument } from './domain'
import type { LiveControls } from './live-controls'
import {
  commandPlayback,
  getPlaybackStatus,
  preparePlaybackSnapshot,
  startPlayback,
  type PlaybackCommand,
  type PlaybackStatus,
} from './playback-client'
import {
  assertRuntimePreviewOrder,
  getRuntimePreview,
  getRuntimeShow,
  setRuntimeLive,
  type RuntimeLivePreview,
} from './runtime-live-client'

/** Connected Live consumes server frames only. Unmount disconnects this viewer, never the runtime. */
export function useRuntimeLive() {
  const [show, setShow] = useState<ShowDocument>()
  const [preview, setPreview] = useState<RuntimeLivePreview>()
  const [status, setStatus] = useState<PlaybackStatus>()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [connected, setConnected] = useState(false)
  const alive = useRef(false),
    epoch = useRef(0),
    busy = useRef(false)
  const operation = useRef<AbortController | null>(null),
    poll = useRef<AbortController | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const current = useRef<{ show?: ShowDocument; preview?: RuntimeLivePreview; status?: PlaybackStatus }>({})
  const statusReadFailed = useRef(false)

  function clearFrame() {
    current.current.preview = undefined
    setPreview(undefined)
    setConnected(false)
  }
  function pause() {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    poll.current?.abort()
    poll.current = null
  }
  function begin(clearError = true) {
    pause()
    operation.current?.abort()
    epoch.current++
    const controller = new AbortController()
    operation.current = controller
    busy.current = true
    setPending(true)
    if (clearError) setError('')
    return { controller, token: epoch.current }
  }
  function valid(token: number, controller: AbortController) {
    return alive.current && epoch.current === token && !controller.signal.aborted
  }
  function fail(cause: unknown) {
    pause()
    clearFrame()
    setError(cause instanceof Error ? cause.message : 'Runtimeverbinding verbroken. Verbind opnieuw.')
  }
  function publish(next: RuntimeLivePreview, snapshot: ShowDocument) {
    const previous = current.current.preview
    assertRuntimePreviewOrder(previous, next)
    current.current = { show: snapshot, preview: next, status: next.status }
    setShow(snapshot)
    setPreview(next)
    setStatus(next.status)
    setConnected(true)
  }
  function schedule(token: number, sessionId: string, snapshot: ShowDocument) {
    // Delay after completion: never overlap reads or build up a queue of outdated frames.
    timer.current = setTimeout(async () => {
      timer.current = null
      if (!alive.current || epoch.current !== token) return
      const controller = new AbortController()
      poll.current = controller
      try {
        const next = await getRuntimePreview(sessionId, snapshot, controller.signal)
        if (!valid(token, controller)) return
        publish(next, snapshot)
        schedule(token, sessionId, snapshot)
      } catch (cause) {
        if (valid(token, controller)) fail(cause)
      } finally {
        if (poll.current === controller) poll.current = null
      }
    }, 50)
  }
  function finish(token: number, controller: AbortController) {
    if (valid(token, controller)) {
      operation.current = null
      busy.current = false
      setPending(false)
    }
  }
  useEffect(() => {
    alive.current = true
    const controller = new AbortController(),
      token = epoch.current
    operation.current = controller
    void getPlaybackStatus(controller.signal)
      .then((next) => {
        if (valid(token, controller)) {
          current.current.status = next
          setStatus(next)
        }
      })
      .catch((cause) => {
        if (valid(token, controller)) {
          statusReadFailed.current = true
          fail(cause)
        }
      })
      .finally(() => {
        if (operation.current === controller) operation.current = null
      })
    return () => {
      alive.current = false
      epoch.current++
      pause()
      operation.current?.abort()
    }
  }, [])

  async function attach() {
    if (busy.current) return
    const { controller, token } = begin()
    clearFrame()
    try {
      const next = await getPlaybackStatus(controller.signal)
      if (!valid(token, controller)) return
      current.current.status = next
      setStatus(next)
      if (next.status !== 'running' || !next.sessionId)
        throw new Error('Er is geen actieve runtimesessie om mee te verbinden. Start bewust een showsnapshot.')
      const snapshot = await getRuntimeShow(next.sessionId, controller.signal)
      if (!valid(token, controller)) return
      const frame = await getRuntimePreview(next.sessionId, snapshot, controller.signal)
      if (!valid(token, controller)) return
      publish(frame, snapshot)
      schedule(token, next.sessionId, snapshot)
    } catch (cause) {
      if (valid(token, controller)) fail(cause)
    } finally {
      finish(token, controller)
    }
  }
  async function refreshStatus() {
    if (busy.current || connected) return
    const { controller, token } = begin(false)
    try {
      const next = await getPlaybackStatus(controller.signal)
      if (valid(token, controller)) {
        current.current.status = next
        setStatus(next)
        // Background discovery must not erase a failed user command's explanation.
        if (statusReadFailed.current) {
          setError('')
          statusReadFailed.current = false
        }
      }
    } catch (cause) {
      if (valid(token, controller)) {
        statusReadFailed.current = true
        current.current.status = undefined
        setStatus(undefined)
        fail(cause)
      }
    } finally {
      finish(token, controller)
    }
  }
  async function start(snapshot: ShowDocument, bpm: number) {
    if (busy.current) return
    const { controller, token } = begin()
    clearFrame()
    try {
      const next = await startPlayback(snapshot, snapshot.activeLookId, bpm, controller.signal)
      if (!valid(token, controller)) return
      current.current.status = next
      setStatus(next)
      if (next.status !== 'running' || !next.sessionId)
        throw new Error('De runtime is niet gestart. Haal de status opnieuw op.')
      // Use the server snapshot, not a browser object that may differ after validation/loading.
      const loaded = await getRuntimeShow(next.sessionId, controller.signal)
      if (!valid(token, controller)) return
      const frame = await getRuntimePreview(next.sessionId, loaded, controller.signal)
      if (!valid(token, controller)) return
      publish(frame, loaded)
      schedule(token, next.sessionId, loaded)
    } catch (cause) {
      if (valid(token, controller)) fail(cause)
    } finally {
      finish(token, controller)
    }
  }
  async function stop() {
    const sessionId = current.current.status?.sessionId
    // Stop supersedes an outstanding UI command; late replies cannot reconnect the viewer.
    const { controller, token } = begin()
    clearFrame()
    try {
      if (!sessionId) return
      const next = await commandPlayback(sessionId, { command: 'stop' }, controller.signal)
      if (valid(token, controller)) {
        current.current.status = next
        setStatus(next)
      }
    } catch (cause) {
      if (valid(token, controller)) fail(cause)
    } finally {
      finish(token, controller)
    }
  }
  async function loadEditorShow(snapshot: ShowDocument, bpm: number) {
    if (busy.current) return
    let replacement: ShowDocument
    try {
      replacement = preparePlaybackSnapshot(snapshot, bpm)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'De editorshow is ongeldig. De runtimeshow is niet gestopt.')
      return
    }
    const expectedSession = status?.sessionId ?? null
    if ((current.current.status?.sessionId ?? null) !== expectedSession) {
      setError('De runtimesessie is intussen veranderd. Controleer de status en laad de editorshow opnieuw.')
      return
    }
    const { controller, token } = begin()
    let oldStopped = false,
      startRequested = false,
      newStarted = false,
      mutationDispatched = false
    try {
      const latest = await getPlaybackStatus(controller.signal)
      if (!valid(token, controller)) return
      if (latest.sessionId !== expectedSession)
        throw new Error('De runtimesessie is intussen veranderd. Geen show is vervangen; controleer de actuele status.')
      if (latest.status === 'starting')
        throw new Error('De runtimeshow wordt nog gestart. Wacht op de status voordat je deze vervangt.')
      if (latest.status === 'running') {
        if (!expectedSession) throw new Error('De actieve runtimesessie is onbekend. Controleer de status.')
        // Clearing the rendered frame disconnects WAV. Do that only once the
        // preflight has passed and the user's deliberate replacement is sent.
        mutationDispatched = true
        clearFrame()
        const stopped = await commandPlayback(expectedSession, { command: 'stop' }, controller.signal)
        if (!valid(token, controller)) return
        if (stopped.sessionId !== expectedSession || stopped.status !== 'stopped')
          throw new Error(
            'Stoppen van de oude show is niet bevestigd. Er is geen nieuwe show gestart; controleer de status.',
          )
        oldStopped = true
        current.current.status = stopped
        setStatus(stopped)
      }
      if (!valid(token, controller)) return
      if (!mutationDispatched) {
        mutationDispatched = true
        clearFrame()
      }
      startRequested = true
      const next = await startPlayback(replacement, replacement.activeLookId, bpm, controller.signal)
      if (!valid(token, controller)) return
      current.current.status = next
      setStatus(next)
      if (next.status !== 'running' || !next.sessionId) throw new Error('De nieuwe show is niet als actief bevestigd.')
      newStarted = true
      const loaded = await getRuntimeShow(next.sessionId, controller.signal)
      if (!valid(token, controller)) return
      const frame = await getRuntimePreview(next.sessionId, loaded, controller.signal)
      if (!valid(token, controller)) return
      publish(frame, loaded)
      schedule(token, next.sessionId, loaded)
    } catch (cause) {
      if (valid(token, controller)) {
        const detail = cause instanceof Error ? cause.message : 'Controleer de runtimeverbinding.'
        const context = newStarted
          ? 'De nieuwe show is gestart, maar het runtimebeeld kon niet worden geladen. Verbind opnieuw. '
          : startRequested
            ? `${oldStopped ? 'De oude show is gestopt. ' : ''}Het laden van de nieuwe show is niet bevestigd; de startaanvraag kan ontvangen zijn. Controleer de status voordat je opnieuw laadt. `
            : oldStopped
              ? 'De oude show is gestopt; de nieuwe show is niet geladen. '
              : ''
        if (mutationDispatched) fail(new Error(context + detail))
        else {
          // An unverified/changed session cannot safely resume the old poll.
          // Keep its last rendered frame and WAV attachment until explicit
          // reconnect or replacement; discovery failure must not detach audio.
          setError(detail + ' Het vorige runtimebeeld blijft zichtbaar; de actuele status is niet bevestigd.')
        }
      }
    } finally {
      finish(token, controller)
    }
  }
  async function mutate(
    send: (frame: RuntimeLivePreview, snapshot: ShowDocument, signal: AbortSignal) => Promise<PlaybackStatus>,
  ) {
    const frame = current.current.preview,
      snapshot = current.current.show
    if (busy.current || !frame || !snapshot) return
    const { controller, token } = begin()
    try {
      await send(frame, snapshot, controller.signal)
      if (!valid(token, controller)) return
      const next = await getRuntimePreview(frame.sessionId, snapshot, controller.signal)
      if (!valid(token, controller)) return
      publish(next, snapshot)
      schedule(token, frame.sessionId, snapshot)
    } catch (cause) {
      if (valid(token, controller)) fail(cause)
    } finally {
      finish(token, controller)
    }
  }
  const command = async (value: PlaybackCommand) =>
    value.command === 'stop'
      ? stop()
      : mutate((frame, _show, signal) => commandPlayback(frame.sessionId, value, signal))
  const setLive = async (
    controls: LiveControls,
    groupIntensities: Record<string, number>,
    colorLockId: string | null,
  ) => {
    if (busy.current) return
    // Controls originate from this render. Never pair them with a newer poll's revision.
    if (
      !preview ||
      preview.sessionId !== current.current.preview?.sessionId ||
      preview.revision !== current.current.preview?.revision
    ) {
      fail(new Error('De live-instellingen zijn intussen veranderd. Verbind opnieuw voordat je ze aanpast.'))
      return
    }
    return mutate((_frame, snapshot, signal) =>
      setRuntimeLive(
        preview.sessionId,
        preview.revision,
        { controls, groupIntensities, colorLockId },
        snapshot,
        signal,
      ),
    )
  }
  return {
    show,
    preview,
    status,
    error,
    pending,
    connected,
    start,
    loadEditorShow,
    attach,
    stop,
    command,
    setLive,
    refreshStatus,
  }
}
