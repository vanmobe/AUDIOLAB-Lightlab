import type { EvaluatedFixture } from './domain'

export interface SimulationSettings { brightness: number; hiddenGroupIds: string[]; haze?: number }
export const defaultSimulationSettings: SimulationSettings = { brightness: 100, hiddenGroupIds: [] }
export const simulationBrightnessKey = 'lightlab-simulation-brightness'
export const simulationHazeKey = 'lightlab-simulation-haze'
export const defaultSimulationHaze = 35
export function validSimulationHaze(value: number) { return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : defaultSimulationHaze }
export function validSimulationBrightness(value: number) { return Number.isFinite(value) ? Math.min(200, Math.max(10, value)) : 100 }

/** Hide emitted light, not stage objects. Never mutate the evaluated output used by other consumers. */
export function simulationFixtureOutput(fixture: EvaluatedFixture, hidden: boolean): EvaluatedFixture {
  return hidden ? { ...fixture, intensity: 0, haze: 0, segments: fixture.segments?.map(segment => ({ ...segment, intensity: 0 })) } : fixture
}
