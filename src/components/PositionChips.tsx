import { useT } from '../hooks/useT'
import type { DraftPosition } from '../lib/packDraft'

// La rangée de chips de positions, deux emplois pour un seul composant :
// filtrer la liste (avec « Tous » et les compteurs) et choisir la position d'une
// carte (sans). Le `+` est facultatif — il mène au panneau Positions.
export default function PositionChips({ positions, value, counts, allLabel, onPick, onAdd }: {
  positions: readonly DraftPosition[]
  value: string | null
  counts?: Record<string, number>
  allLabel?: string
  onPick: (code: string | null) => void
  onAdd?: () => void
}) {
  const { t } = useT()
  return (
    <div className="pos-chips">
      {allLabel !== undefined && (
        <button type="button" className={`pos-chip${value === null ? ' on' : ''}`}
                onClick={() => onPick(null)}>
          {allLabel}
        </button>
      )}
      {positions.map(p => (
        <button key={p.id} type="button"
                className={`pos-chip${value === p.code ? ' on' : ''}`}
                onClick={() => onPick(p.code)}>
          {p.code || '—'}{counts ? ` ${counts[p.code] ?? 0}` : ''}
        </button>
      ))}
      {onAdd && (
        <button type="button" className="pos-chip add" onClick={onAdd}>
          {t('editor.addPositionChip')}
        </button>
      )}
    </div>
  )
}
