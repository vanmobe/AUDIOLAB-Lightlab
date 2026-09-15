import { beforeEach, expect, it, vi } from 'vitest'
import { ValidatedNameInput } from './ValidatedNameInput'
import { initialShow } from './seed'
import { parseShowDocument } from './show-validation'

const state = vi.hoisted(() => ({ draft: undefined as string | undefined }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useEffect: () => {}, useState: (value: string) => [state.draft ?? value, (next: string) => { state.draft = next }] }))
beforeEach(() => { state.draft = undefined })

it.each(['', '   ', 'x'.repeat(1025)])('never persists an invalid intermediate name (%s)', invalid => {
  const show = structuredClone(initialShow), savedName = show.colorProfiles[0].name
  const onChange = vi.fn((name: string) => { show.colorProfiles[0].name = name })
  const render = () => ValidatedNameInput({ value: show.colorProfiles[0].name, onChange })
  render().props.onChange({ target: { value: invalid } })
  expect(onChange).not.toHaveBeenCalled()
  expect(parseShowDocument(JSON.stringify(show)).colorProfiles[0].name).toBe(savedName)
  render().props.onBlur()
  expect(render().props.value).toBe(savedName)
})

it('persists a valid name immediately and permits the schema boundary', () => {
  const onChange = vi.fn(), name = 'x'.repeat(1024)
  const input = ValidatedNameInput({ value: 'Old', onChange })
  expect(input.props.maxLength).toBe(1024)
  input.props.onChange({ target: { value: name } })
  expect(onChange).toHaveBeenCalledWith(name)
})
