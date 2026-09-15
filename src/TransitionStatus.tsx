import type { ShowDocument } from './domain'
import type { LookTransitionStatus } from './look-transitions'

export function TransitionStatus({ show, transition }: { show: ShowDocument; transition?: LookTransitionStatus }) {
  if (!transition) return null
  const name = show.looks.find(look => look.id === transition.toLookId)?.name ?? transition.toLookId
  return <p className="transition-status">{transition.phase === 'queued'
    ? `Volgende Look: ${name} · start op beat ${transition.startAtBeats.toFixed(1)}`
    : `Overgang naar ${name} · ${Math.round(transition.progress * 100)}%`}</p>
}
