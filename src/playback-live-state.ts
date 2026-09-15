import type { RuntimeState, ShowDocument } from './domain'
import { livePreview, type LiveControls } from './live-controls'

export interface PlaybackLiveState {
  controls: LiveControls
  groupIntensities: Record<string, number>
  colorLockId: string | null
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ongeldige live-instellingen.')
  return value as Record<string, unknown>
}
function keys(value: Record<string, unknown>, allowed: string[], required: string[] = []) {
  if (Object.keys(value).some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(value, key)))
    throw new Error('Ongeldige live-instellingen.')
}
const finite = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

/** Strict transport boundary; rendering keeps using the established livePreview semantics. */
export function assertPlaybackLiveState(show: ShowDocument, value: unknown): asserts value is PlaybackLiveState {
  const live = object(value)
  keys(live, ['controls', 'groupIntensities', 'colorLockId'], ['controls', 'groupIntensities', 'colorLockId'])
  const controls = object(live.controls)
  keys(controls, ['overrides', 'links'], ['overrides', 'links'])
  const groups = new Set(show.groups.map((g) => g.id))
  const programs = new Set(show.programs.map((p) => p.id))
  const colors = new Set(show.colorProfiles.map((c) => c.id))
  const masters = object(live.groupIntensities)
  if (
    Object.keys(masters).length !== groups.size ||
    Object.entries(masters).some(([id, level]) => !groups.has(id) || !finite(level, 0, 1))
  )
    throw new Error('Ongeldige groepsmasters.')
  if (live.colorLockId !== null && (typeof live.colorLockId !== 'string' || !colors.has(live.colorLockId)))
    throw new Error('Onbekend kleurprofiel.')
  const overrides = object(controls.overrides)
  if (Object.keys(overrides).length > groups.size) throw new Error('Te veel groepsinstellingen.')
  for (const [id, raw] of Object.entries(overrides)) {
    if (!groups.has(id)) throw new Error('Onbekende groep.')
    const layer = object(raw)
    keys(layer, ['mode', 'programId', 'colorProfileId', 'intensity', 'rateBeats', 'offsetBeats'])
    if (Object.hasOwn(layer, 'mode') && !['animation', 'static', 'off'].includes(layer.mode as string))
      throw new Error('Ongeldige groepsmodus.')
    if (
      Object.hasOwn(layer, 'programId') &&
      layer.programId !== null &&
      (typeof layer.programId !== 'string' || !programs.has(layer.programId))
    )
      throw new Error('Onbekend patroon.')
    if (layer.mode === 'animation' && layer.programId === null) throw new Error('Animatie mist een patroon.')
    if (
      Object.hasOwn(layer, 'colorProfileId') &&
      layer.colorProfileId !== null &&
      (typeof layer.colorProfileId !== 'string' || !colors.has(layer.colorProfileId))
    )
      throw new Error('Onbekend kleurprofiel.')
    if (Object.hasOwn(layer, 'intensity') && !finite(layer.intensity, 0, 1)) throw new Error('Ongeldige intensiteit.')
    if (Object.hasOwn(layer, 'rateBeats') && layer.rateBeats !== null && !finite(layer.rateBeats, 0.01, 1024))
      throw new Error('Ongeldige beatduur.')
    if (Object.hasOwn(layer, 'offsetBeats') && !finite(layer.offsetBeats, -64, 64)) throw new Error('Ongeldige fase.')
  }
  if (!Array.isArray(controls.links) || controls.links.length > groups.size)
    throw new Error('Ongeldige groepskoppelingen.')
  const linked = new Set<string>()
  for (const link of controls.links) {
    if (!Array.isArray(link) || link.length < 2 || link.length > groups.size)
      throw new Error('Ongeldige groepskoppeling.')
    for (const id of link) {
      if (typeof id !== 'string' || !groups.has(id) || linked.has(id))
        throw new Error('Dubbele of onbekende groepskoppeling.')
      linked.add(id)
    }
  }
}

export function playbackLivePreview(show: ShowDocument, state: RuntimeState, live: PlaybackLiveState) {
  const mastered = {
    ...show,
    groups: show.groups.map((group) => ({ ...group, intensity: live.groupIntensities[group.id] })),
  }
  return livePreview(mastered, { ...state, colorLockId: live.colorLockId ?? undefined }, live.controls)
}
