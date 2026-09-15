import { useState } from 'react'
import { animationLabel, resolveLookLayers, type Look, type LookLayer, type ShowDocument } from './domain'
import './LookEditor.css'
import { GroupTimingControls, layerAnimationLabel } from './GroupTimingControls'

export function lookLayerSummary(show: ShowDocument, look: Look) {
  return (
    resolveLookLayers(show, look)
      .map((layer) => {
        const group = show.groups.find((item) => item.id === layer.groupId)?.name ?? layer.groupId
        const program = show.programs.find((item) => item.id === layer.programId)
        const mode =
          layer.mode === 'off'
            ? 'uit'
            : layer.mode === 'static'
              ? 'vast'
              : program
                ? layerAnimationLabel(program, layer)
                : 'geen animatie'
        const palette = layer.colorProfileId
          ? show.colorProfiles.find((item) => item.id === layer.colorProfileId)?.name
          : undefined
        return `${group}: ${mode}${layer.mode === 'off' ? '' : ` ${Math.round(layer.intensity * 100)}%${palette ? ` (${palette}, vast)` : ''}`}`
      })
      .join(' · ') +
    ` · Lookkleur: ${show.colorProfiles.find((profile) => profile.id === look.colorProfileId)?.name ?? 'onbekend'}`
  )
}

export function animationForLayer(show: ShowDocument, layer: LookLayer) {
  return (
    show.programs.find(
      (program) => program.id === layer.programId && (program.pattern || program.effect !== 'static'),
    ) ?? show.programs.find((program) => program.pattern || program.effect !== 'static')
  )
}

export function editLookLayer(show: ShowDocument, look: Look, groupId: string, change: Partial<LookLayer>): Look {
  // Materialize the legacy Look before editing, so untouched groups keep their current behavior.
  return {
    ...look,
    layers: resolveLookLayers(show, look).map((layer) =>
      layer.groupId === groupId ? { ...layer, ...change, groupId } : layer,
    ),
  }
}

export function LookEditor({
  show,
  look,
  onChange,
  onPreview,
  embedded = false,
}: {
  show: ShowDocument
  look: Look
  onChange: (look: Look) => void
  onPreview?: () => void
  embedded?: boolean
}) {
  const [selectedGroupId, setSelectedGroupId] = useState(show.groups[0]?.id ?? '')
  const layers = resolveLookLayers(show, look)
  const selected = layers.find((layer) => layer.groupId === selectedGroupId) ?? layers[0]
  const group = show.groups.find((item) => item.id === selected?.groupId)
  const movingPrograms = show.programs.filter((program) => program.pattern || program.effect !== 'static')
  const update = (change: Partial<LookLayer>) => {
    if (selected) onChange(editLookLayer(show, look, selected.groupId, change))
  }
  const body = (
    <div className="look-editor-body">
      <label className="editor-row">
        Lookkleur
        <select
          value={look.colorProfileId}
          onChange={(event) => onChange({ ...look, colorProfileId: event.target.value })}
        >
          {show.colorProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">Kies een groep. Elke groep krijgt een eigen animatie of vast licht, kleur en niveau.</p>
      <div className="look-layer-layout">
        <div className="look-layer-list" aria-label="Groepen in deze Look">
          {layers.map((layer) => {
            const program = show.programs.find((item) => item.id === layer.programId)
            const profile = show.colorProfiles.find((item) => item.id === layer.colorProfileId)
            return (
              <button
                key={layer.groupId}
                className={selected?.groupId === layer.groupId ? 'active' : ''}
                aria-pressed={selected?.groupId === layer.groupId}
                onClick={() => setSelectedGroupId(layer.groupId)}
              >
                <strong>{show.groups.find((item) => item.id === layer.groupId)?.name ?? layer.groupId}</strong>
                <span>
                  {layer.mode === 'off'
                    ? 'Uit'
                    : layer.mode === 'static'
                      ? 'Vast licht'
                      : program
                        ? layerAnimationLabel(program, layer)
                        : 'Geen animatie'}
                </span>
                <small>
                  {layer.mode === 'off'
                    ? 'Geen output'
                    : `${profile?.name ?? 'Volgt Lookkleur'} · ${Math.round(layer.intensity * 100)}%`}
                </small>
              </button>
            )
          })}
        </div>
        {selected && (
          <fieldset className="look-layer-inspector">
            <legend>{group?.name ?? 'Groep'}</legend>
            <label className="editor-row">
              Lichtgedrag
              <select
                value={selected.mode}
                onChange={(event) => {
                  const mode = event.target.value as LookLayer['mode']
                  update({
                    mode,
                    programId: mode === 'animation' ? (animationForLayer(show, selected)?.id ?? null) : null,
                  })
                }}
              >
                <option value="static">Vast licht</option>
                <option value="animation" disabled={!movingPrograms.length}>
                  Animatie
                </option>
                <option value="off">Uit</option>
              </select>
            </label>
            {!movingPrograms.length && (
              <p className="muted">
                Maak eerst een bewegend patroon bij Ontwerp → Animaties om deze groep te animeren.
              </p>
            )}
            {selected.mode === 'animation' && (
              <label className="editor-row">
                Patroon
                <select
                  value={selected.programId ?? ''}
                  onChange={(event) => update({ programId: event.target.value })}
                >
                  {show.programs
                    .filter(
                      (program) => program.pattern || program.effect !== 'static' || program.id === selected.programId,
                    )
                    .map((program) => (
                      <option key={program.id} value={program.id}>
                        {animationLabel(program)}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {selected.mode !== 'off' && (
              <>
                <label className="editor-row">
                  Kleur
                  <select
                    value={selected.colorProfileId ?? ''}
                    onChange={(event) => update({ colorProfileId: event.target.value || null })}
                  >
                    <option value="">Volgt Lookkleur / kleurwissel</option>
                    {show.colorProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name} (vast)
                      </option>
                    ))}
                  </select>
                </label>
                <label className="look-layer-level">
                  Niveau in deze Look <output>{Math.round(selected.intensity * 100)}%</output>
                  <input
                    aria-label={`${group?.name ?? 'Groep'} Lookniveau`}
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selected.intensity}
                    onChange={(event) => update({ intensity: Number(event.target.value) })}
                  />
                </label>
                <p className="muted">
                  De groepsmaster vermenigvuldigt dit niveau. Vaste kleuren volgen geen globale kleurwissel; warmwitte
                  lampen blijven warmwit.
                </p>
              </>
            )}
            <GroupTimingControls key={selected.groupId} layers={[selected]} show={show} onChange={update} />
          </fieldset>
        )}
      </div>
      {!layers.length && <p>Voeg eerst groepen toe in de podiumsetup.</p>}
      {!embedded && onPreview && <button onClick={onPreview}>Bekijk deze Look in repetitie →</button>}
    </div>
  )
  return embedded ? (
    <section className="look-editor look-editor-embedded" aria-label={`Bewerk Look ${look.name}`}>
      {body}
    </section>
  ) : (
    <details className="design-card look-editor">
      <summary>
        <span>
          {look.name}
          <small className="look-combination">{lookLayerSummary(show, look)}</small>
        </span>
      </summary>
      {body}
    </details>
  )
}
