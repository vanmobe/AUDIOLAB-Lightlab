import { useState } from 'react'
import type { RuntimeMode, ShowDocument } from './domain'
import { lookLayerSummary } from './LookEditor'

export function LiveLookLibrary({
  show,
  activeLookId,
  currentLookId,
  armedLookId,
  mode = 'automation',
  onSelect,
  onArm,
  disabled = false,
}: {
  show: ShowDocument
  activeLookId?: string
  currentLookId?: string
  armedLookId?: string
  mode?: RuntimeMode
  onSelect: (id: string) => void
  onArm?: (id?: string) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const looks = show.looks.filter((look) => look.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const activeLook = show.looks.find((look) => look.id === (currentLookId ?? activeLookId))
  const activeIndex = show.looks.findIndex((look) => look.id === (currentLookId ?? activeLookId))
  const nextLook =
    show.looks.length > 1 ? show.looks[(activeIndex + 1 + show.looks.length) % show.looks.length] : undefined
  const armedLook = show.looks.find((look) => look.id === armedLookId)
  const readyLook = armedLook ?? nextLook
  const currentLabel =
    mode === 'automation'
      ? 'NU ACTIEF'
      : mode === 'static'
        ? 'BEELD VAST OP'
        : mode === 'safety'
          ? 'LAATSTE LOOK · VEILIGHEID'
          : 'LAATSTE LOOK · BLACKOUT'
  const startLabel =
    mode === 'blackout'
      ? 'Start en hef blackout op: '
      : mode === 'safety'
        ? 'Start en verlaat veiligheidsmodus: '
        : armedLook
          ? 'Start klaar: '
          : 'Start volgende: '
  return (
    <section className="live-look-library" aria-label="Live Looks">
      <p className="section-label">
        LOOKS <span>{show.looks.length}</span>
      </p>
      {activeLook && (
        <div className="live-current-look" role="status">
          <div>
            <span>{currentLabel}</span>
            <strong>{activeLook.name}</strong>
          </div>
          {readyLook && (
            <button disabled={disabled} onClick={() => onSelect(readyLook.id)}>
              {startLabel}
              {readyLook.name}
            </button>
          )}
        </div>
      )}
      {onArm && show.looks.length > 1 && (
        <label className="live-arm-picker">
          Zet volgende Look klaar
          <select
            aria-label="Volgende Look klaarzetten"
            disabled={disabled}
            value={armedLookId ?? ''}
            onChange={(event) => onArm(event.target.value || undefined)}
          >
            <option value="">Volg bibliotheekvolgorde</option>
            {show.looks
              .filter((look) => look.id !== currentLookId)
              .map((look) => (
                <option key={look.id} value={look.id}>
                  {look.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {(show.looks.length > 6 || query) && (
        <label className="live-look-search">
          <span className="sr-only">Zoek een Look</span>
          <input
            type="search"
            placeholder="Zoek een Look…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      )}
      <div className="look-list">
        {looks.map((look) => {
          const color = show.colorProfiles.find((profile) => profile.id === look.colorProfileId)
          return (
            <button
              key={look.id}
              disabled={disabled}
              className={`look${look.id === activeLookId ? ' active' : ''}`}
              aria-pressed={look.id === activeLookId}
              onClick={() => onSelect(look.id)}
            >
              <span className="live-look-colors" aria-hidden="true">
                <i style={{ background: color?.primary ?? '#8896aa' }} />
                <i style={{ background: color?.accent ?? '#8896aa' }} />
              </span>
              <span>{look.name}</span>
            </button>
          )
        })}
      </div>
      {!looks.length && (
        <p className="muted">
          {show.looks.length
            ? 'Geen Looks gevonden. Pas je zoekopdracht aan.'
            : 'Maak je eerste Look in de ontwerpstudio.'}
        </p>
      )}
      {activeLook && (
        <details className="live-look-info">
          <summary>Opbouw van {activeLook.name}</summary>
          <p>{lookLayerSummary(show, activeLook)}</p>
        </details>
      )}
      <p className="muted">Een Look start de show en wist live groepsafwijkingen. Koppelingen blijven behouden.</p>
    </section>
  )
}
