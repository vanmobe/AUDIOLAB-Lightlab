import { type DesignProposal, type DesignOptions, proposalCandidate } from './design-proposal'
import { materializeGroupTiming, type ShowDocument } from './domain'
import { assertShowDocument } from './show-validation'
import { patternSignature } from './pattern-language'

export const collectionKeys = ['colorProfiles', 'programs', 'looks'] as const
export type ProposalSelection = Record<(typeof collectionKeys)[number], string[]>
export const emptySelection = (): ProposalSelection => ({ colorProfiles: [], programs: [], looks: [] })

/** Dependencies are derived, not copied into user selection, so deselecting a Look releases them. */
export function resolveProposalSelection(proposal: DesignProposal, selection: ProposalSelection): ProposalSelection {
  const result = emptySelection()
  for (const key of collectionKeys)
    result[key] = proposal[key].filter((item) => selection[key].includes(item.id)).map((item) => item.id)
  const add = (key: 'programs' | 'colorProfiles', id?: string | null) => {
    if (id && proposal[key].some((item) => item.id === id) && !result[key].includes(id)) result[key].push(id)
  }
  for (const look of proposal.looks.filter((item) => result.looks.includes(item.id))) {
    add('programs', look.programId)
    add('colorProfiles', look.colorProfileId)
    for (const layer of look.layers ?? []) {
      add('programs', layer.programId)
      add('colorProfiles', layer.colorProfileId)
    }
  }
  for (const program of proposal.programs.filter((item) => result.programs.includes(item.id)))
    add('colorProfiles', program.defaultColorProfileId)
  return result
}

export function selectedProposalCandidate(
  show: ShowDocument,
  proposal: DesignProposal,
  options: DesignOptions,
  base: string,
  selection: ProposalSelection,
): ShowDocument {
  // Validate the complete provider answer first; partial acceptance never bypasses the trust boundary.
  const validated = proposalCandidate(show, proposal, options, base)
  const selected = resolveProposalSelection(proposal, selection)
  if (!collectionKeys.some((key) => selected[key].length)) throw new Error('Selecteer minstens één idee om te bewaren.')
  if (options.replace && options.scope !== 'all') {
    const selectedOptions = { ...options }
    selectedOptions.profileCount = selected.colorProfiles.length
    selectedOptions.programCount = selected.programs.length
    selectedOptions.lookCount = selected.looks.length
    const filtered: DesignProposal = {
      ...proposal,
      colorProfiles: proposal.colorProfiles.filter((item) => selected.colorProfiles.includes(item.id)),
      programs: proposal.programs.filter((item) => selected.programs.includes(item.id)),
      looks: proposal.looks.filter((item) => selected.looks.includes(item.id)),
    }
    return proposalCandidate(show, filtered, selectedOptions, base)
  }
  if (
    options.revision &&
    !collectionKeys.some((key) =>
      validated[key].some(
        (item) =>
          selected[key].includes(item.id) &&
          JSON.stringify(item) !== JSON.stringify(show[key].find((old) => old.id === item.id)),
      ),
    )
  )
    throw new Error('De geselecteerde ideeën wijzigen niets. Kies een gewijzigd item.')
  const next = structuredClone(options.revision ? materializeGroupTiming(show) : show)
  for (const key of collectionKeys) {
    const items = validated[key].filter((item) => selected[key].includes(item.id))
    ;(next[key] as Array<ShowDocument[typeof key][number]>) = [
      ...next[key].map((item) => items.find((updated) => updated.id === item.id) ?? item),
      ...items.filter((item) => !next[key].some((old) => old.id === item.id)),
    ]
    if (next[key].length > 32)
      throw new Error(`Maximum 32 ${key}. Selecteer minder ideeën of maak eerst plaats in de collectie.`)
  }
  const signatures = new Set(show.programs.filter((item) => !selected.programs.includes(item.id)).map(patternSignature))
  for (const program of next.programs.filter((item) => selected.programs.includes(item.id))) {
    const signature = patternSignature(program)
    if (signatures.has(signature))
      throw new Error('Een geselecteerd patroon bestaat al. Deselecteer het patroon en de Looks die het nodig hebben.')
    signatures.add(signature)
  }
  assertShowDocument(next)
  return next
}
