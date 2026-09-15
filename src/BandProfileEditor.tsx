import { useState } from 'react'
import { bandDesignLimits, bandProfileSummary, defaultBandProfile, type BandProfile } from './band-profile'
import './BandProfileEditor.css'

export function BandProfileEditor({
  value,
  onChange,
  disabled = false,
  initiallyExpanded,
}: {
  value?: BandProfile
  onChange: (profile: BandProfile | undefined) => void
  disabled?: boolean
  initiallyExpanded?: boolean
}) {
  const profile = value ?? defaultBandProfile
  const limits = bandDesignLimits(profile)
  const [expanded, setExpanded] = useState(initiallyExpanded ?? value === undefined)
  const [newColor, setNewColor] = useState('#2f7cff')
  const update = (change: Partial<BandProfile>) => {
    if (!disabled) onChange({ ...profile, ...change })
  }
  return (
    <details
      className="band-profile-editor"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>{bandProfileSummary(value)}</summary>
      <p>
        Vertel wie de band is. Dit profiel stuurt toekomstige AI-voorstellen; bestaande Looks, animaties en kleuren
        veranderen niet.
      </p>
      <fieldset disabled={disabled}>
        <legend className="band-profile-legend">Identiteit van de band</legend>
        <div className="band-profile-identity">
          <label>
            Bandnaam
            <input
              aria-label="Bandnaam"
              value={profile.name}
              maxLength={120}
              placeholder="Naam van je band"
              onChange={(event) => update({ name: event.target.value })}
            />
          </label>
          <label>
            Genres / muziekstijl
            <input
              aria-label="Genres / muziekstijl"
              value={profile.genres}
              maxLength={240}
              placeholder="Bijvoorbeeld soul, indiepop, akoestisch"
              onChange={(event) => update({ genres: event.target.value })}
            />
          </label>
        </div>
        <label>
          Karakter van de show
          <textarea
            aria-label="Karakter van de show"
            value={profile.character}
            maxLength={1200}
            rows={3}
            placeholder="Wat moet het publiek voelen? Wat past juist niet bij jullie?"
            onChange={(event) => update({ character: event.target.value })}
          />
        </label>
        <details className="band-profile-preferences">
          <summary>Sfeer en beweging sturen</summary>
          <p>
            AI kiest laat ruimte voor interpretatie. Expliciete keuzes hieronder gaan voor op genres en een vrije
            ontwerpvraag.
          </p>
          <div className="band-profile-choices">
            <label>
              Kleurgevoel
              <select
                aria-label="Kleurgevoel"
                value={profile.colorMood}
                onChange={(event) => update({ colorMood: event.target.value as BandProfile['colorMood'] })}
              >
                <option value="auto">AI kiest</option>
                <option value="warm">Warm</option>
                <option value="cool">Koel</option>
                <option value="bold">Uitgesproken</option>
                <option value="restrained">Ingetogen</option>
              </select>
            </label>
            <label>
              Energie
              <select
                aria-label="Energie"
                value={profile.energy}
                onChange={(event) => update({ energy: event.target.value as BandProfile['energy'] })}
              >
                <option value="auto">AI kiest</option>
                <option value="calm">Rustig</option>
                <option value="balanced">Gebalanceerd</option>
                <option value="high">Energiek</option>
              </select>
            </label>
            <label>
              Complexiteit
              <select
                aria-label="Complexiteit"
                value={profile.complexity}
                onChange={(event) => update({ complexity: event.target.value as BandProfile['complexity'] })}
              >
                <option value="auto">AI kiest</option>
                <option value="simple">Eenvoudig</option>
                <option value="layered">Gelaagd</option>
                <option value="rich">Rijk opgebouwd</option>
              </select>
            </label>
            <label>
              Bewegingstempo
              <select
                aria-label="Bewegingstempo"
                value={profile.motion}
                onChange={(event) => update({ motion: event.target.value as BandProfile['motion'] })}
              >
                <option value="auto">AI kiest</option>
                <option value="slow">Langzaam</option>
                <option value="medium">Gemiddeld</option>
                <option value="fast">Snel</option>
              </select>
            </label>
          </div>
          {(profile.complexity !== 'auto' || profile.motion !== 'auto') && (
            <p className="band-profile-limits">
              {profile.complexity !== 'auto' && `Maximaal ${limits.maxSteps} stappen per nieuw patroon.`}{' '}
              {profile.motion !== 'auto' &&
                `Nieuwe Look-groepen: ${limits.minRateBeats}–${limits.maxRateBeats} beats per ronde. Meer beats betekent trager.`}
            </p>
          )}
          <p className="muted">
            Bewegingstempo geldt alleen voor de groepsduur in nieuwe Looks. Energiek hoeft niet snel of donker te zijn.
          </p>
          <div className="band-profile-colors">
            <span>Voorkeurskleuren (optioneel)</span>
            <p className="muted">
              Dit zijn referentiekleuren, geen opdracht om ze allemaal tegelijk op het podium te gebruiken.
            </p>
            <div className="band-profile-swatches">
              {profile.preferredColors.map((color, index) => (
                <div className="band-profile-swatch" key={index}>
                  <input
                    aria-label={`Voorkeurskleur ${index + 1}`}
                    type="color"
                    value={color}
                    onChange={(event) =>
                      update({
                        preferredColors: profile.preferredColors.map((current, colorIndex) =>
                          index === colorIndex ? event.target.value : current,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Verwijder voorkeurskleur ${index + 1}`}
                    onClick={() =>
                      update({
                        preferredColors: profile.preferredColors.filter((_, colorIndex) => colorIndex !== index),
                      })
                    }
                  >
                    Verwijder
                  </button>
                </div>
              ))}
            </div>
            {profile.preferredColors.length < 4 ? (
              <div className="band-profile-color-add">
                <input
                  type="color"
                  aria-label="Nieuwe voorkeurskleur"
                  value={newColor}
                  onChange={(event) => setNewColor(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => update({ preferredColors: [...profile.preferredColors, newColor] })}
                >
                  Voeg kleur toe
                </button>
              </div>
            ) : (
              <p>Vier voorkeurskleuren gekozen. Verwijder een kleur om een andere toe te voegen.</p>
            )}
          </div>
        </details>
        {value && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              if (!disabled) {
                setExpanded(true)
                onChange(undefined)
              }
            }}
          >
            Bandprofiel wissen
          </button>
        )}
      </fieldset>
    </details>
  )
}
