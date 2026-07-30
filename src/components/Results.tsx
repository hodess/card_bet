import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { GameState } from '../hooks/useGame'
import PlayerName from './PlayerName'
import Card from './Card'
import { useUsernames } from '../hooks/useUsernames'
import { joinGameById, rematchGame } from '../lib/gameApi'
import { errorMessage } from '../lib/errors'
import { useT } from '../hooks/useT'

export default function Results({ state }: { state: GameState }) {
  const nav = useNavigate()
  const { game, players, ownedCards, myPlayerId } = state
  const { t } = useT()
  const usernames = useUsernames(players.map(p => p.auth_uid))
  const myNickname = players.find(p => p.id === myPlayerId)?.nickname ?? t('common.player')
  const [error, setError] = useState<string | null>(null)
  const rows = players.map(p => {
    const cards = ownedCards.filter(c => c.player_id === p.id)
    return { player: p, cards, total: cards.reduce((s, c) => s + c.card.rating, 0) }
  }).sort((a, b) => b.total - a.total || b.player.bankroll - a.player.bankroll)

  const tie = rows.length === 2
    && rows[0].total === rows[1].total
    && rows[0].player.bankroll === rows[1].player.bankroll

  async function propose() {
    try {
      nav(`/game/${await rematchGame(game!.id)}`)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function joinRematch() {
    try {
      nav(`/game/${await joinGameById(game!.next_game_id!, myNickname)}`)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <main className="page">
      <h1 className="podium-title">
        {tie ? t('results.tie') : t('results.winner', { name: rows[0].player.nickname })}
      </h1>
      {rows.map(({ player, cards, total }, i) => (
        <section key={player.id} className={`result-row${i === 0 && !tie ? ' winner' : ''}`}>
          <h2>
            <PlayerName nickname={player.nickname} username={usernames[player.auth_uid]} />
            {' '}{t('common.scoreLine', { score: total })}{' '}
            <small>{t('common.moneyLeft', { money: player.bankroll })}</small>
          </h2>
          <div className="mini-cards">
            {cards.map(c => (
              <Card key={c.card_id} card={c.card} size="mini" price={c.price_paid} />
            ))}
          </div>
        </section>
      ))}

      {game!.next_game_id
        ? <button onClick={joinRematch}>{t('results.rematchJoin')}</button>
        : <button onClick={propose}>{t('results.rematchPropose')}</button>}

      {error && <p className="error">{error}</p>}
      <Link className="home-link" to="/">{t('common.home')}</Link>
    </main>
  )
}
