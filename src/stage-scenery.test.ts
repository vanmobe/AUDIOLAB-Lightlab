import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createStageScenery } from './stage-scenery'

describe('stage scenery', () => {
  it('keeps the deployment floor at y=0 with a 14 by 10 metre platform underneath', () => {
    const floor = createStageScenery().getObjectByName('stage-floor')!
    const bounds = new THREE.Box3().setFromObject(floor)
    expect(bounds.max.y).toBeCloseTo(0)
    expect(bounds.min.y).toBeCloseTo(-0.3)
    expect(bounds.getSize(new THREE.Vector3()).x).toBeCloseTo(14)
    expect(bounds.getSize(new THREE.Vector3()).z).toBeCloseTo(10)
    expect(floor.receiveShadow).toBe(true)
    const material = (floor as THREE.Mesh).material as THREE.MeshStandardMaterial
    expect(material.roughness).toBe(0.6)
    expect(material.color.r).toBeGreaterThan(0.2)
  })

  it('places pleated light-receiving curtains behind and outside the usable stage', () => {
    const stage = createStageScenery()
    const rear = stage.getObjectByName('stage-curtain')!
    const bounds = new THREE.Box3().setFromObject(rear)
    expect(bounds.min.y).toBeCloseTo(0)
    expect(bounds.max.y).toBeCloseTo(5)
    expect(bounds.max.z).toBeLessThan(-5)
    expect(bounds.max.z - bounds.min.z).toBeGreaterThan(0.2)
    for (const side of ['left', 'right']) {
      const wing = stage.getObjectByName(`stage-wing-${side}`)!
      const wingBounds = new THREE.Box3().setFromObject(wing)
      expect(Math.min(Math.abs(wingBounds.min.x), Math.abs(wingBounds.max.x))).toBeGreaterThan(7)
      expect(wing.receiveShadow).toBe(true)
    }
  })

  it('uses a bounded structural truss with shared buffers and no artificial illumination', () => {
    const stage = createStageScenery()
    const truss = stage.getObjectByName('stage-truss')!
    expect(truss.position.toArray()).toEqual([0, 4.8, -3])
    expect(new THREE.Box3().setFromObject(truss).getSize(new THREE.Vector3()).x).toBeCloseTo(12.028, 2)
    const geometries = new Set<THREE.BufferGeometry>()
    let meshes = 0
    stage.traverse((object) => {
      expect(object).not.toBeInstanceOf(THREE.Light)
      if (!(object instanceof THREE.Mesh)) return
      meshes++
      geometries.add(object.geometry)
      expect(object.material).toBeInstanceOf(THREE.MeshStandardMaterial)
      const material = object.material as THREE.MeshStandardMaterial
      expect(material.emissive.getHex()).toBe(0)
      expect(material.color.r).toBe(material.color.g)
      expect(material.color.g).toBe(material.color.b)
      expect(material.map).toBeNull()
      expect(object.castShadow).toBe(true)
    })
    expect(meshes).toBeLessThan(150)
    expect(geometries.size).toBe(4)
  })
})
