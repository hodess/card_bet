import { Link } from 'react-router-dom'
import type { GameState } from '../hooks/useGame'
import { cardTier } from '../lib/game'

export default function Results({ state }: { state: GameState }) {
  const { players, ownedCards } = state
  const rows = players.map(p => {
    const cards = ownedCards.filter(c => c.player_id === p.id)
    return { player: p, cards, total: cards.reduce((s, c) => s + c.card.rating, 0) }
  }).sort((a, b) => b.total - a.total || b.player.bankroll - a.player.bankroll)

  const tie = rows.length === 2
    && rows[0].total === rows[1].total
    && rows[0].player.bankroll === rows[1].player.bankroll

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
      <Link className="home-link" to="/">Nouvelle partie</Link>
    </main>
  )
}
