import {
  animationEffects,
  animationLabel,
  materializeGroupTiming,
  type ShowDocument,
  type ColorProfile,
  type AutomationProgram,
  type Look,
} from './domain'
import { assertShowDocument } from './show-validation'
import { patternSignature, validatePattern } from './pattern-language'
import { bandDesignLimits } from './band-profile'

export type DesignScope = 'all' | 'colorProfiles' | 'programs' | 'looks'
export interface DesignOptions {
  scope: DesignScope
  profileCount: number
  programCount: number
  lookCount: number
  revision: boolean
  replace?: boolean
}
export interface DesignProposal {
  provider: string
  summary: string
  colorProfiles: ColorProfile[]
  programs: AutomationProgram[]
  looks: Look[]
}
export const designDefaults: DesignOptions = {
  scope: 'all',
  profileCount: 8,
  programCount: 8,
  lookCount: 16,
  revision: false,
}
export const fingerprint = (show: ShowDocument) => JSON.stringify(show)
const selectedCollections = (options: DesignOptions) =>
  ['colorProfiles', 'programs', 'looks'].filter((key) => options.scope === 'all' || options.scope === key) as Array<
    keyof Pick<ShowDocument, 'colorProfiles' | 'programs' | 'looks'>
  >
export function programMaximum(show: ShowDocument, options: DesignOptions) {
  if (options.scope !== 'all' && options.scope !== 'programs') return 0
  const available = options.replace ? 32 : options.revision ? show.programs.length : 32 - show.programs.length
  return Math.min(options.programCount, available)
}
export function designConfigurationError(show: ShowDocument, options: DesignOptions) {
  if (options.replace && options.revision) return 'Vervangen kan niet samen met verfijnen.'
  const labels = { colorProfiles: 'kleurprofielen', programs: 'animaties', looks: 'Looks' }
  let requested = 0
  for (const [key, count] of [
    ['colorProfiles', options.profileCount],
    ['programs', options.programCount],
    ['looks', options.lookCount],
  ] as const) {
    if (options.scope !== 'all' && options.scope !== key) continue
    const max = options.replace || key === 'programs' || !options.revision ? 32 : show[key].length
    const minimum = options.scope === 'all' && !options.replace ? 0 : 1
    if (max === 0 && minimum > 0)
      return `Geen ${labels[key]} beschikbaar om te ${options.revision ? 'verfijnen' : 'toevoegen'}. Kies Volledige reeks vervangen voor een nieuwe collectie.`
    if (!Number.isInteger(count) || count < minimum || count > Math.min(32, max))
      return `Kies ${minimum}–${Math.min(32, max)} ${labels[key]} om te ${options.replace ? 'vervangen' : options.revision ? 'verfijnen' : 'toevoegen'}. ${options.revision ? 'Wil je een grotere nieuwe reeks? Kies Volledige reeks vervangen.' : ''}`
    requested += count
  }
  if (requested === 0) return 'Kies minstens één kleurprofiel, animatie of Look om te maken.'
  return ''
}

function remapId(id: string, oldIds: string[], newIds: string[]) {
  if (!newIds.length) return id
  const index = oldIds.indexOf(id)
  return index < 0 ? id : newIds[index % newIds.length]
}

