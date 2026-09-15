/** Only application-authored budget diagnostics may be shown verbatim. */
export class SimulationBudgetError extends Error {}

export function simulationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof SimulationBudgetError ? error.message : fallback
}
