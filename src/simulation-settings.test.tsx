import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import * as THREE from 'three'
import { defaultSimulationSettings, simulationFixtureOutput, validSimulationBrightness, validSimulationHaze } from './simulation-settings'
import { StageSimulator, createFixtureView } from './simulator'
import { stageCameraPresets } from './stage-camera'
import { SimulationControls } from './SimulationControls'
import { initialShow } from './seed'

describe('simulation-only controls', () => {
  it('bounds haze and recovers invalid local preferences while preserving explicit zero', () => {
    expect([0, 35, 100, -5, 200, NaN, Infinity].map(validSimulationHaze)).toEqual([0, 35, 100, 0, 100, 35, 35])
  })
  it('bounds brightness and recovers from nonfinite preferences', () => {
    expect(validSimulationBrightness(NaN)).toBe(100)
    expect(validSimulationBrightness(Infinity)).toBe(100)
    expect(validSimulationBrightness(-1)).toBe(10)
    expect(validSimulationBrightness(300)).toBe(200)
    expect(validSimulationBrightness(65)).toBe(65)
  })
  it('masks every independent head without mutating output or colors', () => {
    const source = { fixtureId: 'bar', intensity: 1, color: '#ff0000', haze: .6, segments: [{ intensity: 1, color: '#00ff00' }, { intensity: .5, color: '#ff0000' }] }
    const original = structuredClone(source)
    expect(simulationFixtureOutput(source, false)).toBe(source)
    const hidden = simulationFixtureOutput(source, true)
    expect(hidden.intensity).toBe(0)
    expect(hidden.haze).toBe(0)
    expect(hidden.segments?.map(segment => segment.intensity)).toEqual([0, 0])
    expect(source).toEqual(original)
  })
  it('applies exposure, masks haze and restores group light on the actual renderer update path', () => {
    const fixture = initialShow.fixtures.find(item => item.groupId === 'wash')!
    const view = createFixtureView(fixture, 0)
    const renderer = { toneMappingExposure: 1.1 }
    // Exercise rendering logic without constructing a GPU/context; browser QA covers real pixels.
    const atmosphere = new THREE.FogExp2('#101722', 0)
    const simulator = Object.assign(Object.create(StageSimulator.prototype), { renderer, atmosphere, fixtureGroups: new Map([[fixture.id, 'wash'], ['hazer', 'haze']]), lights: new Map([[fixture.id, [view]]]) }) as StageSimulator
    const frame = { atBeats: 1, mode: 'automation', fixtures: [{ fixtureId: fixture.id, intensity: 1, color: '#ffffff', haze: 0 }, { fixtureId: 'hazer', intensity: 0, color: '#000000', haze: 1 }] } as Parameters<StageSimulator['update']>[0]
    const saved = structuredClone(frame)
    simulator.update(frame, { brightness: 50, hiddenGroupIds: ['haze'] })
    expect(renderer.toneMappingExposure).toBe(.55)
    expect(view.beam.material.opacity).toBe(0)
    simulator.update(frame, { brightness: 50, hiddenGroupIds: ['wash'] })
    expect(view.light.intensity).toBe(0)
    expect(view.beam.visible).toBe(false)
    simulator.update(frame, defaultSimulationSettings)
    expect(renderer.toneMappingExposure).toBe(1.1)
    expect(view.light.intensity).toBe(40)
    expect(view.beam.material.opacity).toBeCloseTo(.08)
    // Explicit viewer haze is independent of machine output and never modifies the frame.
    simulator.update(frame, { ...defaultSimulationSettings, haze: 0 })
    expect(view.beam.visible).toBe(false)
    expect(atmosphere.density).toBe(0)
    simulator.update(frame, { ...defaultSimulationSettings, haze: 100, hiddenGroupIds: ['haze'] })
    expect(view.beam.material.opacity).toBeCloseTo(.08)
    expect(atmosphere.density).toBeCloseTo(.022)
    simulator.update({ ...frame, fixtures: [frame.fixtures[0]] }, { ...defaultSimulationSettings, haze: 35 })
    expect(view.beam.material.opacity).toBeCloseTo(.028)
    simulator.update(frame, { ...defaultSimulationSettings, haze: 100, hiddenGroupIds: ['wash'] })
    expect(view.beam.visible).toBe(false)
    expect(view.light.intensity).toBe(0)
    expect(view.beam.material.fog).toBe(false)
    expect(view.lamp.material.fog).toBe(false)
    expect(frame).toEqual(saved)
  })
  it('uses an explicit top-view up axis and resets it for other camera views', () => {
    const camera = new THREE.PerspectiveCamera()
    const simulator = Object.assign(Object.create(StageSimulator.prototype), { camera }) as StageSimulator
    for (const label of ['Bovenaan', 'Links', 'Zaal', 'Rechts']) {
      simulator.setCamera(stageCameraPresets.find(item => item.label === label)!.camera)
      expect(camera.up.toArray()).toEqual(label === 'Bovenaan' ? [0, 0, -1] : [0, 1, 0])
      expect(camera.matrix.elements.every(Number.isFinite)).toBe(true)
    }
  })
  it('keeps hidden-state feedback visible and offers recovery without live controls', () => {
    const html = renderToStaticMarkup(<SimulationControls show={initialShow} simulationSettings={{ brightness: 50, hiddenGroupIds: ['wash'] }} onSimulationSettingsChange={vi.fn()} onCameraChange={vi.fn()} />)
    expect(html).toContain('1 groep verborgen')
    expect(html).toContain('Alle groepen tonen')
    expect(html).toContain('geen wijziging aan Looks, groepsmasters of DMX')
    expect(html).toContain('Bovenaan')
    expect(html).toContain('Rook / haze')
    expect(html).toContain('rook 35%')
    expect(html).toContain('Herstel simulatieweergave')
    expect(html).not.toContain('<details class="simulation-controls" open')
  })
})
