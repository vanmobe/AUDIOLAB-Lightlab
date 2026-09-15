import { useEffect, useId, useRef, type ReactNode } from 'react'
import './SidePanel.css'

/** Keep content mounted: closing a tool must not discard drafts or pending operations. */
export function SidePanel({
  open,
  onClose,
  title,
  children,
  closeDisabled = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  closeDisabled?: boolean
}) {
  const panel = useRef<HTMLDialogElement>(null)
  const heading = useId()
  useEffect(() => {
    const dialog = panel.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={panel}
      className="side-panel"
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault()
        if (!closeDisabled) onClose()
      }}
    >
      <header className="side-panel-heading">
        <h2 id={heading}>{title}</h2>
        <button type="button" disabled={closeDisabled} onClick={onClose} aria-label={`${title} sluiten`}>
          Sluiten ×
        </button>
      </header>
      <div className="side-panel-body">{children}</div>
    </dialog>
  )
}
