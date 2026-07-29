import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { GameState } from '../hooks/useGame'
import { useServerOffset } from '../hooks/useServerOffset'
import { useCountdown } from '../hooks/useCountdown'
import { maxBid, formatMs } from '../lib/game'

const CLOSE_DELAY_MS = 4000
const MAX_AUCTION_MS = 60_000
const INCREMENTS = [10, 50, 100]

export default function Auction({ state }: { state: GameState }) {
  const { game, players, auction, ownedCards, myPlayerId } = state
  const gameId = game!.id
  const offset = useServerOffset()
  const deadline = auction
    ? Math.min(
        new Date(auction.last_bid_at).getTime() + CLOSE_DELAY_MS,
        new Date(auction.opened_at).getTime() + MAX_AUCTION_MS,
      )
    : null
  const remaining = useCountdown(deadline, offset)
  const expired = remaining <= 0

  const me = players.find(p => p.id === myPlayerId)
  const myCards = ownedCards.filter(c => c.player_id === myPlayerId)
  const missing = game!.deck_size - myCards.length
  const iLead = auction?.current_bidder === myPlayerId
  const myMax = me ? maxBid(me.bankroll, missing, game!.min_bid) : 0

  // timer local expiré → demander la clôture (idempotente côté serveur),
  // avec retry tant que l'enchère reste ouverte (filet si un appel se perd)
  useEffect(() => {
    if (!auction || !expired) return
    const tryClose = () => { void supabase.rpc('close_auction', { g_id: gameId }).then(null, () => {}) }
    tryClose()
    const id = setInterval(tryClose, 1000)
    return () => clearInterval(id)
  }, [auction?.id, expired, gameId])

  async function bid(amount: number) {
    const { error } = await supabase.rpc('place_bid', { g_id: game!.id, amount })
    if (error) console.warn(error.message)  // l'état realtime fait foi
  }

  if (!auction) return <p className="center">Préparation de l'enchère…</p>
  const leader = players.find(p => p.id === auction.current_bidder)

  return (
    <main className="page">
      <div className="card-display">
        <h2>{auction.card.name}</h2>
        <p>{auction.card.position} — note {auction.card.rating}</p>
      </div>
      <p className="timer">{formatMs(remaining)} s</p>
      <p>Mise : <strong>{auction.current_bid}</strong> par {leader?.nickname}{iLead && ' (toi)'}</p>
      <div className="bid-buttons">
        {INCREMENTS.map(inc => {
          const amount = auction.current_bid + inc
          return (
            <button key={inc} onClick={() => bid(amount)}
              disabled={iLead || missing <= 0 || amount > myMax || expired}>
              +{inc}
            </button>
          )
        })}
        <button onClick={() => bid(myMax)}
          disabled={iLead || missing <= 0 || myMax <= auction.current_bid || expired}>
          Max ({myMax})
        </button>
      </div>
      <footer className="status">
        {players.map(p => (
          <span key={p.id}>
            {p.nickname} : {p.bankroll} € — {ownedCards.filter(c => c.player_id === p.id).length}/{game!.deck_size} cartes
          </span>
        ))}
      </footer>
    </main>
  )
}
