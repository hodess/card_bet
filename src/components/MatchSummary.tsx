import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Card, { type CardData } from './Card'
import PlayerName from './PlayerName'
import { useT } from '../hooks/useT'
import { locale } from '../i18n'

type SummaryPlayer = {
  seat: number
  nickname: string
  username: string | null
  score: number
  moneyLeft: number
  result: 'win' | 'loss' | 'draw'
  isBot: boolean
}
type SummaryCard = { seat: number; price: number; card: CardData & { id: number } }
type Summary = { finishedAt: string; players: SummaryPlayer[]; cards: SummaryCard[] }

// Résumé public d'une partie terminée, servi par l'historique persistant :
// affiché aux visiteurs (RLS cache la partie) et après la purge des 24 h.
export default function MatchSummary({ gameId }: { gameId: string }) {
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [failed, setFailed] = useState(false)
  const { t } = useT()

  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data, error } = await supabase.from('matches')
        .select(`finished_at,
          match_players(seat, nickname, score, money_left, result, is_bot, profile:profiles(username)),
          match_cards(seat, price_paid, card_id, card_name, card_position, card_rating)`)
        .eq('game_id', gameId)
        .maybeSingle()
      if (!alive) return
      if (error) { setFailed(true); setLoading(false); return }
      if (data) {
        setSummary({
          finishedAt: data.finished_at,
          players: (data.match_players ?? []).map(p => ({
            seat: p.seat,
            nickname: p.nickname,
            username: (p.profile as { username: string } | null)?.username ?? null,
            score: p.score,
            moneyLeft: p.money_left,
            result: p.result as SummaryPlayer['result'],
            isBot: p.is_bot,
          })).sort((a, b) => b.score - a.score || b.moneyLeft - a.moneyLeft),
          cards: (data.match_cards ?? []).map(c => ({
            seat: c.seat,
            price: c.price_paid,
            card: {
              id: c.card_id,
              name: c.card_name,
              position: c.card_position,
              rating: c.card_rating,
            },
          })),
        })
      }
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [gameId])

  if (loading) return <p className="center">{t('common.loading')}</p>
  if (failed) {
    return (
      <main className="page">
        <h1>{t('summary.unavailableTitle')}</h1>
        <p className="hint">{t('summary.unavailableHint')}</p>
        <Link className="home-link" to="/">{t('common.home')}</Link>
      </main>
    )
  }
  if (!summary) {
    return (
      <main className="page">
        <h1>{t('summary.notFoundTitle')}</h1>
        <p className="hint">{t('summary.notFoundHint')}</p>
        <Link className="home-link" to="/">{t('common.home')}</Link>
      </main>
    )
  }

  const winner = summary.players.find(p => p.result === 'win')
  // Une partie terminée verse toujours au moins une carte (deck_size >= 1) :
  // si `cards` est globalement vide, ce n'est jamais un tirage légitime, c'est
  // la RLS de match_cards qui masque le pack privé de cette partie — y compris
  // pour un joueur anonyme de cette partie même, dont match_players.profile_id
  // est nul et que la policy rejette donc aussi.
  const deckPrive = summary.cards.length === 0

  return (
    <main className="page">
      <h1 className="podium-title">
        {winner
          ? t('results.winnerPast', { name: winner.username ?? winner.nickname })
          : t('results.tie')}
      </h1>
      {summary.players.map(p => (
        <section key={p.seat} className={`result-row${p.result === 'win' ? ' winner' : ''}`}>
          <h2>
            <PlayerName nickname={p.nickname} username={p.username} />
            {p.isBot && <span className="badge"> {t('common.bot')}</span>}
            {' '}{t('common.scoreLine', { score: p.score })}{' '}
            <small>{t('common.moneyLeft', { money: p.moneyLeft })}</small>
          </h2>
          {!deckPrive && (
            <div className="mini-cards">
              {summary.cards.filter(c => c.seat === p.seat).map(c => (
                <Card key={`${c.seat}-${c.card.id}`} card={c.card} size="mini" price={c.price} />
              ))}
            </div>
          )}
        </section>
      ))}
      {deckPrive && <p className="hint">{t('history.deckPrivate')}</p>}
      <p className="hint">
        {t('summary.playedOn', { date: new Date(summary.finishedAt).toLocaleDateString(locale()) })}
      </p>
      <Link className="home-link" to="/">{t('common.home')}</Link>
    </main>
  )
}
