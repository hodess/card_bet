import type { CSSProperties, RefObject } from 'react'
import Card, { type CardData } from './Card'
import TimerRing from './TimerRing'
import { isUrgent, type Phase } from '../lib/auctionPhase'
import { formatMs } from '../lib/game'
import { useT } from '../hooks/useT'

// Scène carte : la carte, son anneau de compte à rebours, le flash et le tampon
// d'adjudication, et le compteur texte. Aucune logique de phase ici : elle arrive
// en prop, calculée par useAuctionPhase.
export default function CardScene({
  card, phase, remaining, windowMs, color, flyStyle, winnerName, amount, cardRef,
}: {
  card: CardData
  phase: Phase
  remaining: number
  windowMs: number
  color: string
  flyStyle: string | null
  winnerName: string
  amount: number
  cardRef: RefObject<HTMLDivElement | null>
}) {
  const { t } = useT()
  const urgent = phase === 'bid' && isUrgent(remaining)
  const adjuge = phase === 'sold' || phase === 'fly' || phase === 'landed'
  // Repli quand la cible du vol n'est pas mesurable : fondu au lieu du vol
  const fondu = phase === 'fly' && flyStyle === null
  const legende = phase === 'reveal' ? t('auction.newCard')
    : adjuge ? t('auction.stampSold')
    : urgent ? t('auction.closingIn')
    : t('auction.noRaise')

  return (
    <div className="card-scene" style={{ '--pc': color } as CSSProperties}>
      <div className="card-box">
        <TimerRing
          remaining={phase === 'reveal' ? 0 : remaining}
          windowMs={windowMs}
          urgent={urgent}
        />
        <div
          ref={cardRef}
          className={`card-holder ${phase}${fondu ? ' fade' : ''}`}
          style={flyStyle ? { transform: flyStyle } : undefined}
        >
          <Card card={card} />
          {phase === 'sold' && <span className="card-flash" />}
          {adjuge && (
            <span className="card-stamp">
              <strong>{t('auction.stampSold')}</strong>
              <small>{winnerName} · {amount} €</small>
            </span>
          )}
        </div>
      </div>
      <p className="card-count">
        <strong className={urgent ? 'urgent' : undefined}>{formatMs(remaining)}</strong>
        <span>{legende}</span>
      </p>
    </div>
  )
}
