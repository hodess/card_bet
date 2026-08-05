import config from '../config.json'
import SheetPanel from './SheetPanel'
import { useT } from '../hooks/useT'
import type { PackError } from '../lib/packs'
import type { DraftPosition, PositionIssues } from '../lib/packDraft'

// Le vocabulaire du pack. `refus` porte le message renvoyé par removePosition —
// le panneau ne décide de rien, il affiche.
export default function PackPositionsPanel({
  positions, counts, issues, refus, onRename, onLabel, onAdd, onRemove, onClose,
}: {
  positions: readonly DraftPosition[]
  counts: Record<string, number>
  issues: Record<string, PositionIssues>
  refus: PackError | null
  onRename: (id: string, code: string) => void
  onLabel: (id: string, label: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onClose: () => void
}) {
  const { t } = useT()
  const max = config.packs.positions.max

  return (
    <SheetPanel
      title={t('editor.positionsTitle')}
      left={{ label: t('editor.close'), onClick: onClose }}
      right={{ label: t('editor.done'), onClick: onClose }}
      onClose={onClose}
    >
      <p className="hint">{t('editor.positionsHelp', { max })}</p>
      {refus && <p className="error">{t(refus.key, refus.params)}</p>}

      <div className="pos-rows">
        {positions.map(p => {
          const pi = issues[p.id]
          return (
            <div key={p.id}>
              <div className={`pos-row${pi ? ' bad' : ''}`}>
                <input className="pos-code" value={p.code} aria-label={t('editor.positionCode')}
                       onChange={e => onRename(p.id, e.target.value)} />
                <input className="pos-label" value={p.label} aria-label={t('editor.positionLabel')}
                       placeholder={t('editor.positionLabel')}
                       onChange={e => onLabel(p.id, e.target.value)} />
                <span className="pos-count">
                  {t('packs.cardCount', { count: counts[p.code] ?? 0 })}
                </span>
                <button type="button" className="btn-ghost danger"
                        aria-label={t('editor.positionRemove')}
                        onClick={() => onRemove(p.id)}>×</button>
              </div>
              {pi?.code && <p className="error">{t(pi.code.key, pi.code.params)}</p>}
              {pi?.label && <p className="error">{t(pi.label.key, pi.label.params)}</p>}
            </div>
          )
        })}
      </div>

      <button type="button" className="btn-ghost" disabled={positions.length >= max} onClick={onAdd}>
        {t('editor.positionAdd')}
      </button>
    </SheetPanel>
  )
}
