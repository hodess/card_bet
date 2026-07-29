import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { GameState } from '../hooks/useGame'
import { useServerOffset } from '../hooks/useServerOffset'
import { useCountdown } from '../hooks/useCountdown'
import { maxBid, formatMs, cardTier } from '../lib/game'
import config from '../config.json'

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
  const myCards = ownedCards.filter(c => c.player_id === myPlayerId)
  const missing = game!.deck_size - myCards.length
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
  const ringFraction = Math.max(0, Math.min(1, remaining / windowMs))

  return (
    <main className="page">
      <div className={`fut-card ${cardTier(auction.card.rating)}`}>
        <div className="fut-rating">{auction.card.rating}</div>
        <div className="fut-position">{auction.card.position}</div>
        <div className="fut-name">{auction.card.name}</div>
      </div>

      <div className="timer-ring" role="timer">
        <svg viewBox="0 0 80 80">
          <circle className="ring-bg" cx="40" cy="40" r="34" />
          <circle
            className="ring-fg"
            cx="40" cy="40" r="34"
            strokeDasharray={2 * Math.PI * 34}
            strokeDashoffset={2 * Math.PI * 34 * (1 - ringFraction)}
          />
        </svg>
        <span className="ring-label">{formatMs(remaining)}</span>
      </div>

      <p className="current-bid">
        <strong>{auction.current_bid} €</strong> — {leader?.nickname}{iLead && ' (toi)'}
      </p>

      <div className="bid-buttons">
        {config.ui.increments.map(inc => {
          const amount = auction.current_bid + inc
          return (
            <button key={inc} className="chip" onClick={() => bid(amount)}
              disabled={cantAct || amount > myMax}>
              +{inc}
            </button>
          )
        })}
        <button className="chip max" onClick={() => bid(myMax)}
          disabled={cantAct || myMax <= auction.current_bid}>
          Max {myMax}
        </button>
      </div>
      <button className="pass" onClick={pass} disabled={cantAct}>
        {iPassed ? 'Tu as passé' : 'Je passe'}
      </button>

      <footer className="players-strip">
        {players.map(p => {
          const count = ownedCards.filter(c => c.player_id === p.id).length
          const passed = auction.passed.includes(p.id)
          return (
            <div key={p.id} className={`player-chip${p.id === auction.current_bidder ? ' leading' : ''}${passed ? ' passed' : ''}`}>
              <span className="chip-name">{p.nickname}</span>
              <span className="chip-bank">{p.bankroll} €</span>
              <span className="chip-deck">{'●'.repeat(count)}{'○'.repeat(Math.max(0, game!.deck_size - count))}</span>
              {passed && <span className="chip-state">a passé</span>}
              {p.id === auction.current_bidder && <span className="chip-state">mène</span>}
            </div>
          )
        })}
      </footer>
    </main>
  )
}
