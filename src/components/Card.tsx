import { cardTier } from '../lib/game'
import { useT } from '../hooks/useT'

export type CardData = { name: string; position: string; rating: number }

// La carte FUT, seule source du markup .fut-card.
// full  : note + poste + palier + nom (écran d'enchère)
// sheet : idem à mi-taille — l'aperçu de la feuille de saisie de l'éditeur, où
//         l'auteur doit voir exactement la carte qu'il fabrique
// mini  : note + nom (+ prix payé si fourni)
export default function Card({ card, size = 'full', price }:
  { card: CardData; size?: 'full' | 'sheet' | 'mini'; price?: number }) {
  const { t } = useT()
  const tier = cardTier(card.rating)
  const complet = size !== 'mini'
  return (
    <div className={`fut-card${size === 'full' ? '' : ` ${size}`} ${tier}`}>
      <div className="fut-rating">{card.rating}</div>
      {complet && <div className="fut-position">{card.position}</div>}
      {complet && <div className="fut-tier">{t(`tier.${tier}`)}</div>}
      <div className="fut-name">{card.name}</div>
      {price !== undefined && <div className="fut-price">{price} €</div>}
    </div>
  )
}
