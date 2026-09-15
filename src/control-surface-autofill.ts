import { getControlSurfaceProfile, slotKey } from './control-surface'
import { resolveLookLayers, type ControlBinding, type ControlSurfaceLayout, type Look, type ShowDocument } from './domain'
import { fixtureProfiles } from './fixtures'
import { evaluatePattern } from './pattern-language'

export type LookCharacter = 'calm' | 'movement' | 'energetic'
export const lookCharacterLabels: Record<LookCharacter, string> = { calm: 'Rustig', movement: 'In beweging', energetic: 'Energiek' }
const characters: LookCharacter[] = ['calm', 'movement', 'energetic']
export interface AutoFillOptions {
  banks: number[]
  grouping: 'order' | 'character'
  mode: 'empty' | 'replace'
  rotaryGroupIds: (string | null)[]
  characterOverrides?: Record<string, LookCharacter>
}
export interface ControlSurfaceFillPlan {
  surface: ControlSurfaceLayout
  banks: Array<{ bank: number; label: string; looks: Array<{ slot: number; lookId: string }>; rotaries: Array<{ slot: number; groupId: string }> }>
  warnings: string[]
  errors: string[]
  displacedCount: number
  placedLookCount: number
}

/** A rig-aware suggestion, not a judgement of the Look's musical character. Names never influence it. */
export function classifyLookCharacter(show: ShowDocument, look: Look): LookCharacter {
  let activity = 0, points = 0
  for (const layer of resolveLookLayers(show, look)) {
    if (layer.mode === 'off' || layer.intensity <= 0 || show.groups.find(group => group.id === layer.groupId)?.intensity === 0) continue
    const count = show.fixtures.filter(fixture => fixture.groupId === layer.groupId
      && fixtureProfiles.find(profile => profile.id === fixture.profileId)?.kind !== 'hazer')
      .reduce((sum, fixture) => sum + (fixture.visualSegments ?? 1), 0)
    if (!count) continue
    points += count
    if (layer.mode === 'static') continue
    const program = show.programs.find(item => item.id === layer.programId)
    if (!program) continue
    let changes = 0
    if (program.pattern) {
      // Sample one cycle including its wrap. Constant recipes stay calm even with many steps.
      const samples = 128, sampledPoints = Math.min(count, 32)
      for (let point = 0; point < sampledPoints; point++) {
        let previous = evaluatePattern(program.pattern, 0, point, count)
        for (let sample = 1; sample <= samples; sample++) {
          const value = evaluatePattern(program.pattern, sample / samples, point, count)
          changes += Math.abs(value - previous) / sampledPoints
          previous = value
        }
      }
    } else {
      changes = { static: 0, pulse: 2, chase: 2, sequence: 2, random: 3, sparkle: 4, wave: 2, build: 2 }[program.effect]
    }
    activity += count * changes / Math.max(.125, layer.rateBeats ?? program.rateBeats)
  }
  const score = points ? activity / points : 0
  return score <= .5 ? 'calm' : score >= 2 ? 'energetic' : 'movement'
}

