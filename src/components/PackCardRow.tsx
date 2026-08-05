import { cardTier } from '../lib/game'
import { useT } from '../hooks/useT'
import type { CardIssues, DraftCard } from '../lib/packDraft'

// Une ligne de la liste : badge de note coloré par palier, nom, et en sous-titre
// `code · libellé` — remplacé par le message d'erreur quand la ligne est fautive.
// Le libellé est fourni par l'appelant : une ligne ne lit pas le vocabulaire.
export default function PackCardRow({ card, label, issues, onClick }: {
  card: DraftCard
  label: string | null
  issues?: CardIssues
  onClick: () => void
}) {
  const { t } = useT()
  // Une seule erreur montrée par ligne, la plus haute dans l'ordre de lecture :
  // afficher trois messages sous un nom de carte ne rend pas la faute plus claire.
  const faute = issues && (issues.name ?? issues.position ?? issues.rating)
  const palier = card.rating === null ? 'empty' : cardTier(card.rating)
  return (
    <button type="button" className={`card-row${faute ? ' bad' : ''}`} onClick={onClick}>
      <span className={`row-rating ${palier}`}>{card.rating ?? '—'}</span>
      <span className="row-text">
        <span className="row-name">{card.name || '—'}</span>
        <span className={`row-sub${faute ? ' bad' : ''}`}>
          {faute
            ? t(faute.key, faute.params)
            : label
              ? `${card.position} · ${label}`
              : card.position}
        </span>
      </span>
    </button>
  )
}
