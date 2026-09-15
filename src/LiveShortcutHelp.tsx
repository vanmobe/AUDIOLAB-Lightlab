import { useEffect, useRef } from 'react'
import './LiveShortcutHelp.css'

export function LiveShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    close.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])
  if (!open) return null
  return <div className="live-shortcut-overlay">
    <section className="live-shortcut-help" role="dialog" aria-modal="true" aria-labelledby="live-shortcut-title">
      <header><div><p className="section-label">LIVEBEDIENING</p><h2 id="live-shortcut-title">Snelle toetsen</h2></div><button ref={close} onClick={onClose}>Sluiten</button></header>
      <dl>
        <div><dt><kbd>,</kbd> / <kbd>.</kbd></dt><dd>Vorige / volgende Look</dd></div>
        <div><dt><kbd>Spatie</kbd></dt><dd>Show afspelen / beeld vasthouden</dd></div>
        <div><dt><kbd>B</kbd></dt><dd>Blackout</dd></div>
        <div><dt><kbd>?</kbd></dt><dd>Deze hulp openen</dd></div>
      </dl>
      <p>Toetsen zijn uitgeschakeld tijdens tekstinvoer en wanneer je een veld, slider of keuzelijst bedient.</p>
    </section>
  </div>
}
