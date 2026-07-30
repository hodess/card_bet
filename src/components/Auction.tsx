import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { GameState } from '../hooks/useGame'
import { useServerOffset } from '../hooks/useServerOffset'
import { useCountdown } from '../hooks/useCountdown'
import { maxBid, cardsOf } from '../lib/game'
import Card from './Card'
import TimerRing from './TimerRing'
import BidButtons from './BidButtons'
import PlayersStrip from './PlayersStrip'

export default function Auction({ state }: { state: GameState }) {
  const { game, players, auction, ownedCards, myPlayerId } = state
  const gameId = game!.id
  const closeMs = game!.close_delay_seconds * 1000
  const capMs = game!.max_auction_seconds * 1000
  const offset = useServerOffset()
  const delayDeadline = auction ? new Date(auction.last_bid_at).getTime() + closeMs : null
  const capDeadline = auction ? new Date(auction.opened_at).getTime() + capMs : null
  const deadline = delayDeadline !== null && capDeadline !== null ? Math.min(delayDeadline, capDeadline) : null
  const windowMs = capDeadline !== null && deadline === capDeadline ? capMs : closeMs
  const remaining = useCountdown(deadline, offset)
  const expired = remaining <= 0

  const me = players.find(p => p.id === myPlayerId)
  const missing = game!.deck_size - cardsOf(ownedCards, myPlayerId).length
  const iLead = auction?.current_bidder === myPlayerId
  const iPassed = !!(myPlayerId && auction?.passed.includes(myPlayerId))
  const myMax = me ? maxBid(me.bankroll, missing, game!.min_bid) : 0
  const cantAct = iLead || iPassed || missing <= 0 || expired

  useEffect(() => {
    if (!auction || !expired) return
    const tryClose = () => { void supabase.rpc('close_auction', { g_id: gameId }).then(null, () => {}) }
    tryClose()
    const id = setInterval(tryClose, 1000)
    return () => clearInterval(id)
  }, [auction?.id, expired, gameId])

  // erreurs volontairement silencieuses : races normales du temps réel
  async function bid(amount: number) {
    const { error } = await supabase.rpc('place_bid', { g_id: gameId, amount })
    if (error) console.warn(error.message)
  }

  async function pass() {
    const { error } = await supabase.rpc('pass_auction', { g_id: gameId })
    if (error) console.warn(error.message)
  }

  if (!auction) return <p className="center">Préparation de l'enchère…</p>
  const leader = players.find(p => p.id === auction.current_bidder)

  return (
    <main className="page">
      <Card card={auction.card} />
      <TimerRing remaining={remaining} windowMs={windowMs} />
      <p className="current-bid">
        <strong>{auction.current_bid} €</strong> — {leader?.nickname}{iLead && ' (toi)'}
      </p>
      <BidButtons
        currentBid={auction.current_bid}
        myMax={myMax}
        canAct={!cantAct}
        hasPassed={iPassed}
        onBid={bid}
        onPass={pass}
      />
      <PlayersStrip
        players={players}
        ownedCards={ownedCards}
        deckSize={game!.deck_size}
        currentBidderId={auction.current_bidder}
        passedIds={auction.passed}
      />
    </main>
  )
}
