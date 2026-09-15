import { useState, type CSSProperties } from 'react'
import { bindingAtSlot, canAssignBinding, getControlSurfaceProfile } from './control-surface'
import type { ControlBinding, RuntimeMode, RuntimeState, ShowDocument } from './domain'
import './LiveControlSurface.css'
import { CommitRange } from './CommitRange'
import { safetyLabel } from './CoverageStatus'

const modes: Record<RuntimeMode, string> = { automation: 'Show hervatten', static: 'Beeld vasthouden', safety: 'Alleen frontlicht', blackout: 'Volledige blackout' }

/** Resolve only supported, currently placed actions; stale or hidden assignments never execute. */
export function liveBindingAvailable(show: ShowDocument, binding?: ControlBinding): binding is ControlBinding {
  const profile = getControlSurfaceProfile(show.controlSurface.profileId)
  if (!binding?.slot || !profile || !canAssignBinding(binding, binding.slot, profile)) return false
  switch (binding.action) {
    case 'look': return show.looks.some(item => item.id === binding.targetId)
    case 'color-lock': return binding.targetId === undefined || show.colorProfiles.some(item => item.id === binding.targetId)
    case 'group-intensity': return show.groups.some(item => item.id === binding.targetId)
    case 'mode': return Object.hasOwn(modes, binding.targetId ?? '')
    default: return false
  }
}

interface Props {
  runtimeSession?: boolean
  disabled?: boolean
  show: ShowDocument
  state: RuntimeState
  modified: boolean
  linkedGroups: string[]
  onLook: (id: string) => void
  onMode: (mode: RuntimeMode) => void
  onColor: (id?: string) => void
  onIntensity: (id: string, value: number) => void
  onConfigure: () => void
}

