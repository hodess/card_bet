import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import config from '../config.json'
import Card from './Card'
import BotBadge from './BotBadge'
import { useT } from '../hooks/useT'
import { locale } from '../i18n'
import { rankRows } from '../lib/ranking'

type Adversaire = {
  nickname: string
  username: string | null
  score: number
  isBot: boolean
  botLevel: string | null
}
type HistoryRow = {
  matchId: string
  finishedAt: string
  result: 'win' | 'loss' | 'draw'
  score: number
  moneyLeft: number
  rank: number | null
  players: number
  opponents: Adversaire[]
}
type DeckCard = { seat: number; price_paid: number; card: { id: number; name: string; position: string; rating: number } }

// L'historique d'un profil : liste paginée + decks dépliables.
export default function MatchHistoryList({ profileId }: { profileId: string }) {
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [pages, setPages] = useState(1)
  const [decks, setDecks] = useState<Record<string, DeckCard[]>>({})
  const { t } = useT()

  const load = useCallback(async () => {
    const { data: mine } = await supabase.from('match_players')
      .select('match_id, seat, score, money_left, result, match:matches(id, finished_at)')
      .eq('profile_id', profileId).limit(config.ui.historyCap)
    const rows = mine ?? []
    const ids = rows.map(r => r.match_id)
    // PostgREST plafonne toute réponse à max_rows (supabase/config.toml). À 8 joueurs par
    // partie, demander tous les participants des `historyCap` matchs en un seul .in() peut
    // dépasser ce plafond et tronquer la réponse en silence (lignes perdues arbitraires,
    // classement faussé). On découpe donc en lots de historyBatchSize matchs, en parallèle.
    // Clé dédiée, distincte de historyPageSize (pagination d'affichage) : ce découpage
    // protège le plafond serveur et ne doit pas bouger si on ajuste la pagination.
    const batches: string[][] = []
    for (let i = 0; i < ids.length; i += config.ui.historyBatchSize) {
      batches.push(ids.slice(i, i + config.ui.historyBatchSize))
    }
    const batchResults = await Promise.all(batches.map(batch =>
      supabase.from('match_players')
        .select('match_id, seat, nickname, profile_id, score, money_left, is_bot, bot_level, profile:profiles(username)')
        .in('match_id', batch),
    ))
    const all = batchResults.flatMap(({ data }) => data ?? [])
    setHistory(rows.map(r => {
      const table = all.filter(o => o.match_id === r.match_id)
      const classement = rankRows(table, m => ({ total: m.score, money: m.money_left }))
      return {
        matchId: r.match_id,
        finishedAt: (r.match as { finished_at: string } | null)?.finished_at ?? '',
        result: r.result as HistoryRow['result'],
        score: r.score,
        moneyLeft: r.money_left,
        // pas de repli fabriqué : si ma ligne manque du lot (troncature, RLS future),
        // le rang reste absent plutôt que de mentir (cf. constat de revue)
        rank: classement.find(c => c.row.seat === r.seat)?.rank ?? null,
        players: table.length,
        opponents: classement.filter(c => c.row.seat !== r.seat).map(c => ({
          nickname: c.row.nickname,
          username: (c.row.profile as { username: string } | null)?.username ?? null,
          score: c.row.score,
          isBot: c.row.is_bot,
          botLevel: c.row.bot_level,
        })),
      }
    }).sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)))
  }, [profileId])

  useEffect(() => {
    setPages(1)
    setDecks({})
    load()
  }, [load])

  async function toggleDeck(matchId: string) {
    if (decks[matchId]) {
      setDecks(d => { const { [matchId]: _, ...rest } = d; return rest })
      return
    }
    const { data } = await supabase.from('match_cards')
      .select('seat, price_paid, card_id, card_name, card_position, card_rating')
      .eq('match_id', matchId)
    setDecks(d => ({ ...d, [matchId]: (data ?? []).map(c => ({
      seat: c.seat,
      price_paid: c.price_paid,
      card: { id: c.card_id, name: c.card_name, position: c.card_position, rating: c.card_rating },
    })) }))
  }

  return (
    <section className="board">
      <h2>{t('history.title')}</h2>
      {history.length === 0 && <p className="hint">{t('history.empty')}</p>}
      {history.slice(0, pages * config.ui.historyPageSize).map(r => {
        const date = r.finishedAt ? new Date(r.finishedAt).toLocaleDateString(locale()) : ''
        return (
        <div key={r.matchId} className="board-row">
          <div className="board-info">
            <strong>{t(`history.${r.result}`)}</strong>
            {r.players > 1 && r.rank !== null && (
              <> {r.rank === 1
                ? t('history.rankFirst', { total: r.players })
                : t('history.rank', { rank: r.rank, total: r.players })}</>
            )}
            {r.opponents.length > 0 && <> {t('history.vs')} </>}
            {/* deux adversaires nommés, le reste compté : une ligne reste lisible à huit */}
            {r.opponents.slice(0, 2).map((o, i) => (
              <span key={o.nickname + i}>
                {i > 0 && ', '}
                {o.username
                  ? <Link className="player-link" to={`/profile/${o.username}`}>{o.username}</Link>
                  : <>{o.nickname}<BotBadge isBot={o.isBot} level={o.botLevel} /></>}
              </span>
            ))}
            {r.opponents.length > 2 && <> {t('history.andMore', { n: r.opponents.length - 2 })}</>}
            <span className="hint">
              {r.opponents.length === 1
                ? t('history.lineVs', {
                    score: r.score, oppScore: r.opponents[0].score, money: r.moneyLeft, date,
                  })
                : t('history.lineSolo', { score: r.score, money: r.moneyLeft, date })}
            </span>
            {decks[r.matchId] && (
              decks[r.matchId].length > 0 ? (
                <div className="mini-cards">
                  {decks[r.matchId].map(c => (
                    <Card key={`${c.seat}-${c.card.id}`} card={c.card} size="mini" price={c.price_paid} />
                  ))}
                </div>
              ) : (
                // Pack privé de la partie : la RLS de match_cards ne renvoie rien à
                // qui n'y a pas joué. Sans ce message, le panneau s'ouvrirait vide.
                <p className="hint">{t('history.deckPrivate')}</p>
              )
            )}
          </div>
          <button className="secondary" onClick={() => toggleDeck(r.matchId)}>
            {decks[r.matchId] ? t('history.hideDecks') : t('history.showDecks')}
          </button>
        </div>
        )
      })}
      {history.length > pages * config.ui.historyPageSize && (
        <button className="secondary" onClick={() => setPages(p => p + 1)}>{t('history.more')}</button>
      )}
      {history.length >= config.ui.historyCap && (
        <p className="hint">{t('history.capped', { n: config.ui.historyCap })}</p>
      )}
    </section>
  )
}
