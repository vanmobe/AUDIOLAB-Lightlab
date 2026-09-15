import type { SimulationCamera } from './domain'

export const stageCameraPresets: { label: string; camera: SimulationCamera }[] = [
  // Heights are relative to the stage floor: audience eyes sit lower than the band.
  { label: 'Zaal', camera: { position: [0, 1, 12], target: [0, 1.8, 0], fov: 48 } },
  { label: 'Dichtbij', camera: { position: [0, 4, 9], target: [0, 1.4, 0], fov: 48 } },
  { label: 'Overzicht', camera: { position: [0, 13, 8], target: [0, 1.4, 0], fov: 48 } },
  { label: 'Links', camera: { position: [-12, 6, 2], target: [0, 1.4, 0], fov: 55 } },
  { label: 'Rechts', camera: { position: [12, 6, 2], target: [0, 1.4, 0], fov: 55 } },
  { label: 'Bovenaan', camera: { position: [0, 18, 0], target: [0, 0, 0], fov: 55 } },
]
export function matchesStageCamera(camera: SimulationCamera, preset: SimulationCamera) {
  return camera.fov === preset.fov && camera.position.every((value, index) => value === preset.position[index]) && camera.target.every((value, index) => value === preset.target[index])
}

/** A plan-view direction, not a field-of-view footprint. Offstage origins are inset-clamped for visibility. */
export function stageCameraMarker(camera: SimulationCamera) {
  const [x, height, z] = camera.position
  const position = { x: Math.max(14, Math.min(126, (x + 7) * 10)), y: Math.max(10, Math.min(88, (z + 5) * 10)) }
  const dx = camera.target[0] - x, dz = camera.target[2] - z
  const distance = Math.hypot(dx, dz)
  const direction = distance > .000001 ? { x: dx / distance, y: dz / distance } : undefined
  // Shorten outward-facing arrows at the edge rather than drawing outside the stage map.
  const length = direction ? Math.min(18,
    direction.x > 0 ? (138 - position.x) / direction.x : direction.x < 0 ? (2 - position.x) / direction.x : Infinity,
    direction.y > 0 ? (98 - position.y) / direction.y : direction.y < 0 ? (2 - position.y) / direction.y : Infinity) : 0
  const tip = direction ? { x: position.x + direction.x * length, y: position.y + direction.y * length } : undefined
  const outside = Math.abs(x) > 7 || Math.abs(z) > 5
  const clamped = position.x !== (x + 7) * 10 || position.y !== (z + 5) * 10
  const label = stageCameraPresets.find(preset => matchesStageCamera(camera, preset.camera))?.label ?? 'Eigen standpunt'
  const vertical = direction ? undefined : camera.target[1] < height ? 'recht omlaag' : camera.target[1] > height ? 'recht omhoog' : 'geen kijkrichting'
  return { position, tip, direction, outside, clamped, label, vertical }
}
