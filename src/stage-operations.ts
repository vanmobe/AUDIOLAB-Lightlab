import type { FixtureDeployment } from './domain'

export const aimPresets = [
  { id: 'forward', label: 'Recht vooruit', detail: 'Horizontaal naar publiek', icon: '→', direction: [0, 0, 1] },
  { id: 'forward-up', label: 'Schuin omhoog', detail: 'Omhoog naar publiek', icon: '↗', direction: [0, 1, 1] },
  { id: 'up', label: 'Recht omhoog', detail: 'Verticaal naar boven', icon: '↑', direction: [0, 1, 0] },
  { id: 'forward-down', label: 'Schuin omlaag', detail: 'Omlaag naar publiek', icon: '↘', direction: [0, -1, 1] },
  { id: 'down', label: 'Recht omlaag', detail: 'Verticaal naar vloer', icon: '↓', direction: [0, -1, 0] },
  { id: 'back', label: 'Recht achteruit', detail: 'Horizontaal naar achterwand', icon: '←', direction: [0, 0, -1] },
  { id: 'back-up', label: 'Achteruit omhoog', detail: 'Omhoog naar achterwand', icon: '↖', direction: [0, 1, -1] },
  { id: 'back-down', label: 'Achteruit omlaag', detail: 'Omlaag naar achterwand', icon: '↙', direction: [0, -1, -1] },
  {
    id: 'left',
    label: 'Links rechtdoor',
    detail: 'Naar links, gezien vanuit de zaal',
    icon: '←',
    direction: [-1, 0, 0],
  },
  {
    id: 'left-up',
    label: 'Links omhoog',
    detail: 'Schuin omhoog naar de linkerzijde',
    icon: '↖',
    direction: [-1, 1, 0],
  },
  {
    id: 'left-down',
    label: 'Links omlaag',
    detail: 'Schuin omlaag naar de linkerzijde',
    icon: '↙',
    direction: [-1, -1, 0],
  },
  {
    id: 'right',
    label: 'Rechts rechtdoor',
    detail: 'Naar rechts, gezien vanuit de zaal',
    icon: '→',
    direction: [1, 0, 0],
  },
  {
    id: 'right-up',
    label: 'Rechts omhoog',
    detail: 'Schuin omhoog naar de rechterzijde',
    icon: '↗',
    direction: [1, 1, 0],
  },
  {
    id: 'right-down',
    label: 'Rechts omlaag',
    detail: 'Schuin omlaag naar de rechterzijde',
    icon: '↘',
    direction: [1, -1, 0],
  },
] as const
export type AimPreset = (typeof aimPresets)[number]

export function aimFixtures(fixtures: FixtureDeployment[], ids: string[], preset: AimPreset) {
  const length = Math.hypot(...preset.direction)
  // A relative target keeps a batch parallel, rather than converging on one point.
  return fixtures.map((f) =>
    ids.includes(f.id)
      ? {
          ...f,
          aimMode: 'direction' as const,
          aim: f.position.map((value, axis) => value + (preset.direction[axis] / length) * 6) as [
            number,
            number,
            number,
          ],
        }
      : f,
  )
}

export function matchesAimPreset(fixture: FixtureDeployment, preset: AimPreset) {
  const direction = fixture.aim.map((value, axis) => value - fixture.position[axis])
  const length = Math.hypot(...direction)
  const expectedLength = Math.hypot(...preset.direction)
  return (
    length > 0 &&
    direction.every((value, axis) => Math.abs(value / length - preset.direction[axis] / expectedLength) < 0.001)
  )
}

export function moveFixtures(fixtures: FixtureDeployment[], ids: string[], dx: number, dz: number) {
  const selected = fixtures.filter((f) => ids.includes(f.id))
  if (!selected.length) return fixtures
  // Move the formation within the stage bounds without changing its spacing.
  dx = Math.max(
    -6.7 - Math.min(...selected.map((f) => f.position[0])),
    Math.min(6.7 - Math.max(...selected.map((f) => f.position[0])), dx),
  )
  dz = Math.max(
    -4.7 - Math.min(...selected.map((f) => f.position[2])),
    Math.min(4.7 - Math.max(...selected.map((f) => f.position[2])), dz),
  )
  return fixtures.map((f) =>
    ids.includes(f.id)
      ? {
          ...f,
          position: [f.position[0] + dx, f.position[1], f.position[2] + dz] as [number, number, number],
          aim:
            f.aimMode === 'direction' ? ([f.aim[0] + dx, f.aim[1], f.aim[2] + dz] as [number, number, number]) : f.aim,
        }
      : f,
  )
}

export function setFixtureHeight(fixtures: FixtureDeployment[], ids: string[], height: number) {
  return fixtures.map((f) =>
    ids.includes(f.id)
      ? {
          ...f,
          position: [f.position[0], height, f.position[2]] as [number, number, number],
          aim:
            f.aimMode === 'direction'
              ? ([f.aim[0], f.aim[1] + height - f.position[1], f.aim[2]] as [number, number, number])
              : f.aim,
        }
      : f,
  )
}

/** Align around the selection centre; directional beams move with their fixture. */
export function alignFixtures(fixtures: FixtureDeployment[], ids: string[], axis: 'x' | 'z') {
  const selected = fixtures.filter((f) => ids.includes(f.id))
  if (selected.length < 2) return fixtures
  const index = axis === 'x' ? 0 : 2
  const centre = selected.reduce((sum, f) => sum + f.position[index], 0) / selected.length
  return selected.reduce(
    (result, f) =>
      moveFixtures(
        result,
        [f.id],
        axis === 'x' ? centre - f.position[0] : 0,
        axis === 'z' ? centre - f.position[2] : 0,
      ),
    fixtures,
  )
}

/** Keep endpoints fixed on the chosen stage-plane axis (Y in 3D remains height). */
export function distributeFixtures(fixtures: FixtureDeployment[], ids: string[], axis: 'x' | 'z' = 'x') {
  const index = axis === 'x' ? 0 : 2
  const selected = fixtures
    .filter((f) => ids.includes(f.id))
    .sort((a, b) => a.position[index] - b.position[index] || a.id.localeCompare(b.id))
  if (selected.length < 3) return fixtures
  const start = selected[0].position[index]
  const step = (selected.at(-1)!.position[index] - start) / (selected.length - 1)
  return selected.reduce((result, f, i) => {
    const delta = start + step * i - f.position[index]
    return moveFixtures(result, [f.id], axis === 'x' ? delta : 0, axis === 'z' ? delta : 0)
  }, fixtures)
}
