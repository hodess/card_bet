import { pipStates, showPips } from '../lib/auctionPhase'
import { useT } from '../hooks/useT'

// Barre d'état de l'enchère : avancement dans la partie. La bankroll vit
// maintenant dans le siège du joueur et dans la ligne d'aide des enchères.
export default function AuctionHeader({ seq, total }: { seq: number; total: number }) {
  const { t } = useT()
  return (
    <header className="auction-header">
      <span className="ah-label">{t('auction.cardLabel')}</span>
      {showPips(total) && (
        <span className="ah-pips">
          {pipStates(total, seq).map((etat, i) => <i key={i} className={`pip ${etat}`} />)}
        </span>
      )}
      <span className="ah-count">{seq}/{total}</span>
    </header>
  )
}