/** Plans only logical assignments. An error returns the original surface; no partial fill escapes. */
export function planControlSurfaceFill(show: ShowDocument, options: AutoFillOptions): ControlSurfaceFillPlan {
  const original = show.controlSurface, profile = getControlSurfaceProfile(original.profileId)
  const errors: string[] = [], warnings: string[] = []
  const failed = (): ControlSurfaceFillPlan => ({ surface: original, banks: [], errors, warnings, displacedCount: 0, placedLookCount: 0 })
  if (!profile) { errors.push('Dit paneel heeft geen ondersteunde bankindeling.'); return failed() }
  const banks = [...new Set(options.banks)].sort((a, b) => a - b)
  if (!banks.length || banks.some(bank => !Number.isInteger(bank) || bank < 1 || bank > profile.banks)) errors.push(`Kies banken tussen 1 en ${profile.banks}.`)
  if (!['order', 'character'].includes(options.grouping) || !['empty', 'replace'].includes(options.mode)) errors.push('Kies een geldige indeling en vulwijze.')
  if (options.rotaryGroupIds.some((id, index) => id !== null && (index >= profile.rotaries || !show.groups.some(group => group.id === id)))) errors.push('Kies bestaande groepen voor de beschikbare draaiknoppen.')
  if (Object.entries(options.characterOverrides ?? {}).some(([id, value]) => !show.looks.some(look => look.id === id) || !characters.includes(value))) errors.push('Een karakterkeuze verwijst naar een ontbrekende Look of onbekend karakter.')
  if (errors.length) return failed()
  let bindings = original.bindings.map(binding => ({ ...binding, ...(binding.slot ? { slot: { ...binding.slot } } : {}) }))
  const selected = (binding: ControlBinding) => !!binding.slot && banks.includes(binding.slot.bank)
    && binding.slot.index >= 1 && binding.slot.index <= (binding.slot.kind === 'button' ? profile.buttons : profile.rotaries)
  if (options.mode === 'replace') bindings = bindings.map(binding => {
    if (!selected(binding) || binding.slot?.kind !== 'button') return binding
    const { slot: _slot, ...unplaced } = binding
    return unplaced
  })
  const classifications = options.grouping === 'character'
    ? new Map(show.looks.map(look => [look.id, options.characterOverrides?.[look.id] ?? classifyLookCharacter(show, look)]))
    : new Map<string, LookCharacter>()
  const character = (look: Look) => classifications.get(look.id)!
  const existing = new Set(bindings.filter(binding => selected(binding) && binding.slot?.kind === 'button' && binding.action === 'look').map(binding => binding.targetId))
  const remaining = show.looks.filter(look => !existing.has(look.id))
  if (existing.size) warnings.push(`${show.looks.filter(look => existing.has(look.id)).length} Looks staan al in de gekozen banken en worden niet nogmaals toegevoegd.`)
  if (existing.size && options.grouping === 'character') warnings.push('Bestaande Look-knoppen blijven op hun positie: hun bank wordt niet opnieuw op karakter ingedeeld. Kies vervangen om alle Looks opnieuw te groeperen.')
  const newLabels = new Map<number, string>()
  const usedBanks = new Set<number>()
  let serial = 1
  const assign = (action: 'look' | 'group-intensity', targetId: string, label: string, bank: number, index: number) => {
    const slot = { bank, kind: action === 'look' ? 'button' as const : 'rotary' as const, index }
    const occupied = bindings.find(binding => binding.slot && slotKey(binding.slot) === slotKey(slot))
    if (occupied?.action === action && occupied.targetId === targetId) return
    if (occupied) delete occupied.slot
    let binding = bindings.find(item => !item.slot && item.action === action && item.targetId === targetId)
    if (!binding) {
      while (bindings.some(item => item.id === `auto-control-${serial}`)) serial++
      binding = { id: `auto-control-${serial++}`, action, targetId, label }
      bindings.push(binding)
    }
    binding.slot = slot
  }
  const collections = options.grouping === 'order' ? [{ label: 'Looks', looks: remaining }]
    : characters.map(value => ({ label: lookCharacterLabels[value], looks: remaining.filter(look => character(look) === value) }))
  for (const collection of collections) {
    let next = 0
    for (const bank of banks) {
      if (next >= collection.looks.length) break
      if (usedBanks.has(bank)) continue
      const available = Array.from({ length: profile.buttons }, (_, i) => i + 1).filter(index => !bindings.some(binding => binding.slot?.bank === bank && binding.slot.kind === 'button' && binding.slot.index === index))
      if (!available.length) continue
      // A preserved Look from another category must not make the bank's label misleading.
      if (options.grouping === 'character' && bindings.some(binding => selected(binding) && binding.slot?.bank === bank && binding.slot.kind === 'button' && binding.action === 'look'
        && show.looks.some(look => look.id === binding.targetId && lookCharacterLabels[character(look)] !== collection.label))) continue
      for (const index of available) {
        if (next >= collection.looks.length) break
        const look = collection.looks[next++]
        assign('look', look.id, look.name, bank, index)
      }
      usedBanks.add(bank)
      newLabels.set(bank, collection.label)
    }
    if (next < collection.looks.length) errors.push(`Onvoldoende vrije banken voor ${collection.label}: ${collection.looks.length - next} Looks passen niet. Kies meer banken of vervang de gekozen knopindeling.`)
  }
  for (const bank of banks) options.rotaryGroupIds.forEach((groupId, index) => {
    if (groupId === null) return
    const occupied = bindings.find(binding => binding.slot?.bank === bank && binding.slot.kind === 'rotary' && binding.slot.index === index + 1)
    if (options.mode === 'empty' && occupied && (occupied.action !== 'group-intensity' || occupied.targetId !== groupId)) {
      errors.push(`Bank ${bank}, draaiknop ${index + 1} is al anders toegewezen. Kies vervangen of laat deze draaiknop ongewijzigd.`)
      return
    }
    assign('group-intensity', groupId, show.groups.find(group => group.id === groupId)!.name, bank, index + 1)
  })
  if (bindings.length > 512) errors.push('Deze indeling overschrijdt de limiet van 512 bedieningen. Verwijder eerst ongebruikte bedieningen.')
  if (errors.length) return failed()
  const bankNames = { ...original.bankNames }
  for (const [bank, label] of newLabels) if (options.mode === 'replace' || !bankNames[bank]) bankNames[bank] = label
  const surface = { ...original, bindings, bankNames }
  const displacedCount = original.bindings.filter(binding => selected(binding) && !bindings.some(next => next.id === binding.id && next.slot)).length
  return { surface, errors, warnings, displacedCount,
    placedLookCount: show.looks.filter(look => bindings.some(binding => selected(binding) && binding.action === 'look' && binding.targetId === look.id)).length,
    banks: banks.map(bank => ({ bank, label: bankNames[bank] ?? `Bank ${bank}`,
      looks: bindings.filter(binding => selected(binding) && binding.slot?.bank === bank && binding.slot.kind === 'button' && binding.action === 'look').map(binding => ({ slot: binding.slot!.index, lookId: binding.targetId! })).sort((a, b) => a.slot - b.slot),
      rotaries: bindings.filter(binding => selected(binding) && binding.slot?.bank === bank && binding.slot.kind === 'rotary' && binding.action === 'group-intensity').map(binding => ({ slot: binding.slot!.index, groupId: binding.targetId! })).sort((a, b) => a.slot - b.slot),
    })),
  }
}
