import type { CSSProperties } from 'react'
import { isSettled, type Phase } from '../lib/auctionPhase'
import { formatMs } from '../lib/game'
import { useT } from '../hooks/useT'

// Compteur sous la carte : le temps restant et ce qu'il annonce. `--pc` colore le
// chiffre de la couleur du meneur, comme le bandeau juste au-dessus.
export default function CardCount({ phase, remaining, urgent, color }: {
  phase: Phase
  remaining: number
  urgent: boolean
  color: string
}) {
  const { t } = useT()
  const adjuge = isSettled(phase)
  const legende = phase === 'reveal' ? t('auction.newCard')
    : phase === 'pause' ? t('auction.awaitingOpen')
    : phase === 'discarded' ? t('auction.discardedLegend')
    : adjuge ? t('auction.stampSold')
    : urgent ? t('auction.closingIn')
    : t('auction.noRaise')

  return (
    <p className="card-count" style={{ '--pc': color } as CSSProperties}>
      <strong className={urgent ? 'urgent' : undefined}>{formatMs(remaining)}</strong>
      <span>{legende}</span>
    </p>
  )
}
