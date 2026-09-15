import { animationEffects, MAX_SHOW_ITEMS, type ShowDocument } from './domain'
import { canAssignBinding, isControlSlot, slotKey } from './control-surface'
import type { ControlBinding } from './domain'
import { validateBandProfile } from './band-profile'
import { assertShowRegie } from './show-regie'

// Limits apply before parsing or traversing user-controlled data, not to DMX arming.
export const MAX_SHOW_JSON_LENGTH = 2_000_000

function invalid(path: string): never {
  throw new Error(`Ongeldig showbestand: controleer ${path}.`)
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path)
  return value as Record<string, unknown>
}
function text(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > 1024 || (!allowEmpty && !value.trim())) invalid(path)
  return value
}
function number(value: unknown, path: string, min: number, max: number, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) invalid(path)
}
function choice(value: unknown, path: string, choices: string[]) {
  if (typeof value !== 'string' || !choices.includes(value)) invalid(path)
}
function vector(value: unknown, path: string) {
  if (!Array.isArray(value) || value.length !== 3) invalid(path)
  value.forEach((part, index) => number(part, `${path}.${index}`, -10000, 10000))
}
function records(value: unknown, path: string, max: number): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > max) invalid(path)
  const ids = new Set<string>()
  return value.map((entry, index) => {
    const item = object(entry, `${path}.${index}`)
    const id = text(item.id, `${path}.${index}.id`)
    if (ids.has(id)) invalid(`${path}.${index}.id (dubbel)`)
    ids.add(id)
    return item
  })
}
function reference(value: unknown, path: string, items: Record<string, unknown>[]) {
  const id = text(value, path)
  if (!items.some((item) => item.id === id)) invalid(`${path} (onbekende verwijzing)`)
}

