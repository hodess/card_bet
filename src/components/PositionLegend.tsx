import { useT } from '../hooks/useT'

// Le vocabulaire de positions du pack. Les codes et les libellés sont des
// données : ils ne passent pas par t().
export default function PositionLegend({ positions }: { positions: Record<string, string> }) {
  const { t } = useT()
  const entrees = Object.entries(positions)
  if (entrees.length === 0) return null
  return (
    <p className="hint position-legend">
      <span className="position-legend-title">{t('packs.positionsTitle')} : </span>
      {entrees.map(([code, libelle], i) => (
        <span key={code}>
          {i > 0 && ' · '}
          <strong>{code}</strong> {libelle}
        </span>
      ))}
    </p>
  )
}
