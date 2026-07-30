import { cardsOf } from '../lib/game'
import { useT } from '../hooks/useT'

type StripPlayer = { id: string; nickname: string; bankroll: number }

export default function PlayersStrip({ players, ownedCards, deckSize, currentBidderId, passedIds }: {
  players: StripPlayer[]
  ownedCards: { player_id: string }[]
  deckSize: number
  currentBidderId: string
  passedIds: string[]
}) {
  const { t } = useT()
  return (
    <footer className="players-strip">
      {players.map(p => {
        const count = cardsOf(ownedCards, p.id).length
        const passed = passedIds.includes(p.id)
        const leading = p.id === currentBidderId
        return (
          <div key={p.id} className={`player-chip${leading ? ' leading' : ''}${passed ? ' passed' : ''}`}>
            <span className="chip-name">{p.nickname}</span>
            <span className="chip-bank">{p.bankroll} €</span>
            <span className="chip-deck">{'●'.repeat(count)}{'○'.repeat(Math.max(0, deckSize - count))}</span>
            {passed && <span className="chip-state">{t('auction.chipPassed')}</span>}
            {leading && <span className="chip-state">{t('auction.chipLeading')}</span>}
          </div>
        )
      })}
    </footer>
  )
}
