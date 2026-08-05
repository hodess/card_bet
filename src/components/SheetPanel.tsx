import { useEffect } from 'react'
import type { ReactNode } from 'react'

// L'enveloppe des trois panneaux plein écran de l'éditeur (carte, positions,
// réglages) : overlay, barre de titre à trois zones, fermeture au clic dehors et
// à Échap. Même motif que le drawer de NavMenu, à qui elle emprunte .nav-overlay.
// props → rendu : elle ne sait rien du contenu qu'elle encadre.
export default function SheetPanel({ title, left, right, onClose, children }: {
  title: string
  left: { label: string; onClick: () => void }
  right?: { label: string; onClick: () => void; disabled?: boolean }
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="nav-overlay" onClick={onClose} />
      <section className="sheet-panel" role="dialog" aria-modal="true" aria-label={title}>
        <header className="sheet-bar">
          <button type="button" className="linklike" onClick={left.onClick}>{left.label}</button>
          <strong>{title}</strong>
          {right
            ? (
              <button type="button" className="linklike accent"
                      disabled={right.disabled} onClick={right.onClick}>
                {right.label}
              </button>
              )
            : <span />}
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </>
  )
}
