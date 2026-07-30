import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import config from '../config.json'
import Card, { type CardData } from './Card'

type HistoryRow = {
  matchId: string
  finishedAt: string
  result: 'win' | 'loss' | 'draw'
  score: number
  moneyLeft: number
  opponent: { nickname: string; username: string | null; score: number; isBot: boolean } | null
}
type DeckCard = { seat: number; price_paid: number; card: CardData & { id: number } }

const RESULT_LABEL = { win: 'Victoire', loss: 'Défaite', draw: 'Égalité' } as const

// L'historique d'un profil : liste paginée + decks dépliables.
export default function MatchHistoryList({ profileId }: { profileId: string }) {
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [pages, setPages] = useState(1)
  const [decks, setDecks] = useState<Record<string, DeckCard[]>>({})

  const load = useCallback(async () => {
    const { data: mine } = await supabase.from('match_players')
      .select('match_id, seat, score, money_left, result, match:matches(id, finished_at)')
      .eq('profile_id', profileId).limit(config.ui.historyCap)
    const rows = mine ?? []
    const ids = rows.map(r => r.match_id)
    const { data: all } = ids.length
      ? await supabase.from('match_players')
          .select('match_id, seat, nickname, profile_id, score, is_bot, profile:profiles(username)')
          .in('match_id', ids)
      : { data: [] }
    setHistory(rows.map(r => {
      const opp = (all ?? []).find(o => o.match_id === r.match_id && o.seat !== r.seat)
      return {
        matchId: r.match_id,
        finishedAt: (r.match as { finished_at: string } | null)?.finished_at ?? '',
        result: r.result as HistoryRow['result'],
        score: r.score,
        moneyLeft: r.money_left,
        opponent: opp ? {
          nickname: opp.nickname,
          username: (opp.profile as { username: string } | null)?.username ?? null,
          score: opp.score,
          isBot: opp.is_bot,
        } : null,
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
      .select('seat, price_paid, card:cards(*)')
      .eq('match_id', matchId)
    setDecks(d => ({ ...d, [matchId]: (data as unknown as DeckCard[]) ?? [] }))
  }

  return (
    <section className="board">
      <h2>Historique</h2>
      {history.length === 0 && <p className="hint">Aucune partie enregistrée.</p>}
      {history.slice(0, pages * config.ui.historyPageSize).map(r => (
        <div key={r.matchId} className="board-row">
          <div className="board-info">
            <strong>{RESULT_LABEL[r.result]}</strong>
            {' '}vs{' '}
            {r.opponent
              ? r.opponent.username
                ? <Link className="player-link" to={`/profile/${r.opponent.username}`}>{r.opponent.username}</Link>
                : <>{r.opponent.nickname}{r.opponent.isBot && <span className="badge"> bot</span>}</>
              : '?'}
            <span className="hint">
              {r.score}{r.opponent ? ` – ${r.opponent.score}` : ''} pts · reste {r.moneyLeft} € ·{' '}
              {r.finishedAt && new Date(r.finishedAt).toLocaleDateString('fr-FR')}
            </span>
            {decks[r.matchId] && (
              <div className="mini-cards">
                {decks[r.matchId].map(c => (
                  <Card key={`${c.seat}-${c.card.id}`} card={c.card} size="mini" price={c.price_paid} />
                ))}
              </div>
            )}
          </div>
          <button className="secondary" onClick={() => toggleDeck(r.matchId)}>
            {decks[r.matchId] ? 'Masquer' : 'Decks'}
          </button>
        </div>
      ))}
      {history.length > pages * config.ui.historyPageSize && (
        <button className="secondary" onClick={() => setPages(p => p + 1)}>Voir plus</button>
      )}
      {history.length >= config.ui.historyCap && (
        <p className="hint">Historique limité aux {config.ui.historyCap} dernières parties.</p>
      )}
    </section>
  )
}