export function LiveControlSurface({ show, state, modified, linkedGroups, onLook, onMode, onColor, onIntensity, onConfigure, runtimeSession = false, disabled = false }: Props) {
  const [bank, setBank] = useState(1)
  const profile = getControlSurfaceProfile(show.controlSurface.profileId)
  const activeBank = Math.min(bank, profile?.banks ?? 1)
  const surface = show.controlSurface
  function execute(binding?: ControlBinding) {
    if (!liveBindingAvailable(show, binding)) return
    if (binding.action === 'look') onLook(binding.targetId!)
    else if (binding.action === 'mode') onMode(binding.targetId as RuntimeMode)
    else if (binding.action === 'color-lock') onColor(binding.targetId)
  }
  return <section className="live-surface" aria-label="WING schermbediening">
    <header><div><p className="section-label">SCHERMBEDIENING</p><h2>{profile?.name ?? 'Bedieningspaneel'}</h2></div><button onClick={onConfigure}>Indeling wijzigen</button></header>
    {!profile ? <p>Geen ondersteunde indeling gekozen. Kies je paneel in Setup.</p> : <>
      <label className="live-bank-picker">Bank<select aria-label="Live WING bank" value={activeBank} onChange={event => setBank(Number(event.target.value))}>{Array.from({ length: profile.banks }, (_, index) => <option key={index} value={index + 1}>Bank {index + 1}{surface.bankNames?.[String(index + 1)] ? ` · ${surface.bankNames[String(index + 1)]}` : ''}</option>)}</select></label>
      {!surface.bindings.some(binding => binding.slot?.bank === activeBank && liveBindingAvailable(show, binding)) && <p className="muted">Deze bank is leeg. Kies ‘Indeling wijzigen’ om Looks, kleuren en groepsmasters toe te wijzen.</p>}
      <div className="live-surface-buttons" style={{ '--surface-columns': profile.buttonColumns } as CSSProperties}>
        {Array.from({ length: profile.buttons }, (_, index) => {
          const binding = bindingAtSlot(surface, { bank: activeBank, kind: 'button', index: index + 1 })
          const enabled = liveBindingAvailable(show, binding)
          const active = enabled && (binding.action === 'mode' ? binding.targetId === state.mode : binding.action === 'color-lock' ? binding.targetId === state.colorLockId : binding.action === 'look' && binding.targetId === state.activeLookId && state.mode === 'automation' && !modified && !state.colorLockId)
          const look = binding?.action === 'look' ? show.looks.find(item => item.id === binding.targetId) : undefined
          const palette = show.colorProfiles.find(item => item.id === (look?.colorProfileId ?? (binding?.action === 'color-lock' ? binding.targetId : undefined)))
          return <button key={index} className={`live-surface-key${binding?.targetId === 'blackout' && binding.action === 'mode' ? ' is-blackout' : ''}`} aria-label={`Live knop ${index + 1}: ${binding?.label ?? 'Niet toegewezen'}`} aria-pressed={active} disabled={!enabled || disabled} onClick={() => execute(binding)} style={{ '--key-color': palette?.primary ?? '#91baff' } as CSSProperties}>
            <small>B{index + 1} · {binding?.action === 'look' ? 'Look' : binding?.action === 'color-lock' ? 'Kleur' : binding?.action === 'mode' ? 'Show' : 'Vrij'}</small>
            <strong>{binding?.label ?? 'Niet toegewezen'}</strong>
            <small>{binding && !enabled ? 'Niet beschikbaar' : binding?.action === 'mode' ? binding.targetId === 'safety' ? safetyLabel(show) : modes[binding.targetId as RuntimeMode] : active ? 'Actief' : '\u00a0'}</small>
          </button>
        })}
      </div>
      {state.colorLockId && <p className="live-color-lock">Kleur vastgezet: {show.colorProfiles.find(item => item.id === state.colorLockId)?.name ?? 'Onbekend'} <button disabled={disabled} onClick={() => onColor(undefined)}>Volg Lookkleur</button></p>}
      {profile.rotaries > 0 && <div className="live-surface-rotaries">{Array.from({ length: profile.rotaries }, (_, index) => {
        const binding = bindingAtSlot(surface, { bank: activeBank, kind: 'rotary', index: index + 1 })
        const enabled = liveBindingAvailable(show, binding)
        const group = enabled ? show.groups.find(item => item.id === binding.targetId) : undefined
        const value = Math.round((group?.intensity ?? 0) * 100)
        return <label className="live-surface-rotary" key={index}>
          <span>R{index + 1} · {binding?.label ?? 'Niet toegewezen'}</span>
          <span className="live-dial" aria-hidden="true"><i style={{ transform: `rotate(${-135 + value * 2.7}deg)` }} /></span>
          <output>{group ? `${value}%${linkedGroups.includes(group.id) ? ' · gelinkt' : ''}` : '—'}</output>
          {runtimeSession ? <CommitRange key={`${activeBank}:${binding?.id}`} aria-label={`Live draaiknop ${index + 1}: ${binding?.label ?? 'Niet toegewezen'}`} disabled={!group || disabled} min="0" max="100" step="1" value={value} onCommit={value => { if (group) onIntensity(group.id, value / 100) }} /> : <input type="range" aria-label={`Live draaiknop ${index + 1}: ${binding?.label ?? 'Niet toegewezen'}`} aria-valuetext={`${value} procent`} disabled={!group || disabled} min="0" max="100" step="1" value={value} onChange={event => { if (group) onIntensity(group.id, Number(event.target.value) / 100) }} />}
        </label>
      })}</div>}
      <details><summary>Hoe werkt deze bediening?</summary><p>Dezelfde opgeslagen indeling als in Setup. Een Look start de show en wist groepsafwijkingen en de kleurvergrendeling; groepslinks blijven behouden. Kleuren gelden voor groepen die de Lookkleur volgen. {runtimeSession ? 'Draaiknoppen wijzigen groepsmasters alleen in de runtimesessie; je opgeslagen show blijft intact.' : 'Draaiknoppen bewaren groepsmasters in de show; gelinkte groepen volgen mee.'} Bedien de schuif onder een draaiknop met muis, aanraking of pijltjestoetsen.</p><p>{runtimeSession ? 'Dit bedient de lokale runtime, zonder fysieke lichtoutput.' : 'Dit bedient de simulatie;'} Er is geen verbinding of synchronisatie met een fysieke WING.</p></details>
    </>}
  </section>
}
