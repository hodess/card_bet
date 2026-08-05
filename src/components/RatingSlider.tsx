import type { CSSProperties } from 'react'
import config from '../config.json'
import { useT } from '../hooks/useT'

const L = config.packs.cards

// Le contrôle de note : −/+, curseur, et une piste qui dessine les trois paliers.
// Les seuils viennent de config.packs.cards.tiers — la même source que cardTier,
// pour que la piste ne puisse pas mentir sur la couleur qu'aura la carte.
export default function RatingSlider({ value, onChange }: {
  value: number | null
  onChange: (rating: number) => void
}) {
  const { t } = useT()
  const { gold, silver } = L.tiers
  const courant = value ?? L.ratingDefault
  const pct = (n: number) => ((n - L.ratingMin) / (L.ratingMax - L.ratingMin)) * 100
  // Arrêts francs : chaque palier occupe exactement sa plage de notes, sans dégradé
  // de transition qui laisserait croire à une frontière floue.
  const tiers = 'linear-gradient(to right,'
    + ` var(--bronze2) 0%, var(--bronze1) ${pct(silver)}%,`
    + ` var(--silver2) ${pct(silver)}%, var(--silver1) ${pct(gold)}%,`
    + ` var(--gold2) ${pct(gold)}%, var(--gold1) 100%)`
  const borner = (n: number) => Math.min(L.ratingMax, Math.max(L.ratingMin, n))

  return (
    <div className="rating-row">
      <button type="button" className="rating-step" aria-label={t('editor.ratingDown')}
              onClick={() => onChange(borner(courant - 1))}>−</button>
      <div className="rating-track" style={{ '--tiers': tiers } as CSSProperties}>
        <input type="range" min={L.ratingMin} max={L.ratingMax} value={courant}
               aria-label={t('editor.cardRating')}
               onChange={e => onChange(Number(e.target.value))} />
        <div className="rating-bands">
          <span>{t('tier.bronze')} {L.ratingMin}–{silver - 1}</span>
          <span>{t('tier.silver')} {silver}–{gold - 1}</span>
          <span>{t('tier.gold')} {gold}+</span>
        </div>
      </div>
      <button type="button" className="rating-step" aria-label={t('editor.ratingUp')}
              onClick={() => onChange(borner(courant + 1))}>+</button>
    </div>
  )
}
