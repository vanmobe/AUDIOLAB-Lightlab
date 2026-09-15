import { useState, type Dispatch, type SetStateAction } from 'react'
import type { ControlBinding, ControlSlot, ControlSurfaceLayout, ShowDocument } from './domain'
import {
  assignControlBinding,
  bindingAtSlot,
  canAssignBinding,
  clearControlSlot,
  controlSurfaceProfiles,
  getControlSurfaceProfile,
  renameControlBank,
  slotKey,
} from './control-surface'
import { assertShowDocument } from './show-validation'
import { ControlSurfaceAutoFill } from './ControlSurfaceAutoFill'
import { WingBankSync } from './WingBankSync'
import { SidePanel } from './SidePanel'
import './ControlSurfaceEditor.css'

type Category = 'looks' | 'colors' | 'modes' | 'groups' | 'unplaced'
interface Source {
  key: string
  binding: ControlBinding
  existing?: boolean
  color?: string
}
const modes = [
  ['automation', 'Show hervatten'],
  ['static', 'Beeld vasthouden'],
  ['safety', 'Alleen frontlicht'],
  ['blackout', 'Volledige blackout'],
] as const
const dragType = 'application/x-lightlab-control'

/** Editing assignments never executes a control or writes to a physical console. */
export function ControlSurfaceEditor({
  show,
  onChange,
  onPreviewLook,
}: {
  show: ShowDocument
  onChange: Dispatch<SetStateAction<ShowDocument>>
  onPreviewLook: (id: string) => void
}) {
  const [bank, setBank] = useState(1)
  const [category, setCategory] = useState<Category>('looks')
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [selected, setSelected] = useState<ControlSlot | null>(null)
  const [message, setMessage] = useState('')
  const [history, setHistory] = useState<ControlSurfaceLayout[]>([])
  const [autoFillOpen, setAutoFillOpen] = useState(false)
  const [autoFillSession, setAutoFillSession] = useState<{ profileId: string; initialBank: number } | null>(null)
  const profile = getControlSurfaceProfile(show.controlSurface.profileId)
  const activeBank = Math.min(bank, profile?.banks ?? 1)
  const supported = (binding: ControlBinding) =>
    !!profile && !!binding.slot && canAssignBinding(binding, binding.slot, profile)
  const unplaced = show.controlSurface.bindings.filter((binding) => !supported(binding))
  const sources: Record<Category, Source[]> = {
    looks: show.looks.map((look) => ({
      key: `look:${look.id}`,
      binding: { id: '', label: look.name, action: 'look', targetId: look.id },
      color: show.colorProfiles.find((color) => color.id === look.colorProfileId)?.primary,
    })),
    colors: show.colorProfiles.map((color) => ({
      key: `color:${color.id}`,
      binding: { id: '', label: color.name, action: 'color-lock', targetId: color.id },
      color: color.primary,
    })),
    modes: modes.map(([targetId, label]) => ({
      key: `mode:${targetId}`,
      binding: { id: '', label, action: 'mode', targetId },
    })),
    groups: show.groups.map((group) => ({
      key: `group:${group.id}`,
      binding: { id: '', label: group.name, action: 'group-intensity', targetId: group.id },
    })),
    unplaced: unplaced.map((binding) => ({ key: `existing:${binding.id}`, binding, existing: true })),
  }
  // Drag payloads are only keys into current, trusted show data. Never deserialize arbitrary bindings.
  const allSources = [
    ...Object.values(sources).flat(),
    ...show.controlSurface.bindings
      .filter(supported)
      .map((binding) => ({ key: `existing:${binding.id}`, binding, existing: true })),
  ]
  const resolveSource = (key: string | null) => allSources.find((source) => source.key === key)
  const pendingSource = resolveSource(pending)
  const selectedBinding = selected ? bindingAtSlot(show.controlSurface, selected) : undefined
  const visibleSources = sources[category].filter((source) =>
    source.binding.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  )

  function edit(transform: (current: ShowDocument) => ShowDocument, notice: string) {
    try {
      const next = transform(show)
      assertShowDocument(next)
      if (JSON.stringify(next.controlSurface) === JSON.stringify(show.controlSurface)) {
        setMessage('Deze indeling staat al ingesteld.')
        return true
      }
      setHistory((current) => [...current.slice(-19), structuredClone(show.controlSurface)])
      onChange((current) => ({ ...current, controlSurface: next.controlSurface }))
      setMessage(notice)
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Toewijzen is niet gelukt.')
      return false
    }
  }
  function assign(key: string | null, slot: ControlSlot) {
    const source = resolveSource(key)
    if (!source || !profile) {
      setMessage('Kies eerst een beschikbare functie.')
      return
    }
    if (!canAssignBinding(source.binding, slot, profile)) {
      setMessage(
        source.binding.action === 'group-intensity'
          ? 'Een groepsmaster hoort op een draaiknop.'
          : 'Deze functie kan niet op deze positie. Looks, kleuren en showfuncties horen op knoppen.',
      )
      return
    }
    const binding = source.existing ? source.binding : { ...source.binding, id: crypto.randomUUID() }
    const occupied = bindingAtSlot(show.controlSurface, slot)
    edit(
      (current) => assignControlBinding(current, binding, slot),
      `${binding.label} toegewezen aan ${slot.kind === 'button' ? 'knop' : 'draaiknop'} ${slot.index} in bank ${slot.bank}.${occupied && occupied.id !== binding.id ? (source.binding.slot ? ' De posities zijn verwisseld.' : ' De vorige functie staat bij Niet geplaatst.') : ''}`,
    )
    setPending(null)
    setSelected(slot)
  }
  function undo() {
    const previous = history.at(-1)
    if (!previous) return
    try {
      assertShowDocument({ ...show, controlSurface: previous })
      onChange((current) => ({ ...current, controlSurface: previous }))
      setHistory((current) => current.slice(0, -1))
      setPending(null)
      setSelected(null)
      setMessage('Vorige indeling hersteld. Andere showinstellingen zijn ongewijzigd.')
    } catch {
      setMessage('Herstellen kan niet: de show bevat niet meer alle benodigde Looks of groepen.')
    }
  }
  function renderSlot(kind: ControlSlot['kind'], index: number) {
    const slot = { bank: activeBank, kind, index }
    const binding = bindingAtSlot(show.controlSurface, slot)
    const isSelected = selected && slotKey(selected) === slotKey(slot)
    const eligible = pendingSource && profile && canAssignBinding(pendingSource.binding, slot, profile)
    const name = `${kind === 'button' ? 'Knop' : 'Draaiknop'} ${index}`
    const color =
      binding?.action === 'look'
        ? show.colorProfiles.find(
            (color) => color.id === show.looks.find((look) => look.id === binding.targetId)?.colorProfileId,
          )?.primary
        : binding?.action === 'color-lock'
          ? show.colorProfiles.find((color) => color.id === binding.targetId)?.primary
          : undefined
    return (
      <button
        key={slotKey(slot)}
        type="button"
        className={`surface-slot ${kind} ${eligible ? 'eligible' : ''}`}
        aria-label={`${name}: ${binding?.label ?? 'Niet toegewezen'}`}
        aria-pressed={!!isSelected}
        draggable={!!binding}
        onDragStart={(event) => {
          if (binding) {
            event.dataTransfer.setData(dragType, `existing:${binding.id}`)
            event.dataTransfer.effectAllowed = 'move'
            setPending(`existing:${binding.id}`)
          }
        }}
        onDragEnd={() => setPending(null)}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(dragType)) {
            event.preventDefault()
            event.dataTransfer.dropEffect = event.dataTransfer.effectAllowed === 'copy' ? 'copy' : 'move'
          }
        }}
        onDrop={(event) => {
          event.preventDefault()
          assign(event.dataTransfer.getData(dragType), slot)
        }}
        onClick={() => (pendingSource ? assign(pending, slot) : setSelected(slot))}
      >
        <span className="slot-number">
          {kind === 'button' ? 'B' : 'R'}
          {index}
        </span>
        {kind === 'rotary' ? (
          <span className="rotary-dial" aria-hidden="true">
            <i />
          </span>
        ) : (
          <span className="slot-light" style={{ background: color ?? (binding ? '#2f7cff' : '#39414b') }} />
        )}
        <strong>{binding?.label ?? 'Vrij'}</strong>
        <small>
          {binding
            ? kind === 'rotary'
              ? 'Groepsintensiteit'
              : binding.action === 'look'
                ? 'Look'
                : binding.action === 'color-lock'
                  ? 'Kleurprofiel'
                  : 'Showfunctie'
            : 'Sleep hier een functie'}
        </small>
      </button>
    )
  }

  return (
    <section
      className="surface-editor"
      aria-label="Bedieningspaneel indelen"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setPending(null)
          setSelected(null)
        }
      }}
    >
      <header className="surface-heading">
        <div>
          <p className="section-label">BEDIENINGSPANEEL</p>
          <h2>Jouw show. Onder je vingers.</h2>
          <p>
            Sleep een Look naar een knop of een groep naar een draaiknop. Of klik eerst op een functie en dan op een
            positie.
          </p>
        </div>
        <label>
          Tafel
          <select
            aria-label="Type bedieningspaneel"
            value={show.controlSurface.profileId}
            onChange={(event) => {
              const id = event.target.value
              edit(
                (current) => ({ ...current, controlSurface: { ...current.controlSurface, profileId: id } }),
                'Tafelprofiel gewijzigd. Alle toewijzingen zijn behouden.',
              )
              setBank(1)
              setSelected(null)
              setPending(null)
              setAutoFillSession(null)
              setAutoFillOpen(false)
            }}
          >
            {!profile && (
              <option value={show.controlSurface.profileId}>{show.controlSurface.profileId} · onbekend profiel</option>
            )}
            {controlSurfaceProfiles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      <p className="surface-connection">
        Indelen maakt geen verbinding met de tafel: wijzigingen worden niet naar WING verstuurd totdat je ze expliciet
        synchroniseert.
      </p>
      <div className="surface-tools">
        <WingBankSync show={show} initialBank={activeBank} />
        {profile && (
          <button
            aria-haspopup="dialog"
            aria-expanded={autoFillOpen}
            onClick={() => {
              if (autoFillSession?.profileId !== profile.id)
                setAutoFillSession({ profileId: profile.id, initialBank: activeBank })
              setAutoFillOpen(true)
              setPending(null)
              setSelected(null)
            }}
          >
            Banken automatisch vullen
          </button>
        )}
      </div>
      <SidePanel
        open={autoFillOpen && !!profile}
        onClose={() => setAutoFillOpen(false)}
        title="Banken automatisch vullen"
      >
        {profile && autoFillSession?.profileId === profile.id && (
          <ControlSurfaceAutoFill
            key={profile.id}
            show={show}
            initialBank={autoFillSession.initialBank}
            hideCloseButton
            onClose={() => setAutoFillOpen(false)}
            onApply={(surface, firstBank) => {
              const applied = edit(
                (current) => ({ ...current, controlSurface: surface }),
                'Bankindeling toegepast. Alle gekozen banken zijn in één stap gevuld. Ongedaan maken herstelt de vorige indeling.',
              )
              if (applied) {
                setBank(firstBank)
                setPending(null)
                setSelected(null)
              }
              return applied
            }}
          />
        )}
      </SidePanel>
      <div className="surface-layout">
        <div className="surface-console">
          <nav className="surface-banks" aria-label="CC banken">
            {Array.from({ length: profile?.banks ?? 0 }, (_, i) => i + 1).map((number) => {
              const count = show.controlSurface.bindings.filter(
                (binding) => supported(binding) && binding.slot?.bank === number,
              ).length
              return (
                <button
                  key={number}
                  aria-label={`Bank ${number}${show.controlSurface.bankNames?.[number] ? ` · ${show.controlSurface.bankNames[number]}` : ''} · ${count} toegewezen`}
                  aria-pressed={activeBank === number}
                  onClick={() => {
                    setBank(number)
                    setSelected(null)
                  }}
                >
                  <span>{number}</span>
                  <i className={count ? 'filled' : ''} />
                </button>
              )
            })}
          </nav>
          {profile ? (
            <>
              <div className="surface-bank-title">
                <h3>
                  {profile.id === 'wing-compact' ? 'USER' : `Bank ${activeBank}`}{' '}
                  {show.controlSurface.bankNames?.[activeBank] && (
                    <span>· {show.controlSurface.bankNames[activeBank]}</span>
                  )}
                </h3>
                <button disabled={!history.length} onClick={undo}>
                  Ongedaan maken
                </button>
              </div>
              {profile.id === 'wing-compact' && (
                <p className="muted">
                  Compact toont de 16 USER-knoppen. De 16 CC-banken met draaiknoppen horen bij WING en WING Rack.
                  Toewijzingen buiten dit profiel blijven bewaard.
                </p>
              )}
              {!!profile.rotaries && (
                <div className="surface-rotaries" aria-label="Draaiknoppen">
                  {Array.from({ length: profile.rotaries }, (_, i) => renderSlot('rotary', i + 1))}
                </div>
              )}
              <div
                className="surface-buttons"
                style={{ gridTemplateColumns: `repeat(${profile.buttonColumns}, minmax(0, 1fr))` }}
                aria-label="Knoppenmatrix"
              >
                {Array.from({ length: profile.buttons }, (_, i) => renderSlot('button', i + 1))}
              </div>
              <div className="surface-selection" aria-live="polite">
                {pendingSource ? (
                  <>
                    <strong>{pendingSource.binding.label}</strong>
                    <span>
                      Kies een {pendingSource.binding.action === 'group-intensity' ? 'draaiknop' : 'knop'} · wisselen
                      van bank mag.
                    </span>
                    <button onClick={() => setPending(null)}>Annuleren</button>
                  </>
                ) : selectedBinding && selected ? (
                  <>
                    <strong>{selectedBinding.label}</strong>
                    <span>
                      {selected.kind === 'button' ? 'Knop' : 'Draaiknop'} {selected.index} · bank {selected.bank}
                    </span>
                    <button onClick={() => setPending(`existing:${selectedBinding.id}`)}>Verplaats / verwissel</button>
                    <button
                      onClick={() =>
                        edit(
                          (current) => clearControlSlot(current, selected),
                          'Positie vrijgemaakt. De functie blijft bij Niet geplaatst.',
                        )
                      }
                    >
                      Maak positie vrij
                    </button>
                    {selectedBinding.action === 'look' && (
                      <button onClick={() => onPreviewLook(selectedBinding.targetId!)}>Bekijk Look in repetitie</button>
                    )}
                  </>
                ) : (
                  <span>
                    Selecteer een positie om de toewijzing te bekijken. Slepen tussen bezette posities verwisselt ze.
                  </span>
                )}
              </div>
              <details className="surface-bank-settings">
                <summary>Banknaam aanpassen</summary>
                <label>
                  Naam
                  <input
                    key={`${profile.id}:${activeBank}:${show.controlSurface.bankNames?.[activeBank] ?? ''}`}
                    aria-label="Banknaam"
                    defaultValue={show.controlSurface.bankNames?.[activeBank] ?? ''}
                    maxLength={80}
                    placeholder="Bijvoorbeeld: Rustig / Refrain / Tussen nummers"
                    onBlur={(event) =>
                      edit((current) => renameControlBank(current, activeBank, event.target.value), 'Banknaam bewaard.')
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                    }}
                  />
                </label>
              </details>
            </>
          ) : (
            <p>Kies een ondersteund tafelprofiel. Je bestaande toewijzingen blijven bewaard.</p>
          )}
          {message && (
            <p role="status" className="surface-feedback">
              {message}
            </p>
          )}
        </div>
        <aside className="surface-library" aria-label="Toewijsbare functies">
          <h3>Wat wil je bedienen?</h3>
          <label className="surface-category">
            Soort
            <select
              aria-label="Soort functie"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value as Category)
                setSearch('')
                setPending(null)
              }}
            >
              <option value="looks">Looks</option>
              <option value="colors">Kleuren</option>
              <option value="modes">Showfuncties</option>
              <option value="groups">Groepsintensiteiten</option>
              <option value="unplaced">Niet geplaatst ({unplaced.length})</option>
            </select>
          </label>
          <input
            aria-label="Zoek functie"
            type="search"
            placeholder="Zoek op naam…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <p className="muted">
            {category === 'groups'
              ? 'Groepen regel je met een draaiknop.'
              : category === 'unplaced'
                ? 'Bestaande en vrijgemaakte functies. Ook posities buiten dit tafelprofiel blijven hier bereikbaar.'
                : 'Sleep naar de matrix of klik om te kiezen.'}
          </p>
          <div className="surface-sources">
            {visibleSources.map((source) => (
              <button
                key={source.key}
                className="surface-source"
                aria-pressed={pending === source.key}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(dragType, source.key)
                  event.dataTransfer.effectAllowed = source.existing ? 'move' : 'copy'
                  setPending(source.key)
                }}
                onDragEnd={() => setPending(null)}
                onClick={() => setPending((current) => (current === source.key ? null : source.key))}
              >
                {source.color && <i style={{ background: source.color }} aria-hidden="true" />}
                <span>
                  {source.binding.label}
                  {source.binding.slot && (
                    <small>
                      Buiten dit profiel · bank {source.binding.slot.bank},{' '}
                      {source.binding.slot.kind === 'button' ? 'knop' : 'draaiknop'} {source.binding.slot.index}
                    </small>
                  )}
                </span>
                <span className="drag-grip" aria-hidden="true">
                  ⠿
                </span>
              </button>
            ))}
            {!visibleSources.length && (
              <p className="muted">
                Geen functies gevonden.
                {category === 'looks' && !show.looks.length ? ' Maak eerst een Look bij Ontwerp & repetitie.' : ''}
              </p>
            )}
          </div>
          {category === 'unplaced' && pendingSource?.existing && (
            <div className="surface-selection">
              {pendingSource.binding.slot && (
                <button
                  onClick={() =>
                    edit(
                      (current) => clearControlSlot(current, pendingSource.binding.slot!),
                      'Oude positie vrijgemaakt. Kies nu een nieuwe positie.',
                    )
                  }
                >
                  Maak oude positie vrij
                </button>
              )}
              {!pendingSource.binding.slot && (
                <button
                  onClick={() => {
                    const id = pendingSource.binding.id
                    edit(
                      (current) => ({
                        ...current,
                        controlSurface: {
                          ...current.controlSurface,
                          bindings: current.controlSurface.bindings.filter((binding) => binding.id !== id),
                        },
                      }),
                      'Ongeplaatste toewijzing verwijderd. De Look of groep zelf is behouden. Ongedaan maken is beschikbaar.',
                    )
                    setPending(null)
                  }}
                >
                  Verwijder ongeplaatste toewijzing
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}
