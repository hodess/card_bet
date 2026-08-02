import { useT } from '../hooks/useT'
import type { PackSummary } from '../lib/packsApi'

// Props → rendu : la tuile ne charge rien elle-même. Nom, emoji et description
// sont des DONNÉES (elles viennent de la base), pas des clés i18n.
export default function PackTile({ pack }: { pack: PackSummary }) {
  const { t } = useT()
  return (
    <div className="pack-tile">
      <h2>
        {pack.emoji && <span className="pack-emoji">{pack.emoji} </span>}
        {pack.name}
      </h2>
      {pack.owner_username && (
        <p className="hint">{t('packs.by', { name: pack.owner_username })}</p>
      )}
      {pack.description && <p className="hint">{pack.description}</p>}
      <p className="hint">
        {t('packs.summary', {
          count: pack.card_count, min: pack.min_rating, max: pack.max_rating,
        })}
      </p>
    </div>
  )
}
