import { useEffect, useRef, useState, type RefObject } from 'react'
import type { AudioLiveSource } from './audio-live'
import { RuntimeAudioLink } from './runtime-audio-client'

export function RuntimeAudioPanel({ sessionId, sourceRef, running }: {
  sessionId: string; sourceRef: RefObject<AudioLiveSource | null>; running: boolean
}) {
  const link = useRef<RuntimeAudioLink | null>(null), mounted = useRef(false)
  const [connected, setConnected] = useState(false), [pending, setPending] = useState(false)
  const [available, setAvailable] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    const current = new RuntimeAudioLink(sessionId)
    link.current = current; mounted.current = true; setConnected(false); setPending(false); setError('')
    const timer = setInterval(() => {
      const source = sourceRef.current?.read()
      setAvailable(!!source)
      if (!running) { if (current.connected) { void current.disconnect(); setConnected(false) }; return }
      void current.sync(source).catch(() => {
        if (mounted.current && link.current === current) {
          setConnected(false); setError('Audiokoppeling onderbroken. De runtime schakelt bij verlies van de audioklok de uitvoer uit. Controleer de uitvoerstatus; koppel en bevestig daarna opnieuw.')
        }
      })
    }, 100)
    return () => { mounted.current = false; clearInterval(timer); void current.disconnect(); if (link.current === current) link.current = null }
  }, [sessionId, running, sourceRef])
  async function connect() {
    const source = sourceRef.current?.read(), current = link.current
    if (!source || !current || pending || !running) return
    setPending(true); setError('')
    try { await current.connect(source); if (mounted.current && link.current === current) setConnected(true) }
    catch (cause) { if (mounted.current && link.current === current) setError(cause instanceof Error ? cause.message : 'Audio koppelen mislukt.') }
    finally { if (mounted.current && link.current === current) setPending(false) }
  }
  return <section className="runtime-output" aria-label="Audio naar fysieke lichtuitvoer">
    <h3>WAV → runtime → DMX</h3>
    <p role="status">{connected ? 'Audioklok gekoppeld · runtime berekent de lichtwaarden' : pending ? 'Audiokoppeling wordt opgebouwd…' : 'WAV nog niet aan de runtime gekoppeld'}</p>
    <p>Laad een WAV bij Setup → Audio. Schakel eerst fysieke uitvoer uit, koppel hier de audio en bevestig daarna de sACN-/Art-Net-uitvoer. De runtime gebruikt zijn geladen showsnapshot en Live-bediening, niet de Look uit de browserproef.</p>
    <p>De audio blijft in de browser; alleen kickdetecties, instellingen en afspeelpositie gaan naar je lokale runtime. Bij sluiten, verlaten of verlies van de audioklok: blackout en uitvoer uit. Geen automatisch hervatten.</p>
    {!available && <small>Laad en analyseer een WAV bij Setup → Audio. Maak deze in de compacte audiospeler onderaan Live beschikbaar via Audio volgen & instellingen.</small>}
    {error && <p role="alert">{error}</p>}
    <div className="runtime-output-actions"><button disabled={!available || !running || pending || connected} onClick={() => void connect()}>Koppel WAV aan runtime</button>
      <button className="lab-danger" disabled={!connected && !pending} onClick={() => { void link.current?.disconnect(); setConnected(false); setPending(false) }}>Ontkoppel audio & schakel uitvoer uit</button></div>
    <small>Houd dit scherm actief. Browsers kunnen achtergrondtabs vertragen; de runtime schakelt dan uit. Native Dante/audio-ingang en nauwkeurige latencykalibratie zijn nog niet aangesloten.</small>
  </section>
}
