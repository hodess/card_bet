import Card from './Card'
import PackTile from './PackTile'
import PositionLegend from './PositionLegend'
import { useT } from '../hooks/useT'
import type { PackInput } from '../lib/packs'
import type { PackSummary } from '../lib/packsApi'

// Aperçu de ce que les autres verront : la MÊME tuile et les MÊMES cartes que
// sur /packs. Le résumé est fabriqué depuis le JSON en cours d'écriture, le
// pack n'existant pas encore en base.
function resume(pack: PackInput): PackSummary {
  const notes = pack.cards.map(c => c.rating)
  return {
    slug: '', name: pack.name, emoji: pack.emoji, description: pack.description,
    positions: pack.positions, owner_username: null, visibility: 'private',
    is_mine: true,
    card_count: pack.cards.length,
    min_rating: Math.min(...notes),
    max_rating: Math.max(...notes),
  }
}

export default function PackPreview({ pack }: { pack: PackInput | null }) {
  const { t } = useT()
  if (!pack) return <p className="hint">{t('editor.emptyPreview')}</p>
  const triees = [...pack.cards].sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
  return (
    <div className="pack-editor-pane">
      <p className="hint">{t('editor.previewLabel')}</p>
      <PackTile pack={resume(pack)} />
      <PositionLegend positions={pack.positions} />
      <div className="mini-cards">
        {triees.map(c => <Card key={c.name} card={c} size="mini" />)}
      </div>
    </div>
  )
}
