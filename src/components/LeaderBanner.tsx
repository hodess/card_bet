import type { CSSProperties } from 'react'
import { avatarInitial } from '../lib/avatar'
import { useT } from '../hooks/useT'

// Bandeau meneur : qui mène, à combien. aria-live annonce les changements de
// meneur et l'adjudication aux lecteurs d'écran.
export default function LeaderBanner({ color, overline, name, bid, bidKey, raise, neutral }: {
  color: string
  overline: string
  name: string
  bid: number
  bidKey: string
  raise: number | null
  neutral: boolean
}) {
  const { t } = useT()
  return (
    <div
      className={`leader-banner${neutral ? ' neutral' : ''}`}
      style={{ '--pc': color } as CSSProperties}
      aria-live="polite"
    >
      <span className="lb-avatar">{neutral ? '?' : avatarInitial(name)}</span>
      <span className="lb-col">
        <span className="lb-overline">{overline}</span>
        <span className="lb-name">{name}</span>
      </span>
      <span className="lb-bid">
        <span className="lb-overline">{t('auction.bidLabel')}</span>
        <strong key={bidKey}>{bid} €</strong>
      </span>
      {raise !== null && <span className="lb-raise" key={bidKey}>+{raise} €</span>}
    </div>
  )
}
