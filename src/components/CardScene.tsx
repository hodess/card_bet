import type { CSSProperties, RefObject } from 'react'
import Card, { type CardData } from './Card'
import TimerRing from './TimerRing'
import { isSettled, type Phase } from '../lib/auctionPhase'
import { useT } from '../hooks/useT'

// Scène carte : la carte, son anneau de compte à rebours, le flash et le tampon
// d'adjudication. Aucune logique de phase ici : elle arrive en prop, calculée par
// useAuctionPhase. La racine est la boîte carte elle-même : elle remplit la plaque
// de la table, dont les sièges partagent le repère.
export default function CardScene({
  card, phase, remaining, windowMs, color, urgent, flyStyle, winnerName, amount, cardRef,
}: {
  card: CardData
  phase: Phase
  remaining: number
  windowMs: number
  color: string
  urgent: boolean
  flyStyle: string | null
  winnerName: string
  amount: number
  cardRef: RefObject<HTMLDivElement | null>
}) {
  const { t } = useT()
  const adjuge = isSettled(phase)
  // Repli quand la cible du vol n'est pas mesurable : fondu au lieu du vol
  const fondu = phase === 'fly' && flyStyle === null

  return (
    <div className="card-box" style={{ '--pc': color } as CSSProperties}>
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
  )
}
