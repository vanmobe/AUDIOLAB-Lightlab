import type { ShowDocument } from './domain'

export function stageSnapshot(show: ShowDocument) {
  return {
    fixtures: show.fixtures.map(({ id, name, position, aim, aimMode, groupId }) => ({
      id,
      name,
      position,
      aim,
      aimMode,
      groupId,
    })),
    bandMembers: show.bandMembers,
    groups: show.groups.map(({ id, name }) => ({ id, name })),
    camera: show.camera,
  }
}
export type StageSnapshot = ReturnType<typeof stageSnapshot>

/** Restore editor-owned fields only: patch, group masters and creative work stay current. */
export function restoreStage(show: ShowDocument, snapshot: StageSnapshot): ShowDocument {
  const fixtures = show.fixtures.map((f) => {
    const saved = snapshot.fixtures.find((item) => item.id === f.id)
    return saved ? { ...f, ...saved } : f
  })
  // Creative/control references may have changed while this editor remained mounted.
  const referencedGroups = new Set([
    ...fixtures.map((f) => f.groupId),
    ...show.programs.flatMap((p) => p.targetGroupIds),
    ...show.looks.flatMap((look) => look.layers?.map((layer) => layer.groupId) ?? []),
    ...show.controlSurface.bindings.filter((b) => b.action === 'group-intensity').map((b) => b.targetId),
  ])
  return {
    ...show,
    fixtures,
    bandMembers: snapshot.bandMembers,
    groups: [
      ...snapshot.groups.map((g) => ({
        ...g,
        intensity: show.groups.find((item) => item.id === g.id)?.intensity ?? 1,
      })),
      ...show.groups.filter((g) => !snapshot.groups.some((saved) => saved.id === g.id) && referencedGroups.has(g.id)),
    ],
    camera: snapshot.camera,
  }
}

export function sameStage(a: StageSnapshot, b: StageSnapshot) {
  return JSON.stringify(a) === JSON.stringify(b)
}
