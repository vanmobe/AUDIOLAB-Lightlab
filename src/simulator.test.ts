import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { assertSimulationBudget, StageSimulator, beamThrow, createBandMemberView, createFixtureView, updateFixtureView } from './simulator'
import { initialShow } from './seed'
import { assertShowDocument } from './show-validation'
import type { FixtureDeployment } from './domain'

const fixture: FixtureDeployment = { id: 'front', name: 'Front', profileId: 'varytec-theater-spot-100', modeId: '2ch', groupId: 'front', position: [0, 3, 3], aim: [0, 0, -2] }

describe('simulation resource budget', () => {
  it('accepts the initial rig and includes grouped visual bar heads in its light budget', () => {
    expect(() => assertSimulationBudget(initialShow.fixtures)).not.toThrow()
    const bar = { ...fixture, visualSegments: 64 }
    expect(() => assertSimulationBudget(Array.from({ length: 4 }, () => bar))).not.toThrow()
    expect(() => assertSimulationBudget([...Array.from({ length: 4 }, () => bar), fixture])).toThrow(/256 lichtpunten/)
  })
  it('counts haze housings as objects but never as rendered lights', () => {
    const hazer = { ...fixture, profileId: 'stairville-hz-200', visualSegments: 64 }
    expect(() => assertSimulationBudget(Array.from({ length: 1024 }, () => hazer))).not.toThrow()
    expect(() => assertSimulationBudget(Array.from({ length: 1025 }, () => hazer))).toThrow(/1024 fixtures/)
  })
  it('rejects an oversized valid rig before accessing a browser or allocating WebGL', () => {
    // Node has no DOM/WebGL: receiving the budget error proves the guard precedes GPU setup.
    const fixtures = Array.from({ length: 5 }, (_, index) => ({ ...fixture, id: String(index), visualSegments: 64 }))
    expect(() => assertShowDocument({ ...initialShow, fixtures })).not.toThrow()
    expect(() => new StageSimulator({} as HTMLElement, fixtures, initialShow.camera)).toThrow(/256 lichtpunten/)
  })
})

