import type { RuntimeState, ShowDocument } from './domain'
import { fixtureProfiles } from './fixtures'

export interface RehearsalState extends RuntimeState {
  programId?: string
  /** Palette audition without needing a stored static program. */
  auditionStatic?: boolean
  groupIntensities?: Record<string, number>
}

/** Temporary rendering input only: never store or export this synthetic Look. */
export function rehearsalPreview(show: ShowDocument, state: RehearsalState) {
  const look =
    show.looks.find((item) => item.id === state.activeLookId) ??
    show.looks.find((item) => item.id === show.activeLookId) ??
    show.looks[0]
  const override = show.programs.find((item) => item.id === state.programId)
  const audition = !!override || !!state.auditionStatic
  const program = override ?? show.programs.find((item) => item.id === look?.programId) ?? show.programs[0]
  const profile =
    show.colorProfiles.find((item) => item.id === state.colorLockId) ??
    show.colorProfiles.find((item) => item.id === look?.colorProfileId) ??
    show.colorProfiles[0]
  const previewId = 'rehearsal-preview'
  const previewShow: ShowDocument = {
    ...show,
    groups: show.groups.map((group) => ({
      ...group,
      intensity: state.groupIntensities?.[group.id] ?? group.intensity,
    })),
    looks:
      (look || audition) && program && profile
        ? [
            {
              ...(look ?? { name: 'Voorbeeld', colorProfileId: profile.id }),
              id: previewId,
              programId: program.id,
              // Auditioning a pure pattern is explicitly separate from playing a complete Look.
              // Palette-only audition keeps fixed group palettes and the original layering intact.
              ...(audition
                ? {
                    name: state.auditionStatic ? 'Losse kleur' : 'Losse animatie',
                    layers: show.groups.map((group) => {
                      const illuminated = show.fixtures.some(
                        (fixture) =>
                          fixture.groupId === group.id &&
                          fixtureProfiles.find((p) => p.id === fixture.profileId)?.kind !== 'hazer',
                      )
                      return {
                        groupId: group.id,
                        mode: !illuminated
                          ? ('off' as const)
                          : state.auditionStatic
                            ? ('static' as const)
                            : ('animation' as const),
                        programId: illuminated && !state.auditionStatic ? override!.id : null,
                        colorProfileId: null,
                        intensity: 1,
                        rateBeats: 1,
                        offsetBeats: 0,
                      }
                    }),
                  }
                : {}),
            },
          ]
        : [],
    activeLookId: previewId,
  }
  return {
    show: previewShow,
    state: { ...state, activeLookId: previewId, colorLockId: profile?.id },
    look,
    program,
    profile,
    custom: audition || profile?.id !== look?.colorProfileId,
  }
}

export function chooseRehearsalItem(
  show: ShowDocument,
  state: RehearsalState,
  kind: 'program' | 'profile',
  id: string,
): RehearsalState {
  return {
    ...state,
    mode: 'automation',
    heldAtBeats: undefined,
    auditionStatic: false,
    programId: kind === 'program' ? id : state.programId,
    colorLockId: kind === 'profile' ? id : state.colorLockId,
  }
}

export function followRehearsalLook(state: RehearsalState, id: string): RehearsalState {
  return {
    ...state,
    mode: 'automation',
    activeLookId: id,
    programId: undefined,
    colorLockId: undefined,
    heldAtBeats: undefined,
    auditionStatic: false,
  }
}
