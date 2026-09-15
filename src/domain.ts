import { evaluatePattern, type Pattern } from './pattern-language'
import type { BandProfile } from './band-profile'
import { applyMinimumCoverage, regieColor } from './show-regie'
export type { BandProfile } from './band-profile'

export const MAX_SHOW_ITEMS = 32

export type LightingProtocol = 'artnet' | 'sacn'
export type RuntimeMode = 'automation' | 'static' | 'safety' | 'blackout'
export type FixtureCapability = 'dimmer' | 'rgb' | 'uv' | 'strobe' | 'haze'

export interface FixtureMode {
  id: string
  name: string
  channels: number
  capabilities: FixtureCapability[]
  verifiedForLiveOutput: boolean
  /** Legacy catalog entry kept readable; requires explicit mode/patch correction. */
  configurationWarning?: string
  /** Whether this personality can address each visual head independently. */
  independentHeads?: boolean
}

export interface FixtureProfile {
  /** Display approximation of a fixed emitter; never a controllable color channel. */
  fixedColor?: string
  id: string
  manufacturer: string
  model: string
  kind: 'par' | 'bar' | 'hazer' | 'theatre-spot'
  modes: FixtureMode[]
}

export interface FixtureDeployment {
  id: string
  name: string
  profileId: string
  modeId: string
  groupId: string
  patch?: { universe: number; address: number }
  position: [number, number, number]
  aim: [number, number, number]
  aimMode?: 'target' | 'direction'
  /** A multi-head physical fixture can expose several separately visualised segments. */
  visualSegments?: number
}

export interface OutputRoute {
  id: string
  universe: number
  protocol: LightingProtocol
  host: string
  enabled: boolean
}

export interface FixtureGroup {
  id: string
  name: string
  intensity: number
}

export interface ColorProfile {
  id: string
  name: string
  primary: string
  secondary: string
  accent: string
  white: string
  intensityLimit: number
}

export const animationEffects = [
  { id: 'static', label: 'Stabiel', description: 'Vaste verlichting zonder beweging.' },
  { id: 'pulse', label: 'Pulse', description: 'Alle doelspots ademen samen in intensiteit.' },
  { id: 'chase', label: 'Afwisselend', description: 'Twee sets spots wisselen elkaar af.' },
  {
    id: 'sequence',
    label: 'Looplicht',
    description: 'Eén lichtpunt loopt van links naar rechts; tempo is een volledige ronde.',
  },
  {
    id: 'random',
    label: 'Willekeurige spots',
    description: 'Elke tempo-interval licht een andere, reproduceerbare selectie op.',
  },
  { id: 'sparkle', label: 'Twinkeling', description: 'Verspreide lichtpuntjes lichten kort en zacht op.' },
  { id: 'wave', label: 'Golf', description: 'Een vloeiende intensiteitsgolf beweegt over de doelspots.' },
  { id: 'build', label: 'Opbouw', description: 'De doelspots vullen van links naar rechts en beginnen opnieuw.' },
] as const
export type AnimationEffect = (typeof animationEffects)[number]['id']

export interface AutomationProgram {
  id: string
  name: string
  effect: AnimationEffect
  targetGroupIds: string[]
  /** Legacy import metadata; new patterns use 1 and Look groups own playback duration. */
  rateBeats: number
  defaultColorProfileId: string
  /** Validated relative composition; overrides the legacy fallback effect. */
  pattern?: Pattern
}

export interface Look {
  id: string
  name: string
  programId: string
  colorProfileId: string
  /** Omitted preserves legacy program targeting; an empty list explicitly turns all groups off. */
  layers?: LookLayer[]
}

export interface LookLayer {
  groupId: string
  mode: 'animation' | 'static' | 'off'
  programId: string | null
  /** Null follows the Look palette and color lock; a fixed palette does not. */
  colorProfileId: string | null
  intensity: number
  /** Explicit group duration. Null/omitted is supported only for legacy import. */
  rateBeats?: number | null
  /** Positive delays the ongoing circular pattern; negative advances it. */
  offsetBeats?: number
}

export function animationLabel(program: AutomationProgram) {
  if (program.pattern && program.name.trim()) return program.name
  return animationEffects.find((effect) => effect.id === program.effect)?.label ?? program.effect
}

