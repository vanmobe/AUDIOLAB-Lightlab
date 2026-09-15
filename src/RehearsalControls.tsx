import type { Dispatch, SetStateAction } from 'react'
import { safetyLabel } from './CoverageStatus'
import { type RuntimeMode, type RuntimeState, type ShowDocument, animationLabel } from './domain'
import { lookLayerSummary } from './LookEditor'
import { chooseRehearsalItem, followRehearsalLook, rehearsalPreview, type RehearsalState } from './rehearsal'

interface RehearsalControlsProps {
  show: ShowDocument
  rehearsal: RehearsalState
  preview: ReturnType<typeof rehearsalPreview>
  state: RuntimeState
  onRehearsalChange: Dispatch<SetStateAction<RehearsalState>>
  onMode: (mode: RuntimeMode) => void
}

/** Testlab preview controls only; they mutate ephemeral rehearsal state and never activate runtime output. */
export function RehearsalControls({
  show,
  rehearsal,
  preview,
  state,
  onRehearsalChange,
  onMode,
}: RehearsalControlsProps) {
  return (
    <>
      <section className="rehearsal-controls" aria-label="Vrij combineren">
        <p className="section-label">
          VRIJ COMBINEREN <span>Alleen preview</span>
        </p>
        <p className="muted">
          Een vrije animatie vervangt het patroon op alle lichtgroepen (niet de hazer). Een kleurwissel geldt alleen
          voor lagen die de Lookkleur volgen. Je opgeslagen Looks blijven ongewijzigd.
        </p>
        <label>
          Animatie <small>{show.programs.length} beschikbaar</small>
          <select
            aria-label="Animatie uitproberen"
            value={rehearsal.programId ?? ''}
            disabled={!show.programs.length}
            onChange={(event) =>
              onRehearsalChange((current) => chooseRehearsalItem(show, current, 'program', event.target.value))
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
              onRehearsalChange((current) => chooseRehearsalItem(show, current, 'profile', event.target.value))
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
        <button
          disabled={!preview.look}
          onClick={() => preview.look && onRehearsalChange((current) => followRehearsalLook(current, preview.look!.id))}
        >
          Volg gekozen Look
        </button>
        <details>
          <summary>Wat zie je in de preview?</summary>
          <p>
            De huidige animaties gebruiken de hoofd- en accentkleur. Varytec-frontspots blijven warmwit. Elke Look bevat
            het lichtgedrag per groep; groepsniveaus hieronder gelden alleen voor deze repetitie.
          </p>
        </details>
      </section>
      <section>
        <p className="section-label">SHOWBEDIENING</p>
        <div className="state-grid">
          <button
            aria-pressed={state.mode === 'automation'}
            className={state.mode === 'automation' ? 'active' : ''}
            onClick={() => onMode('automation')}
          >
            Show afspelen
          </button>
          <button
            aria-pressed={state.mode === 'static'}
            className={state.mode === 'static' ? 'active' : ''}
            onClick={() => onMode('static')}
          >
            Beeld vasthouden
          </button>
          <button
            aria-pressed={state.mode === 'safety'}
            className={state.mode === 'safety' ? 'active' : ''}
            onClick={() => onMode('safety')}
          >
            {safetyLabel(show)}
          </button>
          <button aria-pressed={state.mode === 'blackout'} className="blackout" onClick={() => onMode('blackout')}>
            Blackout
          </button>
        </div>
      </section>
      <section>
        <p className="section-label">LOOKS</p>
        <div className="look-list">
          {show.looks.map((look) => (
            <button
              key={look.id}
              className={
                look.id === preview.look?.id && state.mode === 'automation' && !preview.custom ? 'look active' : 'look'
              }
              onClick={() => onRehearsalChange((current) => followRehearsalLook(current, look.id))}
            >
              <span>{look.name}</span>
              <small>{lookLayerSummary(show, look)}</small>
            </button>
          ))}
        </div>
      </section>
      <details className="live-master-disclosure" open>
        <summary>
          Groepsmasters <span>Alleen preview</span>
        </summary>
        <section>
          <p className="section-label">
            GROEPSMASTERS <span>Alleen preview</span>
          </p>
          {preview.show.groups.map((group) => (
            <label className="master" key={group.id}>
              <span>{group.name}</span>
              <output>{Math.round(group.intensity * 100)}%</output>
              <input
                aria-label={`${group.name} intensity`}
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={group.intensity}
                onChange={(event) =>
                  onRehearsalChange((current) => ({
                    ...current,
                    groupIntensities: { ...current.groupIntensities, [group.id]: Number(event.target.value) },
                  }))
                }
              />
            </label>
          ))}
          <button onClick={() => onRehearsalChange((current) => ({ ...current, groupIntensities: undefined }))}>
            Herstel groepsniveaus
          </button>
        </section>
      </details>
    </>
  )
}
