import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'type' | 'onInput'> & {
  value: number
  onCommit: (value: number) => void
}
const movementKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])

/** Runtime controls commit one completed gesture, not a network command for every pointer move. */
export function CommitRange({ value, onCommit, ...props }: Props) {
  const [draft, setDraft] = useState(value)
  const latest = useRef(value),
    draftValue = useRef(value),
    editing = useRef(false)
  latest.current = value
  useEffect(() => {
    if (!editing.current) {
      draftValue.current = value
      setDraft(value)
    }
  }, [value])
  function commit() {
    if (!editing.current) return
    editing.current = false
    if (draftValue.current !== latest.current) onCommit(draftValue.current)
  }
  function cancel() {
    editing.current = false
    draftValue.current = latest.current
    setDraft(latest.current)
  }
  return (
    <input
      {...props}
      type="range"
      value={draft}
      onPointerDown={(event) => {
        editing.current = true
        event.currentTarget.setPointerCapture?.(event.pointerId)
        props.onPointerDown?.(event)
      }}
      onChange={(event) => {
        editing.current = true
        draftValue.current = Number(event.target.value)
        setDraft(draftValue.current)
      }}
      onPointerUp={(event) => {
        commit()
        props.onPointerUp?.(event)
      }}
      onPointerCancel={(event) => {
        cancel()
        props.onPointerCancel?.(event)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          cancel()
        } else if (movementKeys.has(event.key)) editing.current = true
        else if (event.key === 'Enter') commit()
        props.onKeyDown?.(event)
      }}
      onKeyUp={(event) => {
        if (movementKeys.has(event.key)) commit()
        props.onKeyUp?.(event)
      }}
      onBlur={(event) => {
        commit()
        props.onBlur?.(event)
      }}
    />
  )
}
