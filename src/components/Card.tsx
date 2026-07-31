import { cardTier } from '../lib/game'
import { useT } from '../hooks/useT'

export type CardData = { name: string; position: string; rating: number }

// La carte FUT, seule source du markup .fut-card.
// full : note + poste + palier + nom (écran d'enchère) · mini : note + nom (+ prix payé si fourni)
export default function Card({ card, size = 'full', price }:
  { card: CardData; size?: 'full' | 'mini'; price?: number }) {
  const { t } = useT()
  const tier = cardTier(card.rating)
  return (
    <div className={`fut-card${size === 'mini' ? ' mini' : ''} ${tier}`}>
      <div className="fut-rating">{card.rating}</div>
      {size === 'full' && <div className="fut-position">{card.position}</div>}
      {size === 'full' && <div className="fut-tier">{t(`tier.${tier}`)}</div>}
      <div className="fut-name">{card.name}</div>
      {price !== undefined && <div className="fut-price">{price} €</div>}
    </div>
  )
}
