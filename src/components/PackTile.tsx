import { useT } from '../hooks/useT'
import type { PackSummary } from '../lib/packsApi'

// Props → rendu : la tuile ne charge rien elle-même.
export default function PackTile({ pack }: { pack: PackSummary }) {
  const { t } = useT()
  return (
    <div className="pack-tile">
      <h2>{t(`packs.${pack.slug}.name`)}</h2>
      <p className="hint">{t(`packs.${pack.slug}.description`)}</p>
      <p className="hint">
        {t('packs.summary', {
          count: pack.card_count, min: pack.min_rating, max: pack.max_rating,
        })}
      </p>
    </div>
  )
}
