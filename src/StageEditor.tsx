import { useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import type { BandMember, ShowDocument } from './domain'
import { fixtureProfiles } from './fixtures'
import {
  aimFixtures,
  aimPresets,
  alignFixtures,
  distributeFixtures,
  matchesAimPreset,
  moveFixtures,
  setFixtureHeight,
  type AimPreset,
} from './stage-operations'
import { aimAtBandMember, moveBandMember } from './band-operations'
import { restoreStage, sameStage, stageSnapshot, type StageSnapshot } from './stage-editor-state'
import './stage-editor.css'
import { AimIndicator } from './AimIndicator'
import { StageCameraMarker } from './StageCameraMarker'
import { matchesStageCamera, stageCameraMarker, stageCameraPresets } from './stage-camera'

type Point = { x: number; z: number }
type Tool = { kind: 'select' } | { kind: 'member' | 'floor'; ids: string[] }
type Panel = 'add' | 'select' | 'view' | 'groups'
const aimSides = {
  forward: 'Naar publiek',
  back: 'Naar achterwand',
  left: 'Naar links',
  right: 'Naar rechts',
  vertical: 'Verticaal',
}
type AimSide = keyof typeof aimSides
function presetSide(preset: AimPreset): AimSide {
  const [x, , z] = preset.direction
  return x < 0 ? 'left' : x > 0 ? 'right' : z > 0 ? 'forward' : z < 0 ? 'back' : 'vertical'
}
const movement: Record<string, [number, number]> = {
  ArrowLeft: [-0.25, 0],
  ArrowRight: [0.25, 0],
  ArrowUp: [0, -0.25],
  ArrowDown: [0, 0.25],
}
// Display-only palette follows group order: renaming, reassigning and appending groups retain existing colors.
const groupRingPalette = ['#ffb454', '#70baff', '#d49aff', '#6fe0b5', '#ff859b', '#e4d76b', '#87d7e6', '#b9ce86']

export function StageEditor({ show, onChange }: { show: ShowDocument; onChange: (show: ShowDocument) => void }) {
  const [selected, select] = useState<string[]>([])
  const [selectedMember, selectMember] = useState<string>()
  const [tool, setTool] = useState<Tool>({ kind: 'select' })
  const [panel, setPanel] = useState<Panel>()
  const [multi, setMulti] = useState(false)
  const [showGroupRings, setShowGroupRings] = useState(true)
  const [hoveredGroup, setHoveredGroup] = useState<string>()
  const [focusedGroup, setFocusedGroup] = useState<string>()
  const highlightedGroup = hoveredGroup ?? focusedGroup
  const cameraMarker = stageCameraMarker(show.camera)
  const groupColors = new Map(
    show.groups.map((group, index) => [
      group.id,
      groupRingPalette[index] ?? `hsl(${Math.round(index * 137.508) % 360} 70% 72%)`,
    ]),
  )
  const [aimSideChoice, setAimSideChoice] = useState<{ selection: string; side: AimSide }>()
  const [query, setQuery] = useState('')
  const [box, setBox] = useState<{ start: Point; end: Point }>()
  const [groupName, setGroupName] = useState('')
  const [memberName, setMemberName] = useState('Zang')
  const [history, setHistory] = useState<StageSnapshot[]>([])
  const map = useRef<HTMLDivElement>(null)
  const inspector = useRef<HTMLElement>(null)
  // Latest rendered or locally emitted show avoids losing the final pointer move to batching.
  const current = useRef(show)
  current.current = show
  const gesture = useRef<{
    start: Point
    before: StageSnapshot
    fixtures: ShowDocument['fixtures']
    ids: string[]
    member?: BandMember
    drag: boolean
    additive: boolean
  } | null>(null)
  const members = show.bandMembers ?? []
  const member = members.find((m) => m.id === selectedMember)
  const selection = show.fixtures.filter((f) => selected.includes(f.id))
  const ids = selection.map((f) => f.id)
  const aimable = selection.filter((f) => fixtureProfiles.find((p) => p.id === f.profileId)?.kind !== 'hazer')
  const aimIds = aimable.map((f) => f.id)
  const height =
    selection.length && selection.every((f) => f.position[1] === selection[0].position[1])
      ? String(selection[0].position[1])
      : ''
  const group =
    selection.length && selection.every((f) => f.groupId === selection[0].groupId) ? selection[0].groupId : ''
  const directions = aimable.map((f) => {
    const vector = f.aim.map((v, i) => v - f.position[i])
    const length = Math.hypot(...vector) || 1
    return vector.map((v) => v / length)
  })
  const sameDirection = directions.every((vector) => vector.every((v, i) => Math.abs(v - directions[0][i]) < 0.001))
  const commonPreset = aimable.length ? aimPresets.find((p) => aimable.every((f) => matchesAimPreset(f, p))) : undefined
  const directionLabel = commonPreset?.label ?? (sameDirection ? 'Eigen richting' : 'Gemengd')
  const selectionKey = [...ids].sort().join('|')
  const aimSide =
    aimSideChoice?.selection === selectionKey ? aimSideChoice.side : commonPreset ? presetSide(commonPreset) : 'forward'

  function emit(next: ShowDocument) {
    current.current = next
    onChange(next)
  }
  function remember(before: StageSnapshot) {
    if (!sameStage(before, stageSnapshot(current.current))) setHistory((items) => [...items.slice(-19), before])
  }
  function change(next: ShowDocument) {
    const before = stageSnapshot(current.current)
    emit(next)
    remember(before)
  }
  function cancelGesture() {
    if (gesture.current?.drag) emit(restoreStage(current.current, gesture.current.before))
    gesture.current = null
    setBox(undefined)
  }
  function chooseFixtures(next: string[]) {
    select(next)
    selectMember(undefined)
    setTool({ kind: 'select' })
  }
  function toggleFixture(id: string) {
    chooseFixtures(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id])
  }
  function chooseMember(id: string) {
    selectMember(id)
    select([])
    setTool({ kind: 'select' })
  }
  function point(e: PointerEvent): Point {
    const rect = map.current!.getBoundingClientRect()
    return {
      x: Math.max(-7, Math.min(7, ((e.clientX - rect.left) / rect.width) * 14 - 7)),
      z: Math.max(-5, Math.min(5, ((e.clientY - rect.top) / rect.height) * 10 - 5)),
    }
  }
  function aimFloor(x: number, z: number, targets: string[]) {
    change({
      ...show,
      fixtures: show.fixtures.map((f) => (targets.includes(f.id) ? { ...f, aimMode: 'target', aim: [x, 0, z] } : f)),
    })
    setTool({ kind: 'select' })
  }
  function targetMember(target: BandMember) {
    if (tool.kind !== 'member') return false
    change({ ...show, fixtures: aimAtBandMember(show.fixtures, tool.ids, target) })
    setTool({ kind: 'select' })
    return true
  }
  function openPanel(next: Panel) {
    setPanel(panel === next ? undefined : next)
    setTool({ kind: 'select' })
    if (panel !== next && inspector.current) inspector.current.scrollTop = 0
  }
  function undo() {
    const previous = history.at(-1)
    if (!previous) return
    cancelGesture()
    emit(restoreStage(current.current, previous))
    setHistory((items) => items.slice(0, -1))
    setTool({ kind: 'select' })
  }

  return (
    <section
      className="stage-editor"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          cancelGesture()
          setTool({ kind: 'select' })
          return
        }
        if (
          (e.ctrlKey || e.metaKey) &&
          !e.shiftKey &&
          e.key.toLowerCase() === 'z' &&
          !(e.target instanceof HTMLInputElement) &&
          !(e.target instanceof HTMLTextAreaElement)
        ) {
          e.preventDefault()
          undo()
        }
      }}
    >
      <div className="stage-workspace">
        <div className="stage-toolbar" aria-label="Podiumgereedschap">
          <button
            aria-controls={panel === 'add' ? 'stage-tool-panel' : undefined}
            aria-expanded={panel === 'add'}
            onClick={() => openPanel('add')}
          >
            Bandlid toevoegen
          </button>
          <button
            aria-controls={panel === 'select' ? 'stage-tool-panel' : undefined}
            aria-expanded={panel === 'select'}
            onClick={() => openPanel('select')}
          >
            Selecteren
          </button>
          <button
            aria-controls={panel === 'view' ? 'stage-tool-panel' : undefined}
            aria-expanded={panel === 'view'}
            onClick={() => openPanel('view')}
          >
            Weergave
          </button>
          <button
            aria-controls={panel === 'groups' ? 'stage-tool-panel' : undefined}
            aria-expanded={panel === 'groups'}
            onClick={() => openPanel('groups')}
          >
            Groepen beheren
          </button>
          <button disabled={!history.length} onClick={undo} title="Laatste podiumwijziging ongedaan maken (Ctrl/Cmd+Z)">
            ↶ Ongedaan
          </button>
        </div>
        <div className="stage-selection-status" role="status">
          {tool.kind !== 'select' ? (
            <>
              <span>
                {tool.ids.length} lampen richten: {tool.kind === 'member' ? 'klik op een bandlid' : 'klik op de vloer'}.
              </span>
              <button onClick={() => setTool({ kind: 'select' })}>Annuleren</button>
            </>
          ) : (
            <>
              <span>
                {member
                  ? member.name
                  : ids.length
                    ? `${ids.length} ${ids.length === 1 ? 'lamp' : 'lampen'} geselecteerd`
                    : 'Selecteer een lamp of bandlid op het podium.'}
                {multi ? ' · Multiselect aan' : ''}
              </span>
              {(ids.length > 0 || member) && <button onClick={() => chooseFixtures([])}>Selectie wissen</button>}
            </>
          )}
        </div>
        <a
          className="stage-edit-selection-link"
          style={{ visibility: panel || ids.length || member ? 'visible' : 'hidden' }}
          href="#stage-selection-inspector"
        >
          {panel ? 'Naar gereedschap ↓' : 'Bewerk selectie ↓'}
        </a>
        <div
          ref={map}
          id="stage-map"
          data-group-rings={showGroupRings}
          className={'stage-map stage-map-interactive ' + (tool.kind !== 'select' ? 'aim-tool' : '')}
          onPointerDown={(e) => {
            if (tool.kind === 'floor') {
              const p = point(e)
              aimFloor(p.x, p.z, tool.ids)
              return
            }
            if (tool.kind === 'member' || e.target !== e.currentTarget) return
            selectMember(undefined)
            const start = point(e)
            gesture.current = {
              start,
              before: stageSnapshot(show),
              fixtures: show.fixtures,
              ids,
              drag: false,
              additive: e.shiftKey || multi,
            }
            setBox({ start, end: start })
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            const g = gesture.current
            if (!g) return
            const end = point(e)
            if (g.member)
              emit({
                ...current.current,
                bandMembers: moveBandMember(
                  current.current.bandMembers ?? [],
                  g.member.id,
                  g.member.position[0] + end.x - g.start.x,
                  g.member.position[2] + end.z - g.start.z,
                ),
              })
            else if (g.drag) {
              const moved = moveFixtures(g.fixtures, g.ids, end.x - g.start.x, end.z - g.start.z)
              emit({
                ...current.current,
                fixtures: current.current.fixtures.map((f) => {
                  const position = moved.find((item) => item.id === f.id)
                  return position && g.ids.includes(f.id) ? { ...f, position: position.position, aim: position.aim } : f
                }),
              })
            } else setBox({ start: g.start, end })
          }}
          onPointerUp={(e) => {
            const g = gesture.current
            if (!g) return
            if (!g.drag) {
              const end = point(e)
              const found = show.fixtures
                .filter(
                  (f) =>
                    f.position[0] >= Math.min(g.start.x, end.x) &&
                    f.position[0] <= Math.max(g.start.x, end.x) &&
                    f.position[2] >= Math.min(g.start.z, end.z) &&
                    f.position[2] <= Math.max(g.start.z, end.z),
                )
                .map((f) => f.id)
              chooseFixtures(g.additive ? [...new Set([...g.ids, ...found])] : found)
            } else remember(g.before)
            gesture.current = null
            setBox(undefined)
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
          }}
          onPointerCancel={cancelGesture}
        >
          <span className="map-back">ACHTERZIJDE · TRUSS</span>
          <span className="map-front">PUBLIEK</span>
          <svg className="stage-aim-lines" viewBox="0 0 140 100" preserveAspectRatio="none" aria-hidden="true">
            {aimable.map((f) => (
              <g key={f.id}>
                <line
                  x1={(f.position[0] + 7) * 10}
                  y1={(f.position[2] + 5) * 10}
                  x2={(f.aim[0] + 7) * 10}
                  y2={(f.aim[2] + 5) * 10}
                />
                <circle cx={(f.aim[0] + 7) * 10} cy={(f.aim[2] + 5) * 10} r="1.4" />
              </g>
            ))}
          </svg>
          {box && (
            <div
              className="stage-selection-box"
              style={{
                left: ((Math.min(box.start.x, box.end.x) + 7) / 14) * 100 + '%',
                top: ((Math.min(box.start.z, box.end.z) + 5) / 10) * 100 + '%',
                width: (Math.abs(box.end.x - box.start.x) / 14) * 100 + '%',
                height: (Math.abs(box.end.z - box.start.z) / 10) * 100 + '%',
              }}
            />
          )}
          {show.fixtures.map((f, i) => (
            <button
              key={f.id}
              className={(selected.includes(f.id) ? 'map-fixture selected' : 'map-fixture') + ' stage-fixture-type'}
              data-fixture-kind={fixtureProfiles.find((profile) => profile.id === f.profileId)?.kind ?? 'unknown'}
              data-group-id={f.groupId}
              data-group-highlighted={f.groupId === highlightedGroup}
              style={
                {
                  left: ((f.position[0] + 7) / 14) * 100 + '%',
                  top: ((f.position[2] + 5) / 10) * 100 + '%',
                  '--group-ring': groupColors.get(f.groupId) ?? '#aeb9c6',
                } as CSSProperties
              }
              aria-label={f.name}
              aria-description={`Groep: ${show.groups.find((group) => group.id === f.groupId)?.name ?? 'Onbekende groep'}`}
              aria-pressed={selected.includes(f.id)}
              title={`${f.name} · ${fixtureProfiles.find((profile) => profile.id === f.profileId)?.model ?? 'Onbekend type'} · ${show.groups.find((group) => group.id === f.groupId)?.name ?? 'Onbekende groep'}`}
              onPointerDown={(e) => {
                if (tool.kind !== 'select') return
                e.stopPropagation()
                e.currentTarget.focus()
                if (e.shiftKey || multi) {
                  toggleFixture(f.id)
                  return
                }
                const next = selected.includes(f.id) ? ids : [f.id]
                chooseFixtures(next)
                gesture.current = {
                  start: point(e),
                  before: stageSnapshot(current.current),
                  fixtures: current.current.fixtures,
                  ids: next,
                  drag: true,
                  additive: false,
                }
                map.current!.setPointerCapture(e.pointerId)
              }}
              onKeyDown={(e) => {
                if (tool.kind !== 'select') return
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault()
                  if (e.shiftKey || multi) toggleFixture(f.id)
                  else chooseFixtures([f.id])
                  return
                }
                const delta = movement[e.key]
                if (!delta) return
                e.preventDefault()
                const next = selected.includes(f.id) ? ids : [f.id]
                chooseFixtures(next)
                change({ ...show, fixtures: moveFixtures(show.fixtures, next, ...delta) })
              }}
            >
              {i + 1}
            </button>
          ))}
          {members.map((m) => (
            <button
              key={m.id}
              className={'map-member' + (selectedMember === m.id ? ' selected-member' : '')}
              style={{ left: ((m.position[0] + 7) / 14) * 100 + '%', top: ((m.position[2] + 5) / 10) * 100 + '%' }}
              aria-label={'Bandlid ' + m.name}
              aria-pressed={selectedMember === m.id}
              onPointerDown={(e) => {
                if (tool.kind === 'floor') return
                e.stopPropagation()
                e.currentTarget.focus()
                if (targetMember(m)) return
                chooseMember(m.id)
                gesture.current = {
                  start: point(e),
                  before: stageSnapshot(current.current),
                  fixtures: current.current.fixtures,
                  ids: [],
                  member: m,
                  drag: true,
                  additive: false,
                }
                map.current!.setPointerCapture(e.pointerId)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (!targetMember(m) && tool.kind === 'select') chooseMember(m.id)
                  return
                }
                if (tool.kind !== 'select') return
                const delta = movement[e.key]
                if (!delta) return
                e.preventDefault()
                chooseMember(m.id)
                change({
                  ...show,
                  bandMembers: moveBandMember(members, m.id, m.position[0] + delta[0], m.position[2] + delta[1]),
                })
              }}
            >
              <span aria-hidden="true">♟</span>
              <span>{m.name}</span>
            </button>
          ))}
          <StageCameraMarker
            camera={show.camera}
            onOpen={() => {
              if (panel !== 'view') openPanel('view')
              else setTool({ kind: 'select' })
            }}
          />
        </div>
        <p className="stage-camera-caption">
          Kijkpunt: <strong>{cameraMarker.label}</strong> · {show.camera.position[1].toLocaleString('nl-BE')} m hoog
          {cameraMarker.outside
            ? ' · buiten podium (schematisch aan de rand)'
            : cameraMarker.clamped
              ? ' · schematisch aan de rand'
              : ''}
          {cameraMarker.vertical ? ` · ${cameraMarker.vertical}` : ' · pijl = kijkrichting'}. Klik op de camera om het
          standpunt te kiezen.
        </p>
        {show.groups.length > 0 && (
          <div className="stage-group-legend" role="group" aria-label="Podiumgroepen">
            <span className="stage-legend-label">Groepen</span>
            {show.groups.map((group) => {
              const groupIds = show.fixtures
                .filter((fixture) => fixture.groupId === group.id)
                .map((fixture) => fixture.id)
              const selectedGroup =
                groupIds.length > 0 && ids.length === groupIds.length && groupIds.every((id) => ids.includes(id))
              return (
                <button
                  key={group.id}
                  style={{ '--group-ring': groupColors.get(group.id) } as CSSProperties}
                  aria-label={`Selecteer groep ${group.name} (${groupIds.length} lampen)`}
                  aria-pressed={selectedGroup}
                  disabled={!groupIds.length}
                  onMouseEnter={() => setHoveredGroup(group.id)}
                  onMouseLeave={() => setHoveredGroup(undefined)}
                  onFocus={() => setFocusedGroup(group.id)}
                  onBlur={() => setFocusedGroup(undefined)}
                  onClick={() => chooseFixtures(groupIds)}
                >
                  <i aria-hidden="true" />
                  <span>{group.name}</span>
                  <small>{groupIds.length}</small>
                </button>
              )
            })}
            <small className="stage-group-help">
              {showGroupRings
                ? 'Buitenring = groep. Aanwijzen licht de groep uit; klikken selecteert haar lampen.'
                : 'Groepsringen verborgen. Klik op een groep om haar lampen te selecteren.'}
            </small>
          </div>
        )}
        <div className="stage-type-legend" aria-label="Fixturetypes op de podiumkaart">
          {fixtureProfiles
            .filter((profile) => show.fixtures.some((fixture) => fixture.profileId === profile.id))
            .map((profile) => (
              <span key={profile.id} className="stage-fixture-type" data-fixture-kind={profile.kind}>
                <i aria-hidden="true" />
                {profile.model}
              </span>
            ))}
          <small>Typekleuren · niet de uitgestraalde lichtkleur. Witte rand = geselecteerd.</small>
        </div>
        <p className="stage-help">
          Sleep om te verplaatsen. Selectiekader of Shift-klik voor meerdere lampen. Pijltjestoetsen verplaatsen; Escape
          annuleert.
        </p>
      </div>
      <aside
        ref={inspector}
        id="stage-selection-inspector"
        className="stage-inspector"
        aria-label="Podiumgereedschap en selectie"
      >
        <a className="stage-return-link" href="#stage-map">
          Terug naar podium ↑
        </a>
        {panel && (
          <div id="stage-tool-panel" className="stage-tool-panel" role="region" aria-label="Podiumgereedschap">
            <button className="stage-panel-close" aria-label="Gereedschap sluiten" onClick={() => setPanel(undefined)}>
              Sluiten
            </button>
            {panel === 'add' && <h3>Bandlid toevoegen</h3>}
            {panel === 'select' && <h3>Selecteren</h3>}
            {panel === 'add' && (
              <form
                className="band-add"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (members.length >= 16 || !memberName.trim()) return
                  const id = crypto.randomUUID()
                  change({
                    ...show,
                    bandMembers: [
                      ...members,
                      {
                        id,
                        name: memberName.trim(),
                        position: [((members.length % 5) - 2) * 1.5, 0, 1 - Math.floor(members.length / 5) * 1.5],
                      },
                    ],
                  })
                  chooseMember(id)
                  setPanel(undefined)
                  setMemberName('Bandlid ' + (members.length + 2))
                }}
              >
                <label>
                  Naam of instrument
                  <input
                    maxLength={80}
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    placeholder="Zang, gitaar, drums…"
                  />
                </label>
                <button disabled={members.length >= 16 || !memberName.trim()}>Bandlid toevoegen</button>
                {members.length >= 16 && <p role="status">Maximum van 16 bandleden bereikt.</p>}
                <p className="stage-help">De lampen uit je huidige inventaris staan al op het podium.</p>
              </form>
            )}
            {panel === 'select' && (
              <>
                <div className="stage-selection-actions">
                  <button aria-pressed={multi} onClick={() => setMulti(!multi)}>
                    Meervoudig selecteren {multi ? 'aan' : 'uit'}
                  </button>
                  <button onClick={() => chooseFixtures(show.fixtures.map((f) => f.id))}>Alle lampen</button>
                  <button onClick={() => chooseFixtures([])}>Selectie wissen</button>
                </div>
                <label>
                  Selecteer een groep
                  <select
                    value=""
                    onChange={(e) =>
                      chooseFixtures(show.fixtures.filter((f) => f.groupId === e.target.value).map((f) => f.id))
                    }
                  >
                    <option value="" disabled>
                      Kies een groep…
                    </option>
                    {show.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Zoek op naam
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Lamp of bandlid…"
                  />
                </label>
                <div className="stage-object-list">
                  {show.fixtures
                    .filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
                    .map((f) => (
                      <label key={f.id}>
                        <input type="checkbox" checked={selected.includes(f.id)} onChange={() => toggleFixture(f.id)} />
                        {f.name}
                      </label>
                    ))}
                  {members
                    .filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
                    .map((m) => (
                      <button key={m.id} aria-pressed={m.id === selectedMember} onClick={() => chooseMember(m.id)}>
                        ♟ {m.name}
                      </button>
                    ))}
                </div>
              </>
            )}
            {panel === 'view' && (
              <>
                <h3>Podiumaanduidingen</h3>
                <label className="stage-ring-toggle">
                  <input
                    type="checkbox"
                    checked={showGroupRings}
                    onChange={(event) => setShowGroupRings(event.target.checked)}
                  />
                  Groepsringen tonen
                </label>
                <p>Alleen de podiumkaart. Binnenkleur = lamptype; witte rand = selectie.</p>
                <h3>Camerastandpunt simulatie</h3>
                <div className="preset-row">
                  {stageCameraPresets.map((preset) => (
                    <button
                      key={preset.label}
                      aria-pressed={matchesStageCamera(show.camera, preset.camera)}
                      onClick={() =>
                        change({
                          ...show,
                          camera: {
                            ...preset.camera,
                            position: [...preset.camera.position],
                            target: [...preset.camera.target],
                          },
                        })
                      }
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {panel === 'groups' && (
              <>
                <h3>Groepen beheren</h3>
                {show.groups.map((g) => (
                  <label className="stage-group" key={g.id}>
                    Groepsnaam ({show.fixtures.filter((f) => f.groupId === g.id).length} lampen)
                    <input
                      key={g.name}
                      aria-label={'Groepsnaam ' + g.name}
                      defaultValue={g.name}
                      maxLength={80}
                      onBlur={(e) => {
                        const name = e.currentTarget.value.trim()
                        if (name && name !== g.name)
                          change({
                            ...show,
                            groups: show.groups.map((item) => (item.id === g.id ? { ...item, name } : item)),
                          })
                        else e.currentTarget.value = g.name
                      }}
                    />
                  </label>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!groupName.trim() || show.groups.length >= 256) return
                    const id = crypto.randomUUID()
                    change({
                      ...show,
                      groups: [...show.groups, { id, name: groupName.trim(), intensity: 1 }],
                      fixtures: show.fixtures.map((f) => (ids.includes(f.id) ? { ...f, groupId: id } : f)),
                    })
                    setGroupName('')
                  }}
                >
                  <label>
                    Nieuwe groep
                    <input
                      value={groupName}
                      maxLength={80}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder="Bijvoorbeeld wash links"
                    />
                  </label>
                  <button disabled={!groupName.trim() || show.groups.length >= 256}>
                    {ids.length ? `Maak groep met ${ids.length} lampen` : 'Maak lege groep'}
                  </button>
                  {show.groups.length >= 256 && <p role="status">Maximum van 256 groepen bereikt.</p>}
                </form>
              </>
            )}
          </div>
        )}
        {!member && !selection.length ? (
          !panel && (
            <div className="stage-empty-selection">
              <h3>Jouw podium</h3>
              <p>Klik op een lamp of bandlid om het te bewerken.</p>
              <p className="stage-help">
                Selecteer meerdere lampen om hun hoogte, richting en groep tegelijk aan te passen.
              </p>
            </div>
          )
        ) : (
          <>
            <p className="section-label">JE SELECTIE</p>
            <h3>{member ? member.name : selection.length === 1 ? selection[0].name : `${selection.length} lampen`}</h3>
            {member ? (
              <>
                <label>
                  Naam of instrument
                  <input
                    key={member.id + member.name}
                    defaultValue={member.name}
                    maxLength={80}
                    onBlur={(e) => {
                      const name = e.currentTarget.value.trim()
                      if (name && name !== member.name)
                        change({ ...show, bandMembers: members.map((m) => (m.id === member.id ? { ...m, name } : m)) })
                      else e.currentTarget.value = member.name
                    }}
                  />
                </label>
                <p className="stage-help">
                  Sleep het bandlid naar de juiste plek. Om het uit te lichten: selecteer lampen en kies ‘Richt op
                  bandlid’.
                </p>
                <button
                  onClick={() => {
                    change({ ...show, bandMembers: members.filter((m) => m.id !== member.id) })
                    selectMember(undefined)
                  }}
                >
                  Bandlid verwijderen
                </button>
              </>
            ) : (
              <>
                {selection.length === 1 && (
                  <label>
                    Naam
                    <input
                      key={selection[0].id + selection[0].name}
                      maxLength={80}
                      defaultValue={selection[0].name}
                      onBlur={(e) => {
                        const name = e.currentTarget.value.trim()
                        if (name && name !== selection[0].name)
                          change({
                            ...show,
                            fixtures: show.fixtures.map((f) => (f.id === ids[0] ? { ...f, name } : f)),
                          })
                        else e.currentTarget.value = selection[0].name
                      }}
                    />
                  </label>
                )}
                <label className="stage-property">
                  Hoogte
                  <select
                    value={height}
                    onChange={(e) =>
                      change({ ...show, fixtures: setFixtureHeight(show.fixtures, ids, Number(e.target.value)) })
                    }
                  >
                    {!height && (
                      <option value="" disabled>
                        Gemengd
                      </option>
                    )}
                    {height && !['0.25', '1', '2', '3', '4.5'].includes(height) && (
                      <option value={height}>{height} m (eigen hoogte)</option>
                    )}
                    <option value="0.25">Vloer</option>
                    <option value="1">1 meter</option>
                    <option value="2">2 meter</option>
                    <option value="3">3 meter</option>
                    <option value="4.5">Truss</option>
                  </select>
                </label>
                <label className="stage-property">
                  Toewijzen aan groep
                  <select
                    value={group}
                    onChange={(e) =>
                      change({
                        ...show,
                        fixtures: show.fixtures.map((f) =>
                          ids.includes(f.id) ? { ...f, groupId: e.target.value } : f,
                        ),
                      })
                    }
                  >
                    {!group && (
                      <option value="" disabled>
                        Gemengd
                      </option>
                    )}
                    {show.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button onClick={() => openPanel('groups')}>Nieuwe groep met selectie…</button>
                {selection.length >= 2 && (
                  <details>
                    <summary>Uitlijnen en verdelen</summary>
                    <div className="preset-row">
                      <button onClick={() => change({ ...show, fixtures: alignFixtures(show.fixtures, ids, 'x') })}>
                        Zelfde X-positie
                      </button>
                      <button onClick={() => change({ ...show, fixtures: alignFixtures(show.fixtures, ids, 'z') })}>
                        Zelfde Y-positie (bovenaanzicht)
                      </button>
                      <button
                        disabled={selection.length < 3}
                        onClick={() => change({ ...show, fixtures: distributeFixtures(show.fixtures, ids) })}
                      >
                        Gelijke afstand links–rechts
                      </button>
                      <button
                        disabled={selection.length < 3}
                        onClick={() => change({ ...show, fixtures: distributeFixtures(show.fixtures, ids, 'z') })}
                      >
                        Gelijke afstand voor–achter
                      </button>
                    </div>
                    <p className="stage-help">
                      Uitlijnen: vanaf 2 lampen, op de gemiddelde positie van je selectie. X = links–rechts, Y =
                      voor–achter in dit bovenaanzicht; hoogte blijft behouden.
                    </p>
                    <p className="stage-help">
                      Verdelen: vanaf 3 lampen. De buitenste lampen blijven staan; de rest komt gelijkmatig ertussen.
                      Staan ze op die as op dezelfde plek, verplaats dan eerst een buitenste lamp.
                    </p>
                  </details>
                )}
                {!!aimable.length && (
                  <>
                    <h3>Richting</h3>
                    <p className="stage-aim-status">
                      {commonPreset && (
                        <span className="aim-status-arrow" aria-hidden="true">
                          {commonPreset.icon}
                        </span>
                      )}
                      {directionLabel}
                    </p>
                    <AimIndicator fixtures={aimable} />
                    <label className="stage-property">
                      Zijde kiezen
                      <select
                        value={aimSide}
                        onChange={(e) => setAimSideChoice({ selection: selectionKey, side: e.target.value as AimSide })}
                      >
                        {Object.entries(aimSides).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="stage-aim-presets">
                      {aimPresets
                        .filter((p) => presetSide(p) === aimSide)
                        .map((p) => (
                          <button
                            key={p.id}
                            title={p.detail}
                            aria-pressed={aimable.every((f) => matchesAimPreset(f, p))}
                            onClick={() => {
                              setTool({ kind: 'select' })
                              change({ ...show, fixtures: aimFixtures(show.fixtures, aimIds, p) })
                            }}
                          >
                            <span aria-hidden="true">{p.icon}</span>
                            <span>{p.label}</span>
                          </button>
                        ))}
                    </div>
                    <p className="stage-help">
                      Links en rechts gezien vanuit de zaal. Kies een richting om toe te passen; alleen een zijde kiezen
                      verandert niets.
                    </p>
                    <button
                      disabled={!members.length}
                      aria-pressed={tool.kind === 'member'}
                      onClick={() => {
                        setTool({ kind: 'member', ids: aimIds })
                        setPanel(undefined)
                      }}
                    >
                      Richt op bandlid
                    </button>
                    {!members.length && <p className="stage-help">Voeg eerst iemand toe via ‘Bandlid toevoegen’.</p>}
                    <details>
                      <summary>Geavanceerd: doelpunt op vloer</summary>
                      <p className="stage-help">Bundels komen samen op één vloerpositie.</p>
                      <button
                        aria-pressed={tool.kind === 'floor'}
                        onClick={() => setTool({ kind: 'floor', ids: aimIds })}
                      >
                        Klik een doelpunt
                      </button>
                      <button onClick={() => aimFloor(0, 0, aimIds)}>Podium midden</button>
                    </details>
                  </>
                )}
                {aimable.length !== selection.length && (
                  <p className="stage-help">
                    {aimable.length
                      ? `De hazer heeft geen lichtbundel. Richting geldt alleen voor de ${aimable.length} geselecteerde lampen.`
                      : 'De hazer heeft geen lichtbundel en dus geen richtinstellingen.'}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </aside>
    </section>
  )
}
