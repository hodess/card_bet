import { cardTier } from '../lib/game'

export type CardData = { name: string; position: string; rating: number }

// La carte FUT, seule source du markup .fut-card.
// full : note + poste + nom (écran d'enchère) · mini : note + nom (+ prix payé si fourni)
export default function Card({ card, size = 'full', price }:
  { card: CardData; size?: 'full' | 'mini'; price?: number }) {
  return (
    <div className={`fut-card${size === 'mini' ? ' mini' : ''} ${cardTier(card.rating)}`}>
      <div className="fut-rating">{card.rating}</div>
      {size === 'full' && <div className="fut-position">{card.position}</div>}
      <div className="fut-name">{card.name}</div>
      {price !== undefined && <div className="fut-price">{price} €</div>}
    </div>
  )
}
