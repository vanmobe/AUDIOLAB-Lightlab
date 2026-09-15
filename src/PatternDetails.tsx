import { patternDescription, type Pattern } from './pattern-language'

/** Explain the validated recipe rather than trusting the model's prose to describe execution. */
export function PatternDetails({ pattern }: { pattern: Pattern }) {
  const total = pattern.steps.reduce((sum, step) => sum + step.weight, 0)
  return (
    <details className="pattern-details">
      <summary>
        Samengesteld patroon · {pattern.steps.length} {pattern.steps.length === 1 ? 'stap' : 'stappen'} · basisniveau{' '}
        {Math.round(pattern.floor * 100)}%
      </summary>
      <ol>
        {pattern.steps.map((step, index) => (
          <li key={index}>
            {patternDescription({ version: 1, floor: pattern.floor, steps: [step] })}
            <small> · {Math.round((step.weight / total) * 100)}% van de groepscyclus</small>
          </li>
        ))}
      </ol>
      <p className="muted">
        Deze stappen herhalen binnen de beatduur van elke groep. Geen eigen tempo of kleuren in het patroon.
      </p>
    </details>
  )
}
