import { pipStates, showPips } from '../lib/auctionPhase'
import { useT } from '../hooks/useT'

// Barre d'état de l'enchère : avancement dans la partie. Compté en cartes
// **adjugées** et non en `seq` : une carte défaussée au joker consomme un `seq`
// sans remplir aucun deck, et le total des cartes à gagner ne change pas.
export default function AuctionHeader({ won, total }: { won: number; total: number }) {
  const { t } = useT()
  const current = Math.min(won + 1, total)
  return (
    <header className="auction-header">
      <span className="ah-label">{t('auction.cardLabel')}</span>
      {showPips(total) && (
        <span className="ah-pips">
          {pipStates(total, current).map((etat, i) => <i key={i} className={`pip ${etat}`} />)}
        </span>
      )}
      <span className="ah-count">{current}/{total}</span>
    </header>
  )
}
