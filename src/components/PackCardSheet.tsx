import config from '../config.json'
import Card from './Card'
import PositionChips from './PositionChips'
import RatingSlider from './RatingSlider'
import SheetPanel from './SheetPanel'
import { useT } from '../hooks/useT'
import { validateCard, type DraftCard, type DraftPosition } from '../lib/packDraft'

const L = config.packs.cards

// La feuille de saisie d'une carte. Contrôlée : la carte vit dans la page, ce qui
// lui permet de survivre à un aller-retour vers le panneau Positions.
export default function PackCardSheet({
  card, positions, others, mode, number,
  onChange, onSubmit, onAddNext, onDelete, onCancel, onAddPosition,
}: {
  card: DraftCard
  positions: readonly DraftPosition[]
  others: ReadonlySet<string>
  mode: 'ajout' | 'edition'
  number: number
  onChange: (card: DraftCard) => void
  onSubmit: () => void
  onAddNext: () => void
  onDelete: () => void
  onCancel: () => void
  onAddPosition: () => void
}) {
  const { t } = useT()
  const issues = validateCard(card, positions.map(p => p.code), others)
  const valide = Object.keys(issues).length === 0
  const titre = mode === 'ajout' ? t('editor.cardNew', { number }) : t('editor.cardEdit')

  return (
    <SheetPanel
      title={titre}
      left={{ label: t('common.cancel'), onClick: onCancel }}
      right={{ label: t('editor.done'), onClick: onSubmit, disabled: !valide }}
      onClose={onCancel}
    >
      {/* Aperçu : la vraie carte FUT, pour que l'auteur voie ce qu'il fabrique.
          Une note pas encore saisie s'affiche à sa valeur par défaut — la carte
          reste un aperçu, l'erreur est dite sous le curseur. */}
      <Card size="sheet" card={{
        name: card.name || '—',
        position: card.position,
        rating: card.rating ?? L.ratingDefault,
      }} />

      {/* Entrée enchaîne : c'est ce qui rend la saisie de 30 cartes supportable. */}
      <form className="field" onSubmit={e => {
        e.preventDefault()
        if (!valide) return
        if (mode === 'ajout') onAddNext()
        else onSubmit()
      }}>
        <div className="field-head">
          <label htmlFor="carte-nom">{t('editor.cardName')}</label>
          <span className="field-hint">
            {t('editor.counter', { n: [...card.name].length, max: L.nameMaxLength })}
          </span>
        </div>
        <input id="carte-nom" autoFocus value={card.name}
               onChange={e => onChange({ ...card, name: e.target.value })} />
        {issues.name && <p className="error">{t(issues.name.key, issues.name.params)}</p>}
      </form>

      <div className="field">
        <span className="field-name">{t('editor.cardPosition')}</span>
        <PositionChips positions={positions} value={card.position}
                       onPick={code => onChange({ ...card, position: code ?? '' })}
                       onAdd={onAddPosition} />
        {issues.position && <p className="error">{t(issues.position.key, issues.position.params)}</p>}
      </div>

      <div className="field">
        <div className="field-head">
          <span className="field-name">{t('editor.cardRating')}</span>
          <span className="field-hint">
            {t('editor.cardRatingHint', {
              min: L.ratingMin, max: L.ratingMax,
              tier: t('tier.gold'), threshold: L.tiers.gold,
            })}
          </span>
        </div>
        <RatingSlider value={card.rating} onChange={rating => onChange({ ...card, rating })} />
        {issues.rating && <p className="error">{t(issues.rating.key, issues.rating.params)}</p>}
      </div>

      {mode === 'ajout'
        ? (
          <>
            <button type="button" className="editor-add" disabled={!valide} onClick={onAddNext}>
              {t('editor.cardAddNext')}
            </button>
            <p className="hint">{t('editor.cardEnterHint')}</p>
          </>
          )
        : (
          <button type="button" className="pass" onClick={onDelete}>
            {t('editor.cardDelete')}
          </button>
          )}
    </SheetPanel>
  )
}
