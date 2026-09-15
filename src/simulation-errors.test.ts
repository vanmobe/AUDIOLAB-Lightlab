import { expect, it } from 'vitest'
import { SimulationBudgetError, simulationErrorMessage } from './simulation-errors'
import { assertSimulationBudget } from './simulator'
import { initialShow } from './seed'

it('shows only authored budget errors and sanitizes other errors', () => {
  expect(simulationErrorMessage(new SimulationBudgetError('Simulatie gepauzeerd: maximaal 256 lichtpunten.'), 'Fallback')).toContain('256 lichtpunten')
  expect(simulationErrorMessage(new Error('private GPU detail'), 'Fallback')).toBe('Fallback')
  expect(simulationErrorMessage({ message: 'forged', name: 'SimulationBudgetError' }, 'Fallback')).toBe('Fallback')
})
it('uses the authored type at the actual budget boundary', () => {
  const oversized = Array.from({ length: 257 }, () => initialShow.fixtures[0])
  expect(() => assertSimulationBudget(oversized)).toThrow(SimulationBudgetError)
})
