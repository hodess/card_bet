import { Link, useNavigate } from 'react-router-dom'
import type { GameState } from '../hooks/useGame'
import { supabase } from '../lib/supabase'
import { cardTier } from '../lib/game'

export default function Results({ state }: { state: GameState }) {
  const nav = useNavigate()
  const { game, players, ownedCards, myPlayerId } = state
  const myNickname = players.find(p => p.id === myPlayerId)?.nickname ?? 'Joueur'
  const rows = players.map(p => {
    const cards = ownedCards.filter(c => c.player_id === p.id)
    return { player: p, cards, total: cards.reduce((s, c) => s + c.card.rating, 0) }
  }).sort((a, b) => b.total - a.total || b.player.bankroll - a.player.bankroll)

  const tie = rows.length === 2
    && rows[0].total === rows[1].total
    && rows[0].player.bankroll === rows[1].player.bankroll

  async function propose() {
    const { data, error } = await supabase.rpc('rematch_game', { old_game_id: game!.id })
    if (error) return alert(error.message)
    nav(`/game/${(data as { game_id: string }).game_id}`)
  }

  async function joinRematch() {
    const { data, error } = await supabase.rpc('join_game_by_id', {
      g_id: game!.next_game_id!, nickname: myNickname,
    })
    if (error) return alert(error.message)
    nav(`/game/${(data as { game_id: string }).game_id}`)
  }

  return (
    <main className="page">
      <h1 className="podium-title">{tie ? 'Égalité !' : `🏆 ${rows[0].player.nickname} gagne !`}</h1>
      {rows.map(({ player, cards, total }, i) => (
        <section key={player.id} className={`result-row${i === 0 && !tie ? ' winner' : ''}`}>
          <h2>{player.nickname} — {total} pts <small>(reste {player.bankroll} €)</small></h2>
          <div className="mini-cards">
            {cards.map(c => (
              <div key={c.card_id} className={`fut-card mini ${cardTier(c.card.rating)}`}>
                <div className="fut-rating">{c.card.rating}</div>
                <div className="fut-name">{c.card.name}</div>
                <div className="fut-price">{c.price_paid} €</div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {game!.next_game_id
        ? <button onClick={joinRematch}>Revanche proposée — Rejoindre</button>
        : <button onClick={propose}>Proposer une revanche</button>}

      <Link className="home-link" to="/">Accueil</Link>
    </main>
  )
}
