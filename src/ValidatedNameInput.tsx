import { useEffect, useState } from 'react'

/** Blank intermediate edits stay local instead of invalidating the saved document. */
export function ValidatedNameInput({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <input
      value={draft}
      maxLength={1024}
      onChange={(event) => {
        const next = event.target.value
        setDraft(next)
        if (next.trim() && next.length <= 1024) onChange(next)
      }}
      onBlur={() => {
        if (!draft.trim() || draft.length > 1024) setDraft(value)
      }}
    />
  )
}
