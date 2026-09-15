import { describe, expect, it } from 'vitest'
import { initialShow } from './seed'
import { evaluateFrame } from './domain'
import { fixtureProfiles } from './fixtures'
import { chooseRehearsalItem, followRehearsalLook, rehearsalPreview, type RehearsalState } from './rehearsal'
import { editLookLayer } from './LookEditor'
import { assertShowDocument, parseShowDocument } from './show-validation'

const state: RehearsalState = { mode: 'automation', activeLookId: initialShow.activeLookId }

describe('independent rehearsal selection', () => {
  it('renders every program/profile pair, including items with no Look', () => {
    const show = structuredClone(initialShow)
    show.programs.push({ ...show.programs[0], id: 'unlinked-program', effect: 'pulse' })
    show.colorProfiles.push({ ...show.colorProfiles[0], id: 'unlinked-profile', primary: '#ff0000', accent: '#00ff00' })
    for (const program of show.programs)
      for (const profile of show.colorProfiles) {
        const chosen = chooseRehearsalItem(
          show,
          chooseRehearsalItem(show, state, 'program', program.id),
          'profile',
          profile.id,
        )
        const preview = rehearsalPreview(show, chosen)
        expect(preview.program?.id).toBe(program.id)
        expect(preview.profile?.id).toBe(profile.id)
        // A standalone animation auditions all lighting groups, not its legacy target list.
        const allLightGroups = show.groups
          .filter((group) =>
            show.fixtures.some(
              (fixture) =>
                fixture.groupId === group.id &&
                fixtureProfiles.find((p) => p.id === fixture.profileId)?.kind !== 'hazer',
            ),
          )
          .map((group) => group.id)
        expect(evaluateFrame(preview.show, fixtureProfiles, preview.state, 0)).toEqual(
          evaluateFrame(
            {
              ...show,
              programs: show.programs.map((p) => (p.id === program.id ? { ...p, targetGroupIds: allLightGroups } : p)),
              looks: [{ id: 'expected', name: '', programId: program.id, colorProfileId: profile.id }],
            },
            fixtureProfiles,
            { mode: 'automation', activeLookId: 'expected' },
            0,
          ),
        )
      }
  })

  it('preserves the other choice and resumes from blackout or a frozen frame', () => {
    const programId = initialShow.programs[1].id
    const profileId = initialShow.colorProfiles[1].id
    const chosen = chooseRehearsalItem(
      initialShow,
      { ...state, mode: 'blackout', heldAtBeats: 3, colorLockId: profileId },
      'program',
      programId,
    )
    expect(chosen).toMatchObject({ mode: 'automation', programId, colorLockId: profileId, heldAtBeats: undefined })
    expect(
      chooseRehearsalItem(initialShow, { ...chosen, mode: 'static' }, 'profile', initialShow.colorProfiles[0].id)
        .programId,
    ).toBe(programId)
  })

  it('following a Look clears overrides while keeping temporary group levels', () => {
    const chosen = { ...state, programId: 'other', colorLockId: 'other', groupIntensities: { wash: 0.2 } }
    const followed = followRehearsalLook(chosen, initialShow.looks[1].id)
    const preview = rehearsalPreview(initialShow, followed)
    expect(preview.program?.id).toBe(initialShow.looks[1].programId)
    expect(preview.profile?.id).toBe(initialShow.looks[1].colorProfileId)
    expect(preview.custom).toBe(false)
    expect(followed.groupIntensities).toEqual({ wash: 0.2 })
  })

  it('keeps temporary group levels outside the stored show', () => {
    const before = JSON.stringify(initialShow)
    const preview = rehearsalPreview(initialShow, { ...state, groupIntensities: { wash: 0 } })
    expect(preview.show.groups.find((group) => group.id === 'wash')?.intensity).toBe(0)
    expect(JSON.stringify(initialShow)).toBe(before)
  })
  it('auditions a pure animation before any Look exists', () => {
    const show = { ...initialShow, looks: [], activeLookId: '' }
    const program = show.programs.find((item) => item.effect === 'pulse')!
    const preview = rehearsalPreview(show, { mode: 'automation', activeLookId: '', programId: program.id })
    const first = evaluateFrame(preview.show, fixtureProfiles, preview.state, 0)
    const later = evaluateFrame(preview.show, fixtureProfiles, preview.state, program.rateBeats / 4)
    expect(preview.show.looks).toHaveLength(1)
    expect(first.fixtures[0].intensity).not.toBe(later.fixtures[0].intensity)
  })

  it('falls back to current show entries when prior selections no longer exist', () => {
    const preview = rehearsalPreview(initialShow, {
      ...state,
      activeLookId: 'removed',
      programId: 'removed',
      colorLockId: 'removed',
    })
    const look = initialShow.looks.find((item) => item.id === initialShow.activeLookId)!
    expect(preview.look).toBe(look)
    expect(preview.program?.id).toBe(look.programId)
    expect(preview.profile?.id).toBe(look.colorProfileId)
  })
  it('preserves complete Look layers and fixed palettes when only auditioning a color', () => {
    const show = structuredClone(initialShow)
    const look = show.looks[0]
    look.layers = [
      { groupId: 'front', mode: 'static', programId: null, colorProfileId: show.colorProfiles[0].id, intensity: 0.8 },
      { groupId: 'wash', mode: 'animation', programId: show.programs[1].id, colorProfileId: null, intensity: 0.9 },
    ]
    const followed = followRehearsalLook(state, look.id)
    const preview = rehearsalPreview(show, followed)
    expect(evaluateFrame(preview.show, fixtureProfiles, preview.state, 2)).toEqual(
      evaluateFrame(show, fixtureProfiles, followed, 2),
    )
    const chosen = chooseRehearsalItem(show, followed, 'profile', show.colorProfiles[1].id)
    expect(chosen.programId).toBeUndefined()
    const colorPreview = rehearsalPreview(show, chosen)
    expect(colorPreview.show.looks[0].layers).toEqual(look.layers)
    expect(evaluateFrame(colorPreview.show, fixtureProfiles, colorPreview.state, 2)).toEqual(
      evaluateFrame(show, fixtureProfiles, chosen, 2),
    )
  })
  it('can audition a color statically even when every original layer has a fixed palette', () => {
    const show = structuredClone(initialShow)
    show.looks[0].layers = show.groups.map((group) => ({
      groupId: group.id,
      mode: 'static',
      programId: null,
      colorProfileId: show.colorProfiles[0].id,
      intensity: 0.4,
    }))
    const preview = rehearsalPreview(show, {
      mode: 'automation',
      activeLookId: show.looks[0].id,
      colorLockId: show.colorProfiles[1].id,
      auditionStatic: true,
    })
    const frame = evaluateFrame(preview.show, fixtureProfiles, preview.state, 1)
    expect(frame.fixtures.find((fixture) => fixture.fixtureId === 'adj-2')?.color).toBe(show.colorProfiles[1].primary)
    expect(frame.fixtures.find((fixture) => fixture.fixtureId === 'hazer-1')?.intensity).toBe(0)
    expect(show.looks[0].layers[0].colorProfileId).toBe(show.colorProfiles[0].id)
  })
  it('retains edited group timing through persistence and renders it in rehearsal', () => {
    const show = structuredClone(initialShow)
    show.looks[0] = editLookLayer(show, show.looks[0], 'wash', {
      mode: 'animation',
      programId: 'pulse',
      rateBeats: 8,
      offsetBeats: 2,
    })
    assertShowDocument(show)
    const restored = parseShowDocument(JSON.stringify(show))
    const followed = followRehearsalLook(state, restored.looks[0].id)
    const preview = rehearsalPreview(restored, followed)
    expect(preview.show.looks[0].layers?.find((layer) => layer.groupId === 'wash')).toMatchObject({
      rateBeats: 8,
      offsetBeats: 2,
    })
    const unshifted = structuredClone(restored)
    unshifted.looks[0] = editLookLayer(unshifted, unshifted.looks[0], 'wash', { offsetBeats: 0 })
    for (const beat of [0, 1, 3.5]) {
      const frame = evaluateFrame(preview.show, fixtureProfiles, preview.state, beat)
      expect(frame).toEqual(evaluateFrame(restored, fixtureProfiles, followed, beat))
      expect(frame.fixtures.find((fixture) => fixture.fixtureId === 'adj-1')?.intensity).not.toBeCloseTo(
        evaluateFrame(unshifted, fixtureProfiles, followed, beat).fixtures.find(
          (fixture) => fixture.fixtureId === 'adj-1',
        )!.intensity,
      )
    }
  })
  it('restores saved timing when following a Look after standalone animation audition', () => {
    const show = structuredClone(initialShow)
    show.looks[0] = editLookLayer(show, show.looks[0], 'wash', {
      mode: 'animation',
      programId: 'pulse',
      rateBeats: 8,
      offsetBeats: -1.25,
    })
    const before = JSON.stringify(show)
    const audition = chooseRehearsalItem(show, state, 'program', 'chorus')
    const standalone = rehearsalPreview(show, audition)
    const auditionLayer = standalone.show.looks[0].layers?.find((layer) => layer.groupId === 'wash')
    expect(auditionLayer?.rateBeats).toBe(1)
    expect(auditionLayer?.offsetBeats).toBe(0)
    const followed = followRehearsalLook(audition, show.looks[0].id)
    const restored = rehearsalPreview(show, followed)
    expect(restored.custom).toBe(false)
    expect(restored.show.looks[0].layers?.find((layer) => layer.groupId === 'wash')).toMatchObject({
      programId: 'pulse',
      rateBeats: 8,
      offsetBeats: -1.25,
    })
    expect(evaluateFrame(restored.show, fixtureProfiles, restored.state, 2)).toEqual(
      evaluateFrame(show, fixtureProfiles, followed, 2),
    )
    expect(JSON.stringify(show)).toBe(before)
  })
})
