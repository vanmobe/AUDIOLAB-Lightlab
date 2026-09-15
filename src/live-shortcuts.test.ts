import { expect, it } from 'vitest'
import { adjacentLookId, isLiveShortcutTextInput, liveShortcutAction } from './live-shortcuts'
import { initialShow } from './seed'

it('maps only unmodified live-operation shortcuts', () => {
  expect(liveShortcutAction({ key: '.', altKey: false, ctrlKey: false, metaKey: false })).toBe('next-look')
  expect(liveShortcutAction({ key: ',', altKey: false, ctrlKey: false, metaKey: false })).toBe('previous-look')
  expect(liveShortcutAction({ key: 'B', altKey: false, ctrlKey: false, metaKey: false })).toBe('blackout')
  expect(liveShortcutAction({ key: ' ', altKey: false, ctrlKey: false, metaKey: false })).toBe('toggle-playback')
  expect(liveShortcutAction({ key: '?', altKey: false, ctrlKey: false, metaKey: false })).toBe('help')
  expect(liveShortcutAction({ key: 'b', altKey: false, ctrlKey: true, metaKey: false })).toBeUndefined()
})

it('cycles Looks and never treats text-entry controls as live commands', () => {
  const looks = initialShow.looks
  expect(adjacentLookId(looks, looks[0].id, 1)).toBe(looks[1].id)
  expect(adjacentLookId(looks, looks[0].id, -1)).toBe(looks[looks.length - 1]?.id)
  expect(
    isLiveShortcutTextInput({
      closest: (selector: string) => (selector.includes('input') ? {} : null),
    } as unknown as EventTarget),
  ).toBe(true)
  expect(isLiveShortcutTextInput(null)).toBe(false)
})
