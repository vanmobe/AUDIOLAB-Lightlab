import { describe, expect, it } from 'vitest'
import {
  assignControlBinding,
  bindingAtSlot,
  canAssignBinding,
  clearControlSlot,
  getControlSurfaceProfile,
  isControlSlot,
  moveControlBinding,
  renameControlBank,
  slotKey,
} from './control-surface'
import { initialShow } from './seed'
import type { ControlBinding, ControlSlot } from './domain'
import { assertShowDocument } from './show-validation'

const button = (index = 1, bank = 1): ControlSlot => ({ bank, kind: 'button', index })
const rotary = (index = 1, bank = 1): ControlSlot => ({ bank, kind: 'rotary', index })
const look: ControlBinding = { id: 'new-look-control', label: 'Warm', action: 'look', targetId: 'warm-static' }
const master: ControlBinding = {
  id: 'new-master-control',
  label: 'Washniveau',
  action: 'group-intensity',
  targetId: 'wash',
}

describe('vendor-neutral control surface capacity', () => {
  it('exposes Rack/full CC banks and Compact USER buttons without invented encoders', () => {
    for (const id of ['wing-rack', 'wing-full'])
      expect(getControlSurfaceProfile(id)).toMatchObject({ banks: 16, buttons: 8, rotaries: 4, buttonColumns: 4 })
    expect(getControlSurfaceProfile('wing-compact')).toMatchObject({
      banks: 1,
      buttons: 16,
      rotaries: 0,
      buttonColumns: 4,
    })
    expect(getControlSurfaceProfile('future-desk')).toBeUndefined()
  })
  it('accepts only compatible actions within the active profile capacity', () => {
    const rack = getControlSurfaceProfile('wing-rack')!,
      compact = getControlSurfaceProfile('wing-compact')!
    expect(canAssignBinding(look, button(8, 16), rack)).toBe(true)
    expect(canAssignBinding(master, rotary(4, 16), rack)).toBe(true)
    expect(canAssignBinding(look, button(9), rack)).toBe(false)
    expect(canAssignBinding(look, button(1, 17), rack)).toBe(false)
    expect(canAssignBinding(master, rotary(5), rack)).toBe(false)
    expect(canAssignBinding(master, button(), rack)).toBe(false)
    expect(canAssignBinding(look, rotary(), rack)).toBe(false)
    expect(canAssignBinding(master, rotary(), compact)).toBe(false)
    expect(canAssignBinding(look, button(16), compact)).toBe(true)
    expect(canAssignBinding(look, button(1, 2), compact)).toBe(false)
    for (const action of ['tap-tempo', 'follow'] as const)
      expect(canAssignBinding({ ...look, action }, button(), rack)).toBe(false)
  })
  it.each([
    null,
    {},
    { ...button(), bank: 0 },
    { ...button(), bank: 65 },
    { ...button(), bank: 1.5 },
    { ...button(), index: 65 },
    { ...button(), index: NaN },
    { ...button(), index: '1' },
    { ...button(), kind: 'fader' },
    { ...button(), cc: 16 },
  ])('rejects malformed slots %j', (slot) => {
    expect(isControlSlot(slot)).toBe(false)
  })
  it('retains a wider bounded stored slot format for future and unsupported profiles', () => {
    expect(isControlSlot({ bank: 64, kind: 'button', index: 64 })).toBe(true)
    expect(slotKey(button(4, 2))).toBe('2:button:4')
    expect(slotKey(rotary(4, 2))).not.toBe(slotKey(button(4, 2)))
  })
})

