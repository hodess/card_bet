import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { GameState } from '../hooks/useGame'
import PlayerName from './PlayerName'
import BotBadge from './BotBadge'
import Card from './Card'
import { useUsernames } from '../hooks/useUsernames'
import { joinGameById, rematchGame } from '../lib/gameApi'
import { errorMessage } from '../lib/errors'
import { useT } from '../hooks/useT'
import { rankRows } from '../lib/ranking'

export default function Results({ state }: { state: GameState }) {
  const nav = useNavigate()
  const { game, players, ownedCards, myPlayerId } = state
  const { t } = useT()
  const usernames = useUsernames(players.map(p => p.auth_uid))
  const myNickname = players.find(p => p.id === myPlayerId)?.nickname ?? t('common.player')
  const [error, setError] = useState<string | null>(null)
  const classement = rankRows(
    players.map(p => {
      const cards = ownedCards.filter(c => c.player_id === p.id)
      return { player: p, cards, total: cards.reduce((s, c) => s + c.card.rating, 0) }
    }),
    r => ({ total: r.total, money: r.player.bankroll }),
  )
  // plusieurs premiers : égalité, et tous sont gagnants
  const tie = classement.filter(c => c.rank === 1).length > 1

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
        {tie || !classement[0] ? t('results.tie') : t('results.winner', { name: classement[0].row.player.nickname })}
      </h1>
      {classement.map(({ row: { player, cards, total }, rank }) => (
        <section key={player.id} className={`result-row${rank === 1 ? ' winner' : ''}`}>
          <h2>
            <PlayerName nickname={player.nickname} username={usernames[player.auth_uid]} />
            <BotBadge isBot={player.is_bot} level={player.bot_level} />
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
