import { useEffect, useRef, useState } from 'react'
import type { ShowDocument } from './domain'
import { createShowPackage, type ShowPackage, type ShowVersion } from './show-package'
import {
  createShowLibrary,
  libraryLimits,
  recoveryEntryId,
  type LibraryListing,
  type ShowLibraryStore,
} from './show-library'
import './ShowLibrary.css'

interface Props {
  show: ShowDocument
  versions: ShowVersion[]
  onClose: () => void
  onOpen: (bundle: ShowPackage) => boolean | Promise<boolean>
  onRestoreVersion: (id: string) => boolean | Promise<boolean>
  onDeleteVersion: (id: string) => boolean | Promise<boolean>
  store?: ShowLibraryStore
}
export function ShowLibrary({ show, versions, onClose, onOpen, onRestoreVersion, onDeleteVersion, store }: Props) {
  const library = useRef(store ?? createShowLibrary())
  const dialog = useRef<HTMLDialogElement>(null),
    alive = useRef(false)
  const operation = useRef(false)
  const [tab, setTab] = useState<'shows' | 'versions'>('shows')
  const [listing, setListing] = useState<LibraryListing>({ entries: [], damagedCount: 0 })
  const [name, setName] = useState(show.name.slice(0, 120))
  const [rename, setRename] = useState<{ id: string; name: string }>()
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  async function refresh() {
    const entries = await library.current.list()
    if (alive.current) setListing(entries)
  }
  useEffect(() => {
    alive.current = true
    const modal = dialog.current,
      previousFocus = document.activeElement
    modal?.showModal()
    void refresh()
      .catch((error) => {
        if (alive.current) setError(error instanceof Error ? error.message : 'Bibliotheek laden mislukt.')
      })
      .finally(() => {
        if (alive.current) setBusy(false)
      })
    return () => {
      alive.current = false
      modal?.close()
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])
  async function run(action: () => Promise<void>) {
    if (busy || operation.current || !alive.current) return
    operation.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (error) {
      if (alive.current)
        setError(error instanceof Error ? error.message : 'Actie mislukt. Je actieve show is niet gewijzigd.')
    } finally {
      operation.current = false
      if (alive.current) setBusy(false)
    }
  }
  function exportBundle(bundle: ShowPackage, name: string) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'show'}.lightflow.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  return (
    <dialog
      className="show-library-dialog"
      ref={dialog}
      aria-labelledby="show-library-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="show-library-content">
        <header>
          <div>
            <p className="section-label">LOKAAL SHOWBEHEER</p>
            <h2 id="show-library-title">Showbibliotheek</h2>
          </div>
          <button disabled={busy} onClick={onClose} aria-label="Showbibliotheek sluiten">
            Sluiten
          </button>
        </header>
        <p>
          Je actieve werk blijft automatisch in de editor bewaard. Bibliotheekshows zijn aparte snapshots die je hier
          bewust bewaart of bijwerkt. Exporteer voor een back-up buiten deze browser.
        </p>
        <nav aria-label="Bibliotheekonderdelen">
          <button disabled={busy} aria-pressed={tab === 'shows'} onClick={() => setTab('shows')}>
            Shows · {listing.entries.length}/{libraryLimits.shows}
          </button>
          <button disabled={busy} aria-pressed={tab === 'versions'} onClick={() => setTab('versions')}>
            Versies van huidige show · {versions.length}/100
          </button>
        </nav>
        {busy && <p role="status">Bezig met lokale opslag…</p>}
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {tab === 'shows' ? (
          <>
            <form
              className="library-save"
              onSubmit={(event) => {
                event.preventDefault()
                void run(async () => {
                  await library.current.save(name, createShowPackage(show, versions))
                  await refresh()
                  if (alive.current) setNotice('Nieuwe bibliotheekshow bewaard. Je actieve editor is niet vervangen.')
                })
              }}
            >
              <label>
                Naam voor deze snapshot
                <input maxLength={120} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} />
              </label>
              <button
                disabled={busy || !name.trim() || listing.entries.length + listing.damagedCount >= libraryLimits.shows}
              >
                Bewaar als nieuwe show
              </button>
            </form>
            {listing.damagedCount > 0 && (
              <p role="status">
                {listing.damagedCount} beschadigde of ongeldige bibliotheekvermelding(en) overgeslagen. Andere shows
                blijven beschikbaar; je actieve editor is niet gewijzigd.
              </p>
            )}
            {listing.damagedIds?.map((id) => (
              <button
                key={id}
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      'Deze beschadigde vermelding definitief verwijderen? Het opgeslagen pakket wordt ook verwijderd; de actieve editor blijft behouden.',
                    )
                  )
                    void run(async () => {
                      await library.current.remove(id)
                      await refresh()
                    })
                }}
              >
                Beschadigde vermelding verwijderen · {id}
              </button>
            ))}
            {listing.recovery && (
              <p>
                De herstelplaats hieronder bewaart je vorige editorstand buiten de 32 showplaatsen. Bij de volgende
                showwissel of herstelactie wordt alleen deze herstelplaats vervangen. Exporteer haar eerst en gebruik
                daarna ‘Show openen’ in het Showmenu om het bestand te herstellen. Zo blijft je herstelbestand behouden
                als de browseropslag mislukt.
              </p>
            )}
            {!listing.entries.length && !busy && <p>Nog geen bibliotheekshows. Bewaar hierboven je eerste snapshot.</p>}
            <div className="library-list">
              {[...(listing.recovery ? [listing.recovery] : []), ...listing.entries].map((entry) => (
                <article key={entry.id}>
                  <div className="library-row">
                    <div>
                      <h3>
                        {entry.id === recoveryEntryId ? 'Herstelplaats · ' : ''}
                        {entry.name}
                      </h3>
                      <small>
                        {new Date(entry.updatedAt).toLocaleString('nl-BE')} · {entry.versionCount} versies ·{' '}
                        {(entry.byteLength / 1_000_000).toFixed(1)} MB
                      </small>
                    </div>
                    {entry.id !== recoveryEntryId && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const bundle = await library.current.load(entry.id)
                            if (!alive.current) return
                            if (await onOpen(bundle)) {
                              if (alive.current) onClose()
                            } else if (alive.current) setNotice('Show niet geopend. Je huidige editor blijft behouden.')
                          })
                        }
                      >
                        Openen
                      </button>
                    )}
                  </div>
                  <details>
                    <summary>Meer opties voor {entry.name}</summary>
                    <div className="library-row-actions">
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const bundle = await library.current.load(entry.id)
                            if (alive.current) {
                              exportBundle(bundle, entry.name)
                              setNotice('Bibliotheekshow geëxporteerd.')
                            }
                          })
                        }
                      >
                        Exporteren
                      </button>
                      {entry.id !== recoveryEntryId && (
                        <>
                          <button disabled={busy} onClick={() => setRename({ id: entry.id, name: entry.name })}>
                            Hernoemen
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Bibliotheekshow “${entry.name}” vervangen door de huidige editor inclusief versies? Exporteer eerst als je de oude snapshot wilt bewaren.`,
                                )
                              )
                                return
                              void run(async () => {
                                await library.current.save(entry.name, createShowPackage(show, versions), entry.id)
                                await refresh()
                                if (alive.current)
                                  setNotice('Bibliotheekshow bijgewerkt. De actieve editor is ongewijzigd.')
                              })
                            }}
                          >
                            Bijwerken vanuit editor
                          </button>
                        </>
                      )}
                      <button
                        disabled={busy}
                        className="library-danger"
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Bibliotheekshow “${entry.name}” met alle bijbehorende versies definitief verwijderen? Exporteer eerst voor een back-up. De actieve editor wordt niet verwijderd.`,
                            )
                          )
                            return
                          void run(async () => {
                            await library.current.remove(entry.id)
                            await refresh()
                            if (alive.current)
                              setNotice(
                                'Bibliotheekshow en haar versies verwijderd. Herstel kan alleen uit een export of aparte snapshot.',
                              )
                          })
                        }}
                      >
                        Verwijderen
                      </button>
                    </div>
                    {rename?.id === entry.id && (
                      <form
                        className="library-save"
                        onSubmit={(event) => {
                          event.preventDefault()
                          void run(async () => {
                            await library.current.rename(entry.id, rename.name)
                            await refresh()
                            if (alive.current) {
                              setRename(undefined)
                              setNotice('Bibliotheekshow hernoemd. Historische versies blijven intact.')
                            }
                          })
                        }}
                      >
                        <label>
                          Nieuwe naam
                          <input
                            maxLength={120}
                            value={rename.name}
                            disabled={busy}
                            onChange={(event) => setRename({ id: entry.id, name: event.target.value })}
                          />
                        </label>
                        <button disabled={busy || !rename.name.trim()}>Naam bewaren</button>
                        <button disabled={busy} type="button" onClick={() => setRename(undefined)}>
                          Annuleren
                        </button>
                      </form>
                    )}
                  </details>
                </article>
              ))}
            </div>
            <button disabled={busy} onClick={() => void run(refresh)}>
              Bibliotheek vernieuwen
            </button>
          </>
        ) : (
          <>
            <p>
              Versies horen bij de actieve show “{show.name}”. Bij herstellen wordt je huidige show eerst als
              herstelversie bewaard. Exporteer voordat je versies definitief verwijdert.
            </p>
            {!versions.length && (
              <p>Nog geen versies. Gebruik ‘Versie bewaren’ in het Showmenu om een momentopname te maken.</p>
            )}
            <div className="library-list">
              {versions.map((version) => (
                <article key={version.id}>
                  <div className="library-row">
                    <div>
                      <h3>{version.note || 'Naamloze versie'}</h3>
                      <small>
                        {new Date(version.createdAt).toLocaleString('nl-BE')} · {version.show.name}
                      </small>
                    </div>
                    <div className="library-row-actions">
                      <button
                        disabled={busy || versions.length >= 100}
                        onClick={() =>
                          void run(async () => {
                            if (await onRestoreVersion(version.id)) {
                              if (alive.current)
                                setNotice('Versie hersteld; de vorige editorstand is als herstelversie bewaard.')
                            } else if (alive.current)
                              setNotice('Versie niet hersteld. Controleer de opslagmelding in de editor.')
                          })
                        }
                      >
                        Herstellen
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (
                            !window.confirm(
                              'Deze versie definitief verwijderen? Exporteer eerst als je haar wilt bewaren.',
                            )
                          )
                            return
                          void run(async () => {
                            if (await onDeleteVersion(version.id)) {
                              if (alive.current)
                                setNotice(
                                  'Versie verwijderd. Herstel kan alleen uit een eerdere export of bibliotheekshow.',
                                )
                            } else if (alive.current)
                              setNotice('Versie niet verwijderd. Controleer de opslagmelding in de editor.')
                          })
                        }}
                      >
                        Verwijderen
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {versions.length >= 100 && (
              <p>Voor herstellen is één vrije versieplaats nodig. Exporteer en verwijder eerst een oude versie.</p>
            )}
          </>
        )}
      </div>
    </dialog>
  )
}