describe('immutable logical assignment', () => {
  it('assigns an existing legacy binding without moving any other unassigned binding', () => {
    const before = structuredClone(initialShow)
    const binding = initialShow.controlSurface.bindings[0]
    const next = assignControlBinding(initialShow, binding, button())
    expect(bindingAtSlot(next.controlSurface, button())?.id).toBe(binding.id)
    expect(next.controlSurface.bindings).toHaveLength(initialShow.controlSurface.bindings.length)
    expect(next.controlSurface.bindings.slice(1)).toEqual(initialShow.controlSurface.bindings.slice(1))
    expect(initialShow).toEqual(before)
    expect(() => assertShowDocument(next)).not.toThrow()
  })
  it('allows the same Look in multiple slots when actions have distinct IDs', () => {
    const first = assignControlBinding(initialShow, look, button())
    const second = assignControlBinding(first, { ...look, id: 'second-control' }, button(2))
    expect(bindingAtSlot(second.controlSurface, button())?.targetId).toBe('warm-static')
    expect(bindingAtSlot(second.controlSurface, button(2))?.targetId).toBe('warm-static')
    expect(() => assertShowDocument(second)).not.toThrow()
  })
  it('moves and swaps occupied compatible slots without copying or deleting actions', () => {
    let show = assignControlBinding(initialShow, look, button())
    show = assignControlBinding(show, { ...look, id: 'second', targetId: 'neon-chorus' }, button(2))
    const moved = moveControlBinding(show, look.id, button(2))
    expect(bindingAtSlot(moved.controlSurface, button(2))?.id).toBe(look.id)
    expect(bindingAtSlot(moved.controlSurface, button())?.id).toBe('second')
    expect(moved.controlSurface.bindings).toHaveLength(show.controlSurface.bindings.length)
    const empty = moveControlBinding(moved, look.id, button(3, 2))
    expect(bindingAtSlot(empty.controlSurface, button(2))).toBeUndefined()
    expect(bindingAtSlot(empty.controlSurface, button(3, 2))?.id).toBe(look.id)
  })
  it('preserves a displaced action as unassigned when assigning a new or unassigned action', () => {
    const first = assignControlBinding(initialShow, look, button())
    const next = assignControlBinding(first, { ...look, id: 'replacement' }, button())
    expect(next.controlSurface.bindings.find((binding) => binding.id === look.id)?.slot).toBeUndefined()
    expect(bindingAtSlot(next.controlSurface, button())?.id).toBe('replacement')
    expect(next.controlSurface.bindings).toHaveLength(first.controlSurface.bindings.length + 1)
  })
  it('clears only placement, retaining identity and target for recovery', () => {
    const first = assignControlBinding(initialShow, master, rotary())
    const cleared = clearControlSlot(first, rotary())
    expect(cleared.controlSurface.bindings.find((binding) => binding.id === master.id)).toEqual(master)
    expect(clearControlSlot(cleared, rotary())).toBe(cleared)
    expect(bindingAtSlot(first.controlSurface, rotary())?.id).toBe(master.id)
  })
  it('rejects incompatible drops and swaps without mutating the original document', () => {
    let show = assignControlBinding(initialShow, look, button())
    show = assignControlBinding(show, master, rotary())
    const before = structuredClone(show)
    expect(() => moveControlBinding(show, look.id, rotary())).toThrow('past niet')
    // Explicitly changing the dragged action still may not strand the displaced rotary on a button.
    expect(() => assignControlBinding(show, { ...master, id: look.id }, rotary())).toThrow('niet wisselen')
    expect(show).toEqual(before)
  })
  it('preserves assignments across model changes and permits recovery to a supported slot', () => {
    const rack = assignControlBinding(initialShow, look, button(8, 16))
    const compact = { ...rack, controlSurface: { ...rack.controlSurface, profileId: 'wing-compact' } }
    expect(() => assertShowDocument(compact)).not.toThrow()
    expect(bindingAtSlot(compact.controlSurface, button(8, 16))?.id).toBe(look.id)
    expect(canAssignBinding(look, button(8, 16), getControlSurfaceProfile('wing-compact'))).toBe(false)
    expect(bindingAtSlot(moveControlBinding(compact, look.id, button(16)).controlSurface, button(16))?.id).toBe(look.id)
  })
  it('rejects moves into an occupied slot if the source lies outside the new profile', () => {
    let rack = assignControlBinding(initialShow, look, button(8, 16))
    rack = assignControlBinding(rack, { ...look, id: 'second' }, button())
    const compact = { ...rack, controlSurface: { ...rack.controlSurface, profileId: 'wing-compact' } }
    expect(() => moveControlBinding(compact, look.id, button())).toThrow('niet wisselen')
  })
  it('bounds new bindings while allowing existing controls to move at capacity', () => {
    const full = {
      ...initialShow,
      controlSurface: {
        ...initialShow.controlSurface,
        bindings: Array.from({ length: 512 }, (_, index) => ({ ...look, id: `control-${index}` })),
      },
    }
    expect(() => assignControlBinding(full, look, button())).toThrow('Maximum 512')
    expect(moveControlBinding(full, 'control-0', button()).controlSurface.bindings).toHaveLength(512)
  })
  it('rejects missing targets, stale actions, unsupported controls and unknown profile assignments', () => {
    for (const binding of [
      { ...look, targetId: 'missing' },
      { ...master, targetId: 'missing' },
      { ...look, action: 'mode' as const, targetId: 'bad-mode' },
      { ...look, action: 'color-lock' as const, targetId: 'missing' },
      { ...look, action: 'tap-tempo' as const },
      { ...look, label: '' },
    ]) {
      expect(() =>
        assignControlBinding(initialShow, binding, binding.action === 'group-intensity' ? rotary() : button()),
      ).toThrow()
    }
    expect(() => moveControlBinding(initialShow, 'deleted', button())).toThrow('bestaat niet')
    expect(() =>
      assignControlBinding(
        { ...initialShow, controlSurface: { ...initialShow.controlSurface, profileId: 'future-desk' } },
        look,
        button(),
      ),
    ).toThrow('ondersteunde indeling')
  })
  it('renames banks without changing assigned controls, and empty names restore the default', () => {
    const named = renameControlBank(initialShow, 16, '  Refrein  ')
    expect(named.controlSurface.bankNames).toEqual({ '16': 'Refrein' })
    expect(named.controlSurface.bindings).toBe(initialShow.controlSurface.bindings)
    expect(renameControlBank(named, 16, '').controlSurface.bankNames).toEqual({})
    for (const [bank, name] of [
      [0, 'Test'],
      [65, 'Test'],
      [1, 'x'.repeat(81)],
    ] as const)
      expect(() => renameControlBank(named, bank, name)).toThrow()
  })
})