export function resolveLookLayers(show: ShowDocument, look: Look): LookLayer[] {
  const legacyProgram = show.programs.find((program) => program.id === look.programId)
  return show.groups.map((group) => {
    if (look.layers !== undefined) {
      const layer = look.layers.find((layer) => layer.groupId === group.id)
      if (!layer)
        return {
          groupId: group.id,
          mode: 'off',
          programId: null,
          colorProfileId: null,
          intensity: 1,
          rateBeats: 1,
          offsetBeats: 0,
        }
      return {
        ...layer,
        rateBeats: layer.rateBeats ?? show.programs.find((program) => program.id === layer.programId)?.rateBeats ?? 1,
        offsetBeats: layer.offsetBeats ?? 0,
      }
    }
    const targeted = legacyProgram?.targetGroupIds.includes(group.id)
    return {
      groupId: group.id,
      mode: !targeted ? 'off' : legacyProgram?.effect === 'static' && !legacyProgram.pattern ? 'static' : 'animation',
      programId:
        targeted && legacyProgram && (legacyProgram.effect !== 'static' || legacyProgram.pattern)
          ? legacyProgram.id
          : null,
      colorProfileId: null,
      intensity: 1,
      rateBeats: legacyProgram?.rateBeats ?? 1,
      offsetBeats: 0,
    }
  })
}

/** Snapshot legacy timing before editing patterns; preserve IDs, targeting and saved history. */
export function materializeGroupTiming(show: ShowDocument): ShowDocument {
  let changed = false
  const looks = show.looks.map((look) => {
    const layers = resolveLookLayers(show, look)
    if (JSON.stringify(layers) === JSON.stringify(look.layers)) return look
    changed = true
    return { ...look, layers }
  })
  return changed ? { ...show, looks } : show
}

export type ControlActionType = 'look' | 'mode' | 'group-intensity' | 'tap-tempo' | 'color-lock' | 'follow'
export interface ControlSlot {
  bank: number
  kind: 'button' | 'rotary'
  index: number
}
export interface ControlBinding {
  id: string
  label: string
  action: ControlActionType
  targetId?: string
  slot?: ControlSlot
}
export interface ControlSurfaceLayout {
  profileId: string
  bindings: ControlBinding[]
  bankNames?: Record<string, string>
}
export interface SyncStrategy {
  source: 'direct-audio' | 'midi-clock' | 'tap-tempo'
  audioDeviceName: string
  lightingOffsetMs: number
}
export interface SimulationCamera {
  position: [number, number, number]
  target: [number, number, number]
  fov: number
}
export interface BandMember {
  id: string
  name: string
  position: [number, number, number]
}

export interface ShowDocument {
  regie?: import('./show-regie').ShowRegie
  schemaVersion: 1
  name: string
  fixtures: FixtureDeployment[]
  bandMembers?: BandMember[]
  bandProfile?: BandProfile
  groups: FixtureGroup[]
  routes: OutputRoute[]
  colorProfiles: ColorProfile[]
  programs: AutomationProgram[]
  looks: Look[]
  activeLookId: string
  controlSurface: ControlSurfaceLayout
  sync: SyncStrategy
  camera: SimulationCamera
}

export interface RuntimeState {
  mode: RuntimeMode
  activeLookId: string
  colorLockId?: string
  heldAtBeats?: number
}

export interface EvaluatedFixture {
  fixtureId: string
  intensity: number
  color: string
  haze: number
  /** Independent visual heads; aggregate intensity is their mean for legacy consumers. */
  segments?: Array<{ intensity: number; color: string }>
}

export interface EvaluatedFrame {
  atBeats: number
  mode: RuntimeMode
  fixtures: EvaluatedFixture[]
}

export interface ValidationIssue {
  severity: 'error' | 'warning'
  path: string
  message: string
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))

function isValidColor(color: string) {
  return /^#[0-9a-fA-F]{6}$/.test(color)
}

export function getFixtureMode(profile: FixtureProfile, modeId: string) {
  return profile.modes.find((mode) => mode.id === modeId)
}

