import { useState } from 'react'
import { animationLabel, resolveLookLayers, type LookLayer, type RuntimeState, type ShowDocument } from './domain'
import {
  applyLiveGroupLook,
  linkedGroupIds,
  linkLiveGroups,
  livePreview,
  resetLiveGroups,
  unlinkLiveGroup,
  updateLiveGroups,
  type LiveControls,
} from './live-controls'
import './LiveGroupControls.css'
import { GroupTimingControls } from './GroupTimingControls'
import { CommitRange } from './CommitRange'

const mixed = '__mixed__'
const follows = '__follows__'

export function commonLayerValue<K extends keyof LookLayer>(layers: LookLayer[], key: K): LookLayer[K] | typeof mixed {
  return layers.length && layers.every((layer) => layer[key] === layers[0][key]) ? layers[0][key] : mixed
}

export function LiveGroupControls({
  show,
  state,
  controls,
  onChange,
  runtimeSession = false,
}: {
  show: ShowDocument
  state: RuntimeState
  controls: LiveControls
  onChange: (controls: LiveControls) => void
  runtimeSession?: boolean
}) {
  const [groupId, setGroupId] = useState(show.groups[0]?.id ?? '')
  const selectedId = show.groups.some((group) => group.id === groupId) ? groupId : (show.groups[0]?.id ?? '')
  const [linkSelection, setLinkSelection] = useState<string[]>(() =>
    selectedId ? linkedGroupIds(show, controls, selectedId) : [],
  )
  const linked = selectedId ? linkedGroupIds(show, controls, selectedId) : []
  const preview = livePreview(show, state, controls)
  const look = preview.show.looks.find((item) => item.id === preview.state.activeLookId) ?? preview.show.looks[0]
  const layers = look ? resolveLookLayers(preview.show, look).filter((layer) => linked.includes(layer.groupId)) : []
  const mode = commonLayerValue(layers, 'mode')
  const programId = commonLayerValue(layers, 'programId')
  const colorId = commonLayerValue(layers, 'colorProfileId')
  const intensity = commonLayerValue(layers, 'intensity')
  const programs = show.programs.filter((program) => program.pattern || program.effect !== 'static')
  const pendingLinks = show.groups
    .filter((group) => group.id === selectedId || linkSelection.includes(group.id))
    .map((group) => group.id)
  const proposedControls = linkLiveGroups(show, controls, pendingLinks)
  const proposedMembers = selectedId ? linkedGroupIds(show, proposedControls, selectedId) : []
  const changed = (id: string) => Object.keys(controls.overrides[id] ?? {}).length > 0
  const update = (change: Partial<Omit<LookLayer, 'groupId'>>) =>
    onChange(updateLiveGroups(show, controls, selectedId, change))
  const groupNames = linked
    .map((id) => show.groups.find((group) => group.id === id)?.name)
    .filter(Boolean)
    .join(' + ')

  return (
    <section className="live-group-controls" aria-label="Groepen live bedienen">
      <p className="section-label">
        GROEPEN LIVE <span>Deze sessie</span>
      </p>
      {!show.groups.length ? (
        <p>Voeg eerst groepen toe in de podiumsetup.</p>
      ) : !look ? (
        <p>Maak eerst een Look bij Ontwerp om groepen live te bedienen.</p>
      ) : (
        <>
          <label>
            Groep
            <select
              aria-label="Livegroep"
              value={selectedId}
              onChange={(event) => {
                setGroupId(event.target.value)
                setLinkSelection(linkedGroupIds(show, controls, event.target.value))
              }}
            >
              {show.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                  {changed(group.id) ? ' · aangepast' : ''}
                  {linkedGroupIds(show, controls, group.id).length > 1 ? ' · gekoppeld' : ''}
                </option>
              ))}
            </select>
          </label>
          <p className="live-group-scope" role="status">
            {linked.length > 1 ? 'Samen bedienen: ' : 'Je bedient: '}
            {groupNames}
            <small>
              {linked.some(changed) ? 'Live aangepast · opgeslagen Looks blijven intact' : 'Volgt de globale Look'}
            </small>
          </p>
          {state.mode !== 'automation' && (
            <p className="live-group-notice">
              {state.mode === 'blackout'
                ? 'Blackout blijft actief.'
                : state.mode === 'safety'
                  ? 'Alleen de ingestelde veiligheidsgroepen blijven actief.'
                  : 'De animatie blijft gepauzeerd.'}{' '}
              Wijzigingen worden onthouden; deze bediening hervat de show niet.
            </p>
          )}
          {layers.some((layer) => layer.mode === 'off') && (
            <p className="live-group-notice">
              {mode === 'off' ? 'Deze groep(en) staan uit.' : 'Een deel van deze groepen staat uit.'} Een kleur of
              niveau kiezen zet ze niet aan; kies daarvoor een Look, animatie of vast licht.
            </p>
          )}
          <label>
            Groepsdeel uit Look
            <select
              aria-label="Live groepslook laden"
              value=""
              onChange={(event) => {
                if (event.target.value) onChange(applyLiveGroupLook(show, controls, selectedId, event.target.value))
              }}
            >
              <option value="">Kies een Look…</option>
              {show.looks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <small>
            Elke gekoppelde groep neemt haar eigen deel uit die Look over, niet het deel van de geselecteerde groep.
          </small>
          <div className="live-group-inspector">
            <label>
              Lichtgedrag
              <select
                aria-label="Live groepsgedrag"
                value={mode}
                onChange={(event) => {
                  const nextMode = event.target.value as LookLayer['mode']
                  const current = show.programs.find(
                    (program) => program.id === programId && (program.pattern || program.effect !== 'static'),
                  )
                  update({
                    mode: nextMode,
                    programId: nextMode === 'animation' ? (current?.id ?? programs[0]?.id ?? null) : null,
                  })
                }}
              >
                {mode === mixed && (
                  <option value={mixed} disabled>
                    Gemengd
                  </option>
                )}
                <option value="static">Vast licht</option>
                <option value="animation" disabled={!programs.length}>
                  Animatie
                </option>
                <option value="off">Uit</option>
              </select>
            </label>
            <label>
              Animatie
              <select
                aria-label="Live groepsanimatie"
                disabled={!programs.length && !(typeof programId === 'string' && programId !== mixed)}
                value={programId ?? ''}
                onChange={(event) => update({ mode: 'animation', programId: event.target.value })}
              >
                <option value="" disabled>
                  Geen animatie
                </option>
                {programId === mixed && (
                  <option value={mixed} disabled>
                    Gemengd
                  </option>
                )}
                {show.programs
                  .filter((program) => program.pattern || program.effect !== 'static' || program.id === programId)
                  .map((program) => (
                    <option key={program.id} value={program.id}>
                      {animationLabel(program)}
                    </option>
                  ))}
              </select>
            </label>
            {!programs.length && (
              <small>Maak een bewegend patroon bij Ontwerp → Animaties om beweging te kiezen.</small>
            )}
            <label>
              Kleur
              <select
                aria-label="Live groepskleur"
                value={colorId ?? follows}
                onChange={(event) =>
                  update({ colorProfileId: event.target.value === follows ? null : event.target.value })
                }
              >
                {colorId === mixed && (
                  <option value={mixed} disabled>
                    Gemengd
                  </option>
                )}
                <option value={follows}>Volgt globale Lookkleur</option>
                {show.colorProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} (vast)
                  </option>
                ))}
              </select>
            </label>
            <label>
              Lookniveau (tijdelijk){' '}
              <output>{intensity === mixed ? 'Gemengd' : `${Math.round(intensity * 100)}%`}</output>
              {runtimeSession ? (
                <CommitRange
                  key={linked.join('|')}
                  aria-label="Live groepsniveau"
                  min="0"
                  max="1"
                  step="0.01"
                  value={intensity === mixed ? 0.5 : intensity}
                  onCommit={(intensity) => update({ intensity })}
                />
              ) : (
                <input
                  aria-label="Live groepsniveau"
                  aria-valuetext={
                    intensity === mixed
                      ? 'Gemengde niveaus; bewegen kiest een gezamenlijk niveau'
                      : `${Math.round(intensity * 100)} procent`
                  }
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={intensity === mixed ? 0.5 : intensity}
                  onChange={(event) => update({ intensity: Number(event.target.value) })}
                />
              )}
            </label>
            {runtimeSession && <small>Laat de schuif los om het niveau toe te passen.</small>}
            {intensity === mixed && (
              <small>
                {Math.round(Math.min(...layers.map((layer) => layer.intensity)) * 100)}–
                {Math.round(Math.max(...layers.map((layer) => layer.intensity)) * 100)}% per groep. Beweeg de schuif om
                één gezamenlijk niveau te kiezen.
              </small>
            )}
            <small>
              De groepsmasters vermenigvuldigen deze niveaus. Warmwitte lampen blijven warmwit. Kleur en niveau wijzigen
              schakelt een groep die uit staat niet in.
            </small>
            <GroupTimingControls
              key={linked.join('|')}
              layers={layers}
              show={show}
              onChange={update}
              deferCommit={runtimeSession}
            />
          </div>
          <details className="live-group-links">
            <summary>Groepen koppelen</summary>
            <p>
              Koppelen verandert het licht niet. Alleen volgende wijzigingen worden samen toegepast; bestaande
              verschillen blijven zichtbaar als ‘Gemengd’.
            </p>
            <div>
              {show.groups.map((group) => (
                <label key={group.id}>
                  <input
                    type="checkbox"
                    checked={pendingLinks.includes(group.id)}
                    disabled={group.id === selectedId}
                    onChange={(event) =>
                      setLinkSelection((current) =>
                        event.target.checked ? [...current, group.id] : current.filter((id) => id !== group.id),
                      )
                    }
                  />
                  {group.name}
                </label>
              ))}
            </div>
            <p>
              Na koppelen: {proposedMembers.map((id) => show.groups.find((group) => group.id === id)?.name).join(' + ')}
              . Bestaande koppelingen worden samengevoegd.
            </p>
            <button
              disabled={pendingLinks.length < 2}
              onClick={() => onChange(linkLiveGroups(show, controls, pendingLinks))}
            >
              Koppel selectie
            </button>
            <button
              disabled={linked.length < 2}
              onClick={() => {
                onChange(unlinkLiveGroup(controls, selectedId))
                setLinkSelection([selectedId])
              }}
            >
              Ontkoppel deze groep
            </button>
            <small>
              Koppelingen gelden alleen in deze sessie. Een globale Look wisselen wist de live wijzigingen, maar behoudt
              de koppelingen.
            </small>
          </details>
          <div className="live-group-reset">
            <button
              disabled={!linked.some(changed)}
              onClick={() => onChange(resetLiveGroups(show, controls, selectedId))}
            >
              Volg Look voor {linked.length > 1 ? 'gekoppelde groepen' : 'deze groep'}
            </button>
            <button
              disabled={!Object.keys(controls.overrides).length}
              onClick={() => onChange({ ...controls, overrides: {} })}
            >
              Herstel alle live wijzigingen
            </button>
          </div>
        </>
      )}
    </section>
  )
}
