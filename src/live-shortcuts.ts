import type { Look } from './domain'

export type LiveShortcut = 'previous-look' | 'next-look' | 'blackout' | 'toggle-playback' | 'help'

export function liveShortcutAction(event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey'>): LiveShortcut | undefined {
  if (event.altKey || event.ctrlKey || event.metaKey) return undefined
  switch (event.key) {
    case ',': return 'previous-look'
    case '.': return 'next-look'
    case 'b':
    case 'B': return 'blackout'
    case ' ': return 'toggle-playback'
    case '?': return 'help'
    default: return undefined
  }
}

export function isLiveShortcutTextInput(target: EventTarget | null) {
  if (!target || typeof (target as { closest?: unknown }).closest !== 'function') return false
  return !!(target as Element).closest('input, select, textarea, [contenteditable="true"], [role="textbox"]')
}

export function adjacentLookId(looks: Look[], activeLookId: string | undefined, direction: -1 | 1) {
  if (!looks.length) return undefined
  const current = looks.findIndex(look => look.id === activeLookId)
  return looks[(current < 0 ? 0 : (current + direction + looks.length) % looks.length)].id
}