describe('fixture rendering', () => {
  it('renders each head from segment output while retaining aggregate-only compatibility', () => {
    const view = createFixtureView(fixture, 0)
    const source = { fixtureId: fixture.id, intensity: .5, color: '#ffffff', haze: 0, segments: [{ intensity: 0, color: '#ff0000' }, { intensity: 1, color: '#00ff00' }] }
    updateFixtureView(view, source, 0, 0)
    expect(view.light.intensity).toBe(0)
    updateFixtureView(view, source, 0, 1)
    expect(view.light.intensity).toBe(40)
    expect(view.light.color.getHexString()).toBe('00ff00')
    updateFixtureView(view, { ...source, segments: undefined }, 0, 1)
    expect(view.light.intensity).toBe(20)
    expect(view.light.color.getHexString()).toBe('ffffff')
    const grouped = { ...source, intensity: 1, color: '#ff0000', segments: [{ intensity: 1, color: '#ff0000' }] }
    for (let segment = 0; segment < 4; segment++) {
      updateFixtureView(view, grouped, 0, segment)
      expect(view.light.intensity).toBe(40)
      expect(view.light.color.getHexString()).toBe('ff0000')
    }
  })
  it('boosts visual contrast without changing source intensity, tint or the off state', () => {
    const view = createFixtureView(fixture, 0)
    const source = { fixtureId: fixture.id, intensity: 0.5, color: '#fff1d6', haze: 0 }
    updateFixtureView(view, source, 0)
    expect(view.light.intensity).toBe(20)
    expect(view.light.color.getHexString()).toBe('fff1d6')
    // Clear air hides the beam volume, but leaves surface illumination unchanged.
    expect((view.beam.material as THREE.MeshBasicMaterial).opacity).toBe(0)
    expect(source.intensity).toBe(0.5)
    updateFixtureView(view, { ...source, intensity: 0 }, 1)
    expect(view.light.intensity).toBe(0)
    expect((view.beam.material as THREE.MeshBasicMaterial).opacity).toBe(0)
    expect((view.lamp.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0)
    updateFixtureView(view, { ...source, color: '#ff0000', intensity: 1 }, 0)
    expect(view.light.intensity).toBe(40)
    expect(view.light.color.getHexString()).toBe('ff0000')
  })
  it('places a human-scale person on the stage using light-reactive, non-emissive surfaces', () => {
    const person = createBandMemberView({ id: 'singer', name: 'Zang', position: [2, 0, -1] })
    expect(person.position.toArray()).toEqual([2, 0, -1])
    const bounds = new THREE.Box3().setFromObject(person)
    expect(bounds.min.y).toBeCloseTo(0)
    expect(bounds.max.y).toBeCloseTo(1.77)
    expect(person.children.length).toBe(8)
    person.traverse(part => {
      if (part instanceof THREE.Mesh) {
        expect(part.material).toBeInstanceOf(THREE.MeshStandardMaterial)
        expect(part.material.emissive.getHex()).toBe(0)
      }
    })
  })
  it('aims every bar segment parallel in direction mode while retaining shared targets in legacy mode', () => {
    const bar = { ...fixture, visualSegments: 4, aim: [0, 9, 3] as [number, number, number], aimMode: 'direction' as const }
    for (const segment of [0, 1, 2, 3]) {
      const view = createFixtureView(bar, segment)
      expect(view.light.target.position.clone().sub(view.light.position).toArray()).toEqual([0, 6, 0])
      expect(createFixtureView({ ...bar, aimMode: 'target' }, segment).light.target.position.toArray()).toEqual(bar.aim)
    }
  })
  it.each([[0, 0, -2], [0, 0, 5], [0, 3, 3]])('anchors the beam tip to the lamp and directs its base toward (%s, %s, %s)', (...aim) => {
    const view = createFixtureView({ ...fixture, aim: aim as [number, number, number] }, 0)
    const height = (view.beam.geometry as THREE.ConeGeometry).parameters.height
    const tip = new THREE.Vector3(0, height / 2, 0).applyQuaternion(view.beam.quaternion).add(view.beam.position)
    expect(tip.distanceTo(view.lamp.position)).toBeLessThan(0.00001)
    expect(Number.isFinite(view.beam.quaternion.w)).toBe(true)
    expect(view.light.target.position.distanceTo(view.light.position)).toBeGreaterThan(0)
    if (new THREE.Vector3(...aim).distanceTo(view.lamp.position) > 0) {
      const base = new THREE.Vector3(0, -height / 2, 0).applyQuaternion(view.beam.quaternion).add(view.beam.position)
      expect(base.distanceTo(new THREE.Vector3(...aim))).toBeLessThan(0.00001)
    }
  })

  it('uses an unlit emitter so nearby RGB lights cannot tint a fixed-white lens', () => {
    expect(createFixtureView(fixture, 0).lamp.material).toBeInstanceOf(THREE.MeshBasicMaterial)
  })

  it('extends beams beyond an aim point without inventing side walls or clipping upward beams', () => {
    expect(beamThrow(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -1, 0))).toBe(2)
    expect(beamThrow(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 1, 0))).toBe(18)
    expect(beamThrow(new THREE.Vector3(0, 2, 0), new THREE.Vector3(1, 0, 0))).toBe(18)
    expect(beamThrow(new THREE.Vector3(0, 2, -4), new THREE.Vector3(1, 0, 0))).toBe(7.3)
    expect(beamThrow(new THREE.Vector3(10, 2, 0), new THREE.Vector3(0, -1, 0))).toBe(18)
    const view = createFixtureView({ ...fixture, position: [0, 3, 0], aim: [0, 2, 0] }, 0)
    expect(view.light.target.position.toArray()).toEqual([0, 2, 0])
    expect(view.beam.geometry.parameters.height).toBe(3)
  })

  it('builds bounded soft-beam materials and shadow-receiving people, keeping blackout dark', () => {
    const view = createFixtureView(fixture, 0)
    expect(view.housing.children.length).toBe(1)
    expect(view.beam.material.depthWrite).toBe(false)
    expect(view.beam.material.customProgramCacheKey()).toBe('lightlab-soft-beam-smoke-v2')
    const person = createBandMemberView({ id: 'one', name: 'Zang', position: [0, 0, 0] })
    person.traverse(object => { if (object instanceof THREE.Mesh) expect(object.castShadow && object.receiveShadow).toBe(true) })
    updateFixtureView(view, { fixtureId: fixture.id, intensity: 0, color: '#fff1d6', haze: 1 }, 1)
    expect(view.beam.visible).toBe(false)
    expect(view.light.intensity).toBe(0)
  })
})
