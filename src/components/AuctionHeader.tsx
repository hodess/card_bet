import { pipStates, showPips } from '../lib/auctionPhase'
import { useT } from '../hooks/useT'

// Barre d'état de l'enchère : avancement dans la partie + bankroll du joueur.
export default function AuctionHeader({ seq, total, bankroll }:
  { seq: number; total: number; bankroll: number }) {
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
      <span className="ah-bank">
        <span className="ah-bank-label">{t('auction.bankLabel')}</span>
        {/* key = valeur : un changement de bankroll remonte le nœud et rejoue `slam` */}
        <strong key={bankroll}>{bankroll} €</strong>
      </span>
    </header>
  )
}