export function validateShow(show: ShowDocument, profiles: FixtureProfile[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const collections: Array<[string, { length: number }]> = [
    ['colorProfiles', show.colorProfiles],
    ['programs', show.programs],
    ['looks', show.looks],
  ]

  for (const [name, collection] of collections) {
    if (collection.length > MAX_SHOW_ITEMS) {
      issues.push({ severity: 'error', path: name, message: `Maximum ${MAX_SHOW_ITEMS} items toegestaan.` })
    }
  }

  const rangesByUniverse = new Map<number, Array<{ fixture: FixtureDeployment; end: number }>>()
  for (const fixture of show.fixtures) {
    const profile = profiles.find((candidate) => candidate.id === fixture.profileId)
    const mode = profile && getFixtureMode(profile, fixture.modeId)
    if (!profile || !mode) {
      issues.push({
        severity: 'error',
        path: `fixtures.${fixture.id}`,
        message: 'Onbekend fixtureprofiel of DMX-modus.',
      })
      continue
    }
    if (mode.configurationWarning) {
      issues.push({ severity: 'error', path: `fixtures.${fixture.id}.mode`, message: mode.configurationWarning })
    }
    if (!fixture.patch) continue
    if (fixture.patch.universe < 1 || fixture.patch.address < 1 || fixture.patch.address > 512) {
      issues.push({
        severity: 'error',
        path: `fixtures.${fixture.id}.patch`,
        message: 'Universe en DMX-adres moeten geldig zijn.',
      })
      continue
    }
    const end = fixture.patch.address + mode.channels - 1
    if (end > 512) {
      issues.push({
        severity: 'error',
        path: `fixtures.${fixture.id}.patch`,
        message: 'DMX-modus valt buiten kanaal 512.',
      })
      continue
    }
    const ranges = rangesByUniverse.get(fixture.patch.universe) ?? []
    for (const range of ranges) {
      if (fixture.patch.address <= range.end && end >= range.fixture.patch!.address) {
        issues.push({
          severity: 'error',
          path: `fixtures.${fixture.id}.patch`,
          message: `DMX-overlap met ${range.fixture.name}.`,
        })
      }
    }
    ranges.push({ fixture, end })
    rangesByUniverse.set(fixture.patch.universe, ranges)
    if (!mode.verifiedForLiveOutput) {
      issues.push({
        severity: 'warning',
        path: `fixtures.${fixture.id}.mode`,
        message: 'DMX-modus is nog niet fysiek geverifieerd.',
      })
    }
  }

  for (const route of show.routes.filter((candidate) => candidate.enabled)) {
    const duplicates = show.routes.filter((candidate) => candidate.enabled && candidate.universe === route.universe)
    if (duplicates.length > 1) {
      issues.push({
        severity: 'error',
        path: `routes.${route.id}`,
        message: `Universe ${route.universe} heeft meer dan één actieve outputroute.`,
      })
    }
  }

  for (const profile of show.colorProfiles) {
    if (![profile.primary, profile.secondary, profile.accent, profile.white].every(isValidColor)) {
      issues.push({
        severity: 'error',
        path: `colorProfiles.${profile.id}`,
        message: 'Een kleurprofiel bevat een ongeldige hex-kleur.',
      })
    }
  }
  return issues
}

export function outputCanBeArmed(show: ShowDocument, profiles: FixtureProfile[]) {
  return validateShow(show, profiles).every((issue) => issue.severity !== 'error')
}

export function applyAbsoluteRotary(current: number, incoming: number, pickup: boolean, threshold = 0.04) {
  const normalized = clamp(incoming)
  if (!pickup && Math.abs(normalized - current) > threshold) return { value: current, pickup: false }
  return { value: normalized, pickup: true }
}

function selected(show: ShowDocument, state: RuntimeState) {
  const look = show.looks.find((item) => item.id === state.activeLookId) ?? show.looks[0]
  const program = look && show.programs.find((item) => item.id === look.programId)
  const profileId = state.colorLockId ?? look?.colorProfileId ?? program?.defaultColorProfileId
  const profile = show.colorProfiles.find((item) => item.id === profileId) ?? show.colorProfiles[0]
  return { look, program, profile }
}

// Integer hashing makes random patterns reproducible when seeking, freezing or comparing previews.
function patternHash(seed: string, cycle: number, point: number) {
  let hash = 2166136261
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  hash = Math.imul(hash ^ cycle, 16777619)
  hash = Math.imul(hash ^ point, 16777619)
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  return (hash ^ (hash >>> 13)) >>> 0
}

function patternLevel(effect: AnimationEffect, phase: number, point: number, count: number, seed: string) {
  const cycle = Math.floor(phase)
  const progress = phase - cycle
  switch (effect) {
    case 'sequence':
      return point === Math.min(count - 1, Math.floor(progress * count)) ? 1 : 0
    case 'build':
      return point <= Math.min(count - 1, Math.floor(progress * count)) ? 1 : 0
    case 'wave':
      return 0.08 + 0.92 * ((1 + Math.cos(2 * Math.PI * (progress - point / count))) / 2) ** 2
    case 'random':
    case 'sparkle': {
      const selected =
        point === patternHash(seed, cycle, -1) % count ||
        patternHash(seed, cycle, point) / 2 ** 32 < (effect === 'random' ? 0.22 : 0.08)
      return selected ? (effect === 'sparkle' ? Math.sin(Math.PI * progress) ** 4 : 1) : 0
    }
    default:
      return 1
  }
}

export function evaluateFrame(
  show: ShowDocument,
  profiles: FixtureProfile[],
  state: RuntimeState,
  atBeats: number,
): EvaluatedFrame {
  if (state.mode === 'blackout') {
    return {
      atBeats,
      mode: state.mode,
      fixtures: show.fixtures.map((fixture) => ({ fixtureId: fixture.id, intensity: 0, color: '#000000', haze: 0 })),
    }
  }
  const { look, program: legacyProgram, profile: globalProfile } = selected(show, state)
  const phaseAt = state.mode === 'static' ? (state.heldAtBeats ?? atBeats) : atBeats
  const safetyGroups = new Set(show.regie?.safetyGroupIds ?? ['front'])
  // Safety stays independent of creative layers, including their fixed palettes and intensity.
  const layers = look?.layers !== undefined && state.mode !== 'safety' ? resolveLookLayers(show, look) : undefined
  const layersByGroup = new Map(layers?.map((layer) => [layer.groupId, layer]))
  const programsById = new Map(show.programs.map((program) => [program.id, program]))
  const patterns = new Map<string, { offsets: Map<string, number>; count: number }>()
  const composedPatterns = new Map<string, Map<string, { offsets: Map<string, number>; count: number }>>()
  const activePrograms = layers
    ? show.programs.filter((program) =>
        layers.some((layer) => layer.mode === 'animation' && layer.programId === program.id),
      )
    : legacyProgram
      ? [legacyProgram]
      : []
  for (const program of activePrograms) {
    if (!program.pattern && ['static', 'pulse', 'chase'].includes(program.effect)) continue
    // Legacy effects share a spatial sequence; recipes use a separate sequence per group below.
    const targets = new Set(
      layers
        ? layers
            .filter((layer) => layer.mode === 'animation' && layer.programId === program.id)
            .map((layer) => layer.groupId)
        : program.targetGroupIds,
    )
    const ordered = show.fixtures
      .filter(
        (fixture) =>
          targets.has(fixture.groupId) && profiles.find((item) => item.id === fixture.profileId)?.kind !== 'hazer',
      )
      .sort(
        (a, b) =>
          a.position[0] - b.position[0] || a.position[2] - b.position[2] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )
    const offsets = new Map<string, number>()
    let count = 0
    for (const fixture of ordered) {
      offsets.set(fixture.id, count)
      const definition = profiles.find((item) => item.id === fixture.profileId)
      const mode = definition && getFixtureMode(definition, fixture.modeId)
      count += mode?.independentHeads ? (fixture.visualSegments ?? 1) : 1
    }
    patterns.set(program.id, { offsets, count })
    if (program.pattern) {
      const byGroup = new Map<string, { offsets: Map<string, number>; count: number }>()
      for (const fixture of ordered) {
        let spatial = byGroup.get(fixture.groupId)
        if (!spatial) {
          spatial = { offsets: new Map(), count: 0 }
          byGroup.set(fixture.groupId, spatial)
        }
        spatial.offsets.set(fixture.id, spatial.count)
        const definition = profiles.find((item) => item.id === fixture.profileId)
        const mode = definition && getFixtureMode(definition, fixture.modeId)
        spatial.count += mode?.independentHeads ? (fixture.visualSegments ?? 1) : 1
      }
      composedPatterns.set(program.id, byGroup)
    }
  }

  const coverageCaps = new Map<string, number>()
  const frame: EvaluatedFrame = {
    atBeats,
    mode: state.mode,
    fixtures: show.fixtures.map((fixture, index) => {
      const layer = layersByGroup.get(fixture.groupId)
      const program = layers
        ? layer?.mode === 'animation'
          ? programsById.get(layer.programId!)
          : undefined
        : legacyProgram
      const profile = layer?.colorProfileId
        ? (show.colorProfiles.find((item) => item.id === layer.colorProfileId) ?? globalProfile)
        : globalProfile
      const layerLevel = layer?.intensity ?? 1
      const rate = layer?.rateBeats ?? (program?.rateBeats || 1)
      const phase = (phaseAt - (layer?.offsetBeats ?? 0)) / rate
      const pulse = !program?.pattern && program?.effect === 'pulse' ? 0.45 + Math.sin(phase * Math.PI * 2) * 0.35 : 1
      const pattern =
        program && (program.pattern ? composedPatterns.get(program.id)?.get(fixture.groupId) : patterns.get(program.id))
      const definition = profiles.find((item) => item.id === fixture.profileId)
      const mode = definition && getFixtureMode(definition, fixture.modeId)
      const group = show.groups.find((item) => item.id === fixture.groupId)
      const isSafetyTarget = safetyGroups.has(fixture.groupId)
      const chaseActive = !!program?.pattern || program?.effect !== 'chase' || (Math.floor(phase) + index) % 2 === 0
      // An empty design is valid while setting up a rig; it must not imply full white output.
      const isProgramTarget = layers
        ? !!layer && layer.mode !== 'off'
        : !!look && !!program && program.targetGroupIds.includes(fixture.groupId)
      const base =
        state.mode === 'safety' ? (isSafetyTarget ? 0.8 : 0) : isProgramTarget ? pulse * (chaseActive ? 1 : 0.28) : 0
      const paletteLimit = state.mode === 'safety' ? 1 : (profile?.intensityLimit ?? 1)
      coverageCaps.set(fixture.id, isProgramTarget ? clamp(layerLevel * (group?.intensity ?? 1) * paletteLimit) : 0)
      let intensity = clamp(base * layerLevel * (group?.intensity ?? 1) * paletteLimit)
      const color = !mode?.capabilities.includes('rgb')
        ? (definition?.fixedColor ?? '#ffffff')
        : state.mode === 'safety'
          ? '#fff1d6'
          : regieColor(profile, index, show.regie)
      let segments: EvaluatedFixture['segments']
      const offset = pattern?.offsets.get(fixture.id)
      if (program && pattern && state.mode !== 'safety' && offset !== undefined) {
        segments = Array.from({ length: mode?.independentHeads ? (fixture.visualSegments ?? 1) : 1 }, (_, segment) => ({
          intensity: clamp(
            (program.pattern
              ? evaluatePattern(program.pattern, phase, offset + segment, pattern.count)
              : patternLevel(program.effect, phase, offset + segment, pattern.count, program.id)) *
              layerLevel *
              (group?.intensity ?? 1) *
              (profile?.intensityLimit ?? 1),
          ),
          color: mode?.capabilities.includes('rgb') ? regieColor(profile, offset + segment, show.regie) : color,
        }))
        intensity = segments.reduce((sum, segment) => sum + segment.intensity, 0) / segments.length
      }
      return {
        fixtureId: fixture.id,
        intensity,
        color: segments?.find((segment) => segment.intensity > 0)?.color ?? color,
        ...(segments ? { segments } : {}),
        haze: mode?.capabilities.includes('haze') && state.mode === 'automation' ? intensity * 0.15 : 0,
      }
    }),
  }
  return applyMinimumCoverage(show, profiles, frame, coverageCaps)
}