/** Validates persisted shape and references; patch collisions/catalog checks remain in validateShow. */
export function assertShowDocument(value: unknown): asserts value is ShowDocument {
  const show = object(value, 'show')
  if (show.schemaVersion !== 1) invalid('schemaVersion')
  text(show.name, 'name')
  const groups = records(show.groups, 'groups', 256)
  const fixtures = records(show.fixtures, 'fixtures', 1024)
  const routes = records(show.routes, 'routes', 256)
  const colors = records(show.colorProfiles, 'colorProfiles', MAX_SHOW_ITEMS)
  const programs = records(show.programs, 'programs', MAX_SHOW_ITEMS)
  const looks = records(show.looks, 'looks', MAX_SHOW_ITEMS)
  if (show.regie !== undefined) assertShowRegie(show.regie, groups.map(group => group.id as string))
  if (show.bandMembers !== undefined) {
    for (const [index, member] of records(show.bandMembers, 'bandMembers', 16).entries()) {
      text(member.name, `bandMembers.${index}.name`)
      vector(member.position, `bandMembers.${index}.position`)
      number((member.position as number[])[1], `bandMembers.${index}.position.1`, 0, 5)
    }
  }
  if (show.bandProfile !== undefined) {
    try { validateBandProfile(show.bandProfile) } catch { invalid('bandProfile') }
  }
  for (const [index, group] of groups.entries()) {
    text(group.name, `groups.${index}.name`)
    number(group.intensity, `groups.${index}.intensity`, 0, 1)
  }
  for (const [index, fixture] of fixtures.entries()) {
    const path = `fixtures.${index}`
    for (const field of ['name', 'profileId', 'modeId']) text(fixture[field], `${path}.${field}`)
    reference(fixture.groupId, `${path}.groupId`, groups)
    vector(fixture.position, `${path}.position`)
    vector(fixture.aim, `${path}.aim`)
    if (fixture.aimMode !== undefined) choice(fixture.aimMode, `${path}.aimMode`, ['target', 'direction'])
    if (fixture.visualSegments !== undefined) number(fixture.visualSegments, `${path}.visualSegments`, 1, 64, true)
    if (fixture.patch !== undefined) {
      const patch = object(fixture.patch, `${path}.patch`)
      number(patch.universe, `${path}.patch.universe`, 1, 63999, true)
      number(patch.address, `${path}.patch.address`, 1, 512, true)
    }
  }
  for (const [index, route] of routes.entries()) {
    number(route.universe, `routes.${index}.universe`, 1, 63999, true)
    choice(route.protocol, `routes.${index}.protocol`, ['artnet', 'sacn'])
    text(route.host, `routes.${index}.host`, true)
    if (typeof route.enabled !== 'boolean') invalid(`routes.${index}.enabled`)
  }
  for (const [index, color] of colors.entries()) {
    text(color.name, `colorProfiles.${index}.name`)
    for (const field of ['primary', 'secondary', 'accent', 'white']) {
      if (!/^#[a-f\d]{6}$/i.test(text(color[field], `colorProfiles.${index}.${field}`))) invalid(`colorProfiles.${index}.${field}`)
    }
    number(color.intensityLimit, `colorProfiles.${index}.intensityLimit`, 0, 1)
  }
  for (const [index, program] of programs.entries()) {
    const path = `programs.${index}`
    text(program.name, `${path}.name`)
    choice(program.effect, `${path}.effect`, animationEffects.map(effect => effect.id))
    number(program.rateBeats, `${path}.rateBeats`, 0.01, 1024)
    if (program.pattern !== undefined) {
      try { validatePattern(program.pattern) } catch { invalid(`${path}.pattern`) }
    }
    reference(program.defaultColorProfileId, `${path}.defaultColorProfileId`, colors)
    if (!Array.isArray(program.targetGroupIds) || program.targetGroupIds.length > 256) invalid(`${path}.targetGroupIds`)
    program.targetGroupIds.forEach((id) => reference(id, `${path}.targetGroupIds`, groups))
  }
  for (const [index, look] of looks.entries()) {
    text(look.name, `looks.${index}.name`)
    reference(look.programId, `looks.${index}.programId`, programs)
    reference(look.colorProfileId, `looks.${index}.colorProfileId`, colors)
    if (look.layers !== undefined) {
      const path = `looks.${index}.layers`
      if (!Array.isArray(look.layers) || look.layers.length > 256) invalid(path)
      const assignedGroups = new Set<string>()
      look.layers.forEach((entry, layerIndex) => {
        const layerPath = `${path}.${layerIndex}`
        const layer = object(entry, layerPath)
        reference(layer.groupId, `${layerPath}.groupId`, groups)
        const groupId = layer.groupId as string
        if (assignedGroups.has(groupId)) invalid(`${layerPath}.groupId (dubbel)`)
        assignedGroups.add(groupId)
        choice(layer.mode, `${layerPath}.mode`, ['animation', 'static', 'off'])
        number(layer.intensity, `${layerPath}.intensity`, 0, 1)
        // Legacy program durations must remain valid when captured on the group.
        if (layer.rateBeats !== undefined && layer.rateBeats !== null) number(layer.rateBeats, `${layerPath}.rateBeats`, .01, 1024)
        if (layer.offsetBeats !== undefined) number(layer.offsetBeats, `${layerPath}.offsetBeats`, -64, 64)
        if (layer.mode === 'animation') reference(layer.programId, `${layerPath}.programId`, programs)
        else if (layer.programId !== null) invalid(`${layerPath}.programId (moet null zijn)`)
        if (layer.colorProfileId !== null) reference(layer.colorProfileId, `${layerPath}.colorProfileId`, colors)
      })
    }
  }
  if (looks.length) reference(show.activeLookId, 'activeLookId', looks)
  else if (show.activeLookId !== '') invalid('activeLookId')
  const surface = object(show.controlSurface, 'controlSurface')
  text(surface.profileId, 'controlSurface.profileId')
  if (surface.bankNames !== undefined) {
    const names = object(surface.bankNames, 'controlSurface.bankNames')
    for (const [key, value] of Object.entries(names)) {
      if (!/^(?:[1-9]|[1-5][0-9]|6[0-4])$/.test(key) || typeof value !== 'string' || !value.trim() || value.length > 80) invalid('controlSurface.bankNames')
    }
  }
  const assignedSlots = new Set<string>()
  for (const [index, binding] of records(surface.bindings, 'controlSurface.bindings', 512).entries()) {
    const path = `controlSurface.bindings.${index}`
    text(binding.label, `${path}.label`)
    choice(binding.action, `${path}.action`, ['look', 'mode', 'group-intensity', 'tap-tempo', 'color-lock', 'follow'])
    if (binding.targetId !== undefined) text(binding.targetId, `${path}.targetId`)
    if (binding.action === 'look') reference(binding.targetId, `${path}.targetId`, looks)
    if (binding.action === 'group-intensity') reference(binding.targetId, `${path}.targetId`, groups)
    if (binding.action === 'color-lock' && binding.targetId !== undefined) reference(binding.targetId, `${path}.targetId`, colors)
    if (binding.action === 'mode') choice(binding.targetId, `${path}.targetId`, ['automation', 'static', 'safety', 'blackout'])
    if (binding.slot !== undefined) {
      if (!isControlSlot(binding.slot) || !canAssignBinding(binding as unknown as ControlBinding, binding.slot)) invalid(`${path}.slot`)
      const key = slotKey(binding.slot)
      if (assignedSlots.has(key)) invalid(`${path}.slot (dubbel)`)
      assignedSlots.add(key)
    }
  }
  const sync = object(show.sync, 'sync')
  choice(sync.source, 'sync.source', ['direct-audio', 'midi-clock', 'tap-tempo'])
  text(sync.audioDeviceName, 'sync.audioDeviceName', true)
  number(sync.lightingOffsetMs, 'sync.lightingOffsetMs', -60000, 60000)
  const camera = object(show.camera, 'camera')
  vector(camera.position, 'camera.position')
  vector(camera.target, 'camera.target')
  number(camera.fov, 'camera.fov', 1, 179)
}

export function parseShowDocument(raw: string): ShowDocument {
  if (raw.length > MAX_SHOW_JSON_LENGTH) invalid('bestandsgrootte (maximaal 2 miljoen tekens)')
  let value: unknown
  try { value = JSON.parse(raw) } catch { invalid('JSON') }
  assertShowDocument(value)
  return value
}
import { validatePattern } from './pattern-language'
