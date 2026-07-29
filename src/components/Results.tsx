import { Link } from 'react-router-dom'
import type { GameState } from '../hooks/useGame'

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
      <h1>{tie ? 'Égalité !' : `${rows[0].player.nickname} gagne !`}</h1>
      {rows.map(({ player, cards, total }) => (
        <section key={player.id}>
          <h2>{player.nickname} — {total} pts (reste {player.bankroll} €)</h2>
          <ul>
            {cards.map(c => (
              <li key={c.card_id}>{c.card.name} ({c.card.rating}) — payé {c.price_paid} €</li>
            ))}
          </ul>
        </section>
      ))}
      <Link to="/">Nouvelle partie</Link>
    </main>
  )
}
