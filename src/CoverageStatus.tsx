import type { EvaluatedFrame, ShowDocument } from './domain'
import { fixtureProfiles } from './fixtures'
import { coverageReport } from './show-regie'

export function safetyLabel(show: ShowDocument) {
  const groups = show.regie?.safetyGroupIds ?? ['front']
  return groups.length === 1 && groups[0] === 'front' ? 'Alleen frontlicht' : 'Gedeeltelijke blackout'
}

export function CoverageStatus({
  show,
  frame,
  transitioning = false,
}: {
  show: ShowDocument
  frame: EvaluatedFrame
  transitioning?: boolean
}) {
  if (!show.regie?.minimumCoverage.percent) return null
  const result = coverageReport(show, fixtureProfiles, frame)
  return (
    <p className={result.applied && result.unmet > 0 ? 'app-notice' : 'caption'}>
      Lichtdekking: {result.lit}/{result.total} lichtpunten · {Math.round(result.percent)}% · doel{' '}
      {show.regie.minimumCoverage.percent}%.
      {!result.applied
        ? ' Blackout/veiligheidslicht heeft voorrang.'
        : result.unmet > 0
          ? transitioning
            ? ' Tijdens de overgang kan de dekking tijdelijk onder het doel liggen.'
            : ` Doel niet haalbaar: ${result.unmet} lichtpunten tekort door uitgeschakelde groepen of niveaulimieten.`
          : ' Doel bereikt.'}
    </p>
  )
}