function remapReplacedReferences(show: ShowDocument, next: ShowDocument, replaced: Set<string>) {
  if (replaced.has('colorProfiles') && next.colorProfiles.length) {
    const old = show.colorProfiles.map((item) => item.id),
      current = next.colorProfiles.map((item) => item.id)
    next.programs = next.programs.map((program) => ({
      ...program,
      defaultColorProfileId: remapId(program.defaultColorProfileId, old, current),
    }))
    next.looks = next.looks.map((look) => ({
      ...look,
      colorProfileId: remapId(look.colorProfileId, old, current),
      layers: look.layers?.map((layer) => ({
        ...layer,
        colorProfileId: layer.colorProfileId === null ? null : remapId(layer.colorProfileId, old, current),
      })),
    }))
    next.controlSurface.bindings = next.controlSurface.bindings.map((binding) =>
      binding.action === 'color-lock' && binding.targetId
        ? { ...binding, targetId: remapId(binding.targetId, old, current) }
        : binding,
    )
  }
  if (replaced.has('programs') && next.programs.length) {
    const old = show.programs.map((item) => item.id),
      current = next.programs.map((item) => item.id)
    next.looks = next.looks.map((look) => ({
      ...look,
      programId: remapId(look.programId, old, current),
      layers: look.layers?.map((layer) => ({
        ...layer,
        programId: layer.programId === null ? null : remapId(layer.programId, old, current),
      })),
    }))
  }
  if (replaced.has('looks')) {
    next.activeLookId = next.looks[0]?.id ?? ''
    next.controlSurface.bindings = next.controlSurface.bindings.filter(
      (binding) => binding.action !== 'look' || next.looks.some((look) => look.id === binding.targetId),
    )
  }
}
export function proposalCandidate(
  show: ShowDocument,
  raw: unknown,
  options: DesignOptions,
  base: string,
): ShowDocument {
  if (fingerprint(show) !== base) throw new Error('De show is gewijzigd. Vraag een nieuw voorstel aan.')
  if (options.replace && options.revision) throw new Error('Vervangen kan niet samen met verfijnen.')
  if (!raw || typeof raw !== 'object') throw new Error('Ongeldig ontwerp ontvangen.')
  const p = raw as DesignProposal
  if (
    typeof p.provider !== 'string' ||
    p.provider.length > 128 ||
    typeof p.summary !== 'string' ||
    p.summary.length > 12000
  )
    throw new Error('Voorstel bevat ongeldige uitleg.')
  const next = structuredClone(
    options.revision && (options.scope === 'programs' || options.scope === 'all') ? materializeGroupTiming(show) : show,
  )
  const counts = { colorProfiles: options.profileCount, programs: options.programCount, looks: options.lookCount }
  if (
    ['colorProfiles', 'programs', 'looks'].reduce(
      (sum, key) => sum + (options.scope === 'all' || options.scope === key ? counts[key as keyof typeof counts] : 0),
      0,
    ) === 0
  )
    throw new Error('Kies minstens één kleurprofiel, animatie of Look om te maken.')
  const replaced = new Set<string>()
  for (const key of ['colorProfiles', 'programs', 'looks'] as const) {
    const list = p[key]
    const selected = options.scope === 'all' || options.scope === key
    if (
      !Array.isArray(list) ||
      (!selected
        ? list.length !== 0
        : key === 'programs'
          ? list.length > programMaximum(show, options) ||
            (programMaximum(show, options) > 0 && list.length === 0) ||
            (options.replace && list.length === 0)
          : list.length !== counts[key])
    )
      throw new Error(`Verkeerd aantal ${key} ontvangen.`)
    if (
      selected &&
      (!Number.isInteger(counts[key]) ||
        counts[key] < (options.scope === 'all' && !options.replace ? 0 : 1) ||
        counts[key] > 32)
    )
      throw new Error(`Kies een aantal van ${options.scope === 'all' && !options.replace ? 0 : 1} tot 32.`)
    const ids = new Set<string>()
    for (const item of list) {
      if (
        !item ||
        typeof item.id !== 'string' ||
        !item.id ||
        typeof item.name !== 'string' ||
        !item.name.trim() ||
        ids.has(item.id)
      )
        throw new Error('Ontwerp bevat lege namen of dubbele IDs.')
      ids.add(item.id)
      const exists = show[key].some((old) => old.id === item.id)
      if (options.revision !== exists)
        throw new Error(
          options.revision ? 'Revisie bevat een onbekend item.' : 'Nieuw ontwerp overschrijft een bestaand item.',
        )
    }
    // Only the selected design collections may change; fixture/control configuration is never accepted from a provider.
    ;(next[key] as Array<ColorProfile | AutomationProgram | Look>) =
      options.replace && selected ? [...list] : [...next[key].filter((item) => !ids.has(item.id)), ...list]
    if (options.replace && selected) replaced.add(key)
    if (!options.replace && options.revision && next[key].length > 32)
      throw new Error(`Maximum 32 ${key}. Kies minder nieuwe items of wijzig bestaande items.`)
  }
  if (options.replace && options.scope !== 'all') remapReplacedReferences(show, next, replaced)
  const hex = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
  for (const c of next.colorProfiles)
    if (
      ![c.primary, c.secondary, c.accent, c.white].every(hex) ||
      !Number.isFinite(c.intensityLimit) ||
      c.intensityLimit < 0 ||
      c.intensityLimit > 1
    )
      throw new Error('Ongeldige kleuren of intensiteit.')
  for (const a of next.programs)
    if (
      !animationEffects.some((effect) => effect.id === a.effect) ||
      !Number.isFinite(a.rateBeats) ||
      a.rateBeats < 0.01 ||
      a.rateBeats > 1024 ||
      !Array.isArray(a.targetGroupIds) ||
      a.targetGroupIds.some((id) => !next.groups.some((g) => g.id === id)) ||
      !next.colorProfiles.some((c) => c.id === a.defaultColorProfileId)
    )
      throw new Error('Animatie bevat een onbekende groep, kleur of ongeldige snelheid.')
  // IDs, names, group targets and legacy duration do not constitute a new pattern.
  // Do not reject old duplicates during unrelated edits; only guard proposed items.
  const proposedIds = new Set(p.programs.map((program) => program.id))
  const bandLimits = bandDesignLimits(show.bandProfile)
  const effects = new Set(
    options.replace ? [] : show.programs.filter((program) => !proposedIds.has(program.id)).map(patternSignature),
  )
  for (const program of p.programs) {
    validatePattern(program.pattern)
    if (program.pattern.steps.length > bandLimits.maxSteps)
      throw new Error(
        'Dit patroon is complexer dan je bandprofiel toestaat. Vraag een nieuw voorstel of pas de complexiteit aan.',
      )
    const signature = patternSignature(program)
    if (effects.has(signature))
      throw new Error(
        `Dubbel patroon: ${animationLabel(program)}. Een andere naam of beatduur maakt geen nieuwe animatie.`,
      )
    if (program.rateBeats !== 1)
      throw new Error(
        'Animaties bevatten alleen het patroon. Stel de beatduur per groep in de Look in (compatibiliteitsveld rateBeats moet 1 zijn).',
      )
    effects.add(signature)
  }
  for (const l of next.looks)
    if (!next.programs.some((a) => a.id === l.programId) || !next.colorProfiles.some((c) => c.id === l.colorProfileId))
      throw new Error('Look verwijst naar een onbekende kleur of animatie.')
  // Stored legacy Looks remain valid, but new model output must describe the complete stage.
  for (const look of p.looks) {
    if (
      !Array.isArray(look.layers) ||
      look.layers.length !== next.groups.length ||
      next.groups.some((group) => !look.layers!.some((layer) => layer?.groupId === group.id))
    )
      throw new Error('Elke voorgestelde Look moet alle groepen precies één keer indelen, ook groepen die uit staan.')
    if (
      look.layers.some(
        (layer) =>
          typeof layer.rateBeats !== 'number' ||
          !Number.isFinite(layer.rateBeats) ||
          layer.rateBeats < 0.125 ||
          layer.rateBeats > 64,
      )
    )
      throw new Error('Elke voorgestelde groep moet een eigen beatduur van 0.125 tot 64 hebben.')
    if (
      look.layers.some(
        (layer) =>
          layer.mode === 'animation' &&
          (layer.rateBeats! < bandLimits.minRateBeats || layer.rateBeats! > bandLimits.maxRateBeats),
      )
    )
      throw new Error(
        'De groepssnelheid past niet bij je bandprofiel. Vraag een nieuw voorstel of kies een andere bewegingssnelheid.',
      )
  }
  const overCapacity = selectedCollections(options).some(
    (key) => !options.replace && !options.revision && next[key].length > 32,
  )
  if (options.replace && options.scope === 'all') {
    next.activeLookId = next.looks[0].id
    // Never retarget a physical button silently to an unrelated replacement item.
    next.controlSurface.bindings = next.controlSurface.bindings.filter(
      (binding) => binding.action !== 'look' && !(binding.action === 'color-lock' && binding.targetId !== undefined),
    )
  }
  if (!overCapacity) assertShowDocument(next)
  const generatedPrograms = new Set(p.programs.map((program) => program.id))
  next.programs = next.programs.map((program) =>
    generatedPrograms.has(program.id) ? { ...program, name: animationLabel(program) } : program,
  )
  if (
    options.revision &&
    (['colorProfiles', 'programs', 'looks'] as const).every((key) =>
      p[key].every(
        (item) =>
          JSON.stringify(next[key].find((updated) => updated.id === item.id)) ===
          JSON.stringify(show[key].find((old) => old.id === item.id)),
      ),
    )
  )
    throw new Error('Het voorstel wijzigt niets. Geef concretere feedback.')
  return next
}
