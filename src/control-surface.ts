import { wingProfiles } from './adapters'
import type { ControlBinding, ControlSlot, ControlSurfaceLayout, ShowDocument } from './domain'

/** Logical surface capacity, not a MIDI/OSC address mapping or hardware configuration. */
export interface ControlSurfaceProfile {
  id: string
  name: string
  rotaryMode: 'absolute' | 'relative'
  banks: number
  buttons: number
  rotaries: number
  buttonColumns: number
}
export const controlSurfaceProfiles: readonly ControlSurfaceProfile[] = wingProfiles
export function getControlSurfaceProfile(id: string) {
  return controlSurfaceProfiles.find((profile) => profile.id === id)
}
export const slotKey = (slot: ControlSlot) => `${slot.bank}:${slot.kind}:${slot.index}`
export function bindingAtSlot(surface: ControlSurfaceLayout, slot: ControlSlot) {
  return surface.bindings.find((binding) => binding.slot && slotKey(binding.slot) === slotKey(slot))
}

export function isControlSlot(value: unknown): value is ControlSlot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const slot = value as Record<string, unknown>
  return (
    Object.keys(slot).length === 3 &&
    ['bank', 'kind', 'index'].every((key) => Object.hasOwn(slot, key)) &&
    (slot.kind === 'button' || slot.kind === 'rotary') &&
    typeof slot.bank === 'number' &&
    Number.isInteger(slot.bank) &&
    slot.bank >= 1 &&
    slot.bank <= 64 &&
    typeof slot.index === 'number' &&
    Number.isInteger(slot.index) &&
    slot.index >= 1 &&
    slot.index <= 64
  )
}

export function canAssignBinding(binding: ControlBinding, slot: ControlSlot, profile?: ControlSurfaceProfile): boolean {
  if (!isControlSlot(slot)) return false
  const compatible =
    binding.action === 'group-intensity'
      ? slot.kind === 'rotary'
      : ['look', 'mode', 'color-lock'].includes(binding.action) && slot.kind === 'button'
  return (
    compatible &&
    (!profile ||
      (slot.bank <= profile.banks && slot.index <= (slot.kind === 'button' ? profile.buttons : profile.rotaries)))
  )
}

function validateBindingTarget(show: ShowDocument, binding: ControlBinding) {
  if (
    typeof binding.id !== 'string' ||
    !binding.id.trim() ||
    binding.id.length > 1024 ||
    typeof binding.label !== 'string' ||
    !binding.label.trim() ||
    binding.label.length > 1024
  )
    throw new Error('Kies een geldige naam en ID voor de bediening.')
  if (binding.action === 'look' && show.looks.some((look) => look.id === binding.targetId)) return
  if (binding.action === 'group-intensity' && show.groups.some((group) => group.id === binding.targetId)) return
  if (binding.action === 'mode' && ['automation', 'static', 'safety', 'blackout'].includes(binding.targetId ?? ''))
    return
  if (
    binding.action === 'color-lock' &&
    (binding.targetId === undefined || show.colorProfiles.some((profile) => profile.id === binding.targetId))
  )
    return
  throw new Error('De bediening verwijst naar een ontbrekende of niet-ondersteunde actie.')
}

function unassigned(binding: ControlBinding): ControlBinding {
  const { slot: _slot, ...retained } = binding
  return retained
}

/** Existing IDs move; new IDs copy a catalog action. Occupied moves swap, without deleting bindings. */
export function assignControlBinding(show: ShowDocument, binding: ControlBinding, slot: ControlSlot): ShowDocument {
  const surface = show.controlSurface
  const profile = getControlSurfaceProfile(surface.profileId)
  if (!profile) throw new Error('Dit bedieningspaneel heeft nog geen ondersteunde indeling.')
  validateBindingTarget(show, binding)
  if (!canAssignBinding(binding, slot, profile))
    throw new Error('Deze actie past niet op deze knop of draaiknop in de gekozen bank.')
  const previous = surface.bindings.find((item) => item.id === binding.id)
  if (!previous && surface.bindings.length >= 512)
    throw new Error('Maximum 512 bedieningen. Verwijder eerst een ongebruikte bediening.')
  const occupied = bindingAtSlot(surface, slot)
  if (occupied && occupied.id !== binding.id && previous?.slot && !canAssignBinding(occupied, previous.slot, profile))
    throw new Error('Deze bedieningen kunnen niet wisselen: de oude positie is niet geschikt voor de andere actie.')
  const assigned = { ...binding, slot: { ...slot } }
  const bindings = surface.bindings.map((item) => {
    if (item.id === binding.id) return assigned
    if (item.id === occupied?.id) return previous?.slot ? { ...item, slot: { ...previous.slot } } : unassigned(item)
    return item
  })
  if (!previous) bindings.push(assigned)
  return { ...show, controlSurface: { ...surface, bindings } }
}

export function moveControlBinding(show: ShowDocument, bindingId: string, slot: ControlSlot): ShowDocument {
  const binding = show.controlSurface.bindings.find((item) => item.id === bindingId)
  if (!binding) throw new Error('Deze bediening bestaat niet meer.')
  return assignControlBinding(show, binding, slot)
}

/** Clear the physical slot, preserving the action in the unassigned list for recovery. */
export function clearControlSlot(show: ShowDocument, slot: ControlSlot): ShowDocument {
  const binding = bindingAtSlot(show.controlSurface, slot)
  if (!binding) return show
  return {
    ...show,
    controlSurface: {
      ...show.controlSurface,
      bindings: show.controlSurface.bindings.map((item) => (item.id === binding.id ? unassigned(item) : item)),
    },
  }
}

export function renameControlBank(show: ShowDocument, bank: number, name: string): ShowDocument {
  if (!Number.isInteger(bank) || bank < 1 || bank > 64 || typeof name !== 'string' || name.length > 80)
    throw new Error('Kies een geldige banknaam van maximaal 80 tekens.')
  const bankNames = { ...show.controlSurface.bankNames }
  if (name.trim()) bankNames[String(bank)] = name.trim()
  else delete bankNames[String(bank)]
  return { ...show, controlSurface: { ...show.controlSurface, bankNames } }
}
