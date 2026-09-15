import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { StageCameraMarker } from './StageCameraMarker'
import { matchesStageCamera, stageCameraMarker, stageCameraPresets } from './stage-camera'
import { initialShow } from './seed'

describe('stage camera viewpoint', () => {
  it('starts new shows at audience height looking slightly up without relabeling old saved views', () => {
    const audience = stageCameraPresets[0].camera
    expect(initialShow.camera).toEqual(audience)
    expect(audience.position[1]).toBe(1)
    expect(audience.target[1]).toBeGreaterThan(audience.position[1])
    expect(stageCameraMarker({ position: [0, 6.7, 12], target: [0, 1.4, 0], fov: 48 }).label).toBe('Eigen standpunt')
  })
  it('shows the audience camera at the edge pointing toward the stage', () => {
    const marker = stageCameraMarker(stageCameraPresets[0].camera)
    expect(marker).toMatchObject({
      position: { x: 70, y: 88 },
      tip: { x: 70, y: 70 },
      outside: true,
      clamped: true,
      label: 'Zaal',
    })
  })
  it('uses the complete camera configuration to identify a preset', () => {
    for (const preset of stageCameraPresets) expect(stageCameraMarker(preset.camera).label).toBe(preset.label)
    const camera = { ...stageCameraPresets[0].camera, target: [1, 1.4, 0] as [number, number, number] }
    expect(matchesStageCamera(camera, stageCameraPresets[0].camera)).toBe(false)
    expect(stageCameraMarker(camera).label).toBe('Eigen standpunt')
  })
  it('projects side cameras and keeps outward arrows visible within the map', () => {
    const inward = stageCameraMarker({ position: [-10, 3, 0], target: [0, 1, 0], fov: 48 })
    expect(inward.direction).toEqual({ x: 1, y: 0 })
    const outward = stageCameraMarker({ position: [10, 3, 0], target: [20, 1, 0], fov: 48 })
    expect(outward.position.x).toBe(126)
    expect(outward.tip).toEqual({ x: 138, y: 50 })
  })
  it('distinguishes vertical views without inventing a horizontal direction', () => {
    for (const [height, label] of [
      [0, 'recht omlaag'],
      [20, 'recht omhoog'],
      [10, 'geen kijkrichting'],
    ] as const) {
      const marker = stageCameraMarker({ position: [0, 10, 0], target: [0, height, 0], fov: 48 })
      expect(marker.tip).toBeUndefined()
      expect(marker.vertical).toBe(label)
    }
  })
  it('renders an accessible native button and prevents floor targeting on pointer down', () => {
    const onOpen = vi.fn(),
      stopPropagation = vi.fn()
    const element = StageCameraMarker({ camera: stageCameraPresets[0].camera, onOpen })
    const button = element.props.children[1]
    button.props.onPointerDown({ stopPropagation })
    expect(stopPropagation).toHaveBeenCalledOnce()
    button.props.onClick()
    expect(onOpen).toHaveBeenCalledOnce()
    const html = renderToStaticMarkup(element)
    expect(html).toContain('aria-label="Camerastandpunt: Zaal')
    expect(html).toContain('buiten het podium')
  })
})
