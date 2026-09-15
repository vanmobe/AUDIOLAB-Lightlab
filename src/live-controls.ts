import { resolveLookLayers, type LookLayer, type RuntimeState, type ShowDocument } from './domain'

type LayerChange = Partial<Omit<LookLayer, 'groupId'>>
export interface LiveControls {
  overrides: Record<string, LayerChange>
  links: string[][]
}

export function emptyLiveControls(): LiveControls {
  return { overrides: {}, links: [] }
}

/** Connected components, including overlapping links left after a setup edit. */
export function linkedGroupIds(show: ShowDocument, controls: LiveControls, groupId: string): string[] {
  const valid = new Set(show.groups.map(group => group.id))
  if (!valid.has(groupId)) return []
  const connected = new Set([groupId])
  let changed = true
  while (changed) {
    changed = false
    for (const link of controls.links) {
      if (!link.some(id => connected.has(id))) continue
      for (const id of link) if (valid.has(id) && !connected.has(id)) { connected.add(id); changed = true }
    }
  }
  return show.groups.filter(group => connected.has(group.id)).map(group => group.id)
}

export function linkLiveGroups(show: ShowDocument, controls: LiveControls, groupIds: string[]): LiveControls {
  const selected = new Set(groupIds.filter(id => show.groups.some(group => group.id === id)))
  if (selected.size < 2) return controls
  const merged = new Set([...selected].flatMap(id => linkedGroupIds(show, controls, id)))
  return {
    ...controls,
    links: [
      ...controls.links.filter(link => !link.some(id => merged.has(id))),
      show.groups.filter(group => merged.has(group.id)).map(group => group.id),
    ],
  }
}

export function unlinkLiveGroup(controls: LiveControls, groupId: string): LiveControls {
  return { ...controls, links: controls.links.map(link => link.filter(id => id !== groupId)).filter(link => link.length >= 2) }
}

export function updateLiveGroups(show: ShowDocument, controls: LiveControls, groupId: string, change: LayerChange): LiveControls {
  const targets = linkedGroupIds(show, controls, groupId)
  if (!targets.length) return controls
  let overrides = { ...controls.overrides }
  // Computed own properties also support imported IDs such as "__proto__".
  for (const id of targets) overrides = { ...overrides, [id]: { ...(Object.hasOwn(overrides, id) ? overrides[id] : {}), ...change } }
  return { ...controls, overrides }
}

export function applyLiveGroupLook(show: ShowDocument, controls: LiveControls, groupId: string, lookId: string): LiveControls {
  const look = show.looks.find(item => item.id === lookId)
  if (!look) return controls
  const targets = new Set(linkedGroupIds(show, controls, groupId))
  if (!targets.size) return controls
  let overrides = { ...controls.overrides }
  for (const { groupId: id, ...layer } of resolveLookLayers(show, look)) {
    // Capture source palette: following the current global Look here would change the copied look.
    if (targets.has(id)) overrides = { ...overrides, [id]: { ...layer, colorProfileId: layer.colorProfileId ?? look.colorProfileId,
      // Explicit resets prevent timing from leaking in from the currently active base Look.
      rateBeats: layer.rateBeats ?? 1, offsetBeats: layer.offsetBeats ?? 0,
    } }
  }
  return { ...controls, overrides }
}

export function resetLiveGroups(show: ShowDocument, controls: LiveControls, groupId: string): LiveControls {
  const overrides = { ...controls.overrides }
  for (const id of linkedGroupIds(show, controls, groupId)) delete overrides[id]
  return { ...controls, overrides }
}

function mergedLayer(show: ShowDocument, base: LookLayer, override: LayerChange | undefined): LookLayer {
  if (!override) return base
  const layer = { ...base }
  if (override.colorProfileId === null || show.colorProfiles.some(profile => profile.id === override.colorProfileId)) layer.colorProfileId = override.colorProfileId!
  if (typeof override.intensity === 'number' && Number.isFinite(override.intensity) && override.intensity >= 0 && override.intensity <= 1) layer.intensity = override.intensity
  if (override.rateBeats === null) layer.rateBeats = 1
  else if (typeof override.rateBeats === 'number' && Number.isFinite(override.rateBeats) && override.rateBeats >= .01 && override.rateBeats <= 1024) layer.rateBeats = override.rateBeats
  if (typeof override.offsetBeats === 'number' && Number.isFinite(override.offsetBeats) && override.offsetBeats >= -64 && override.offsetBeats <= 64) layer.offsetBeats = override.offsetBeats
  const validMode = override.mode === 'animation' || override.mode === 'static' || override.mode === 'off'
  const programId = override.programId === undefined ? base.programId : override.programId
  const mode = validMode ? override.mode! : base.mode
  if (mode === 'static' || mode === 'off') {
    layer.mode = mode; layer.programId = null
  } else if (show.programs.some(program => program.id === programId)) {
    layer.mode = 'animation'; layer.programId = programId!
  }
  // Missing/deleted animation references fall back to the base behavior, not accidental static light.
  return layer
}

/** Session-only rendering input. Never persist this derived document or use it to resume a mode. */
export function livePreview(show: ShowDocument, state: RuntimeState, controls: LiveControls): { show: ShowDocument; state: RuntimeState } {
  if (!Object.keys(controls.overrides).length) return { show, state }
  const look = show.looks.find(item => item.id === state.activeLookId) ?? show.looks[0]
  if (!look) return { show, state }
  const base = resolveLookLayers(show, look)
  const layers = base.map(layer => mergedLayer(show, layer, Object.hasOwn(controls.overrides, layer.groupId) ? controls.overrides[layer.groupId] : undefined))
  if (layers.every((layer, index) => JSON.stringify(layer) === JSON.stringify(base[index]))) return { show, state }
  return { show: { ...show, looks: show.looks.map(item => item.id === look.id ? { ...item, layers } : item) }, state }
}
