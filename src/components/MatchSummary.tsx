import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Card, { type CardData } from './Card'
import PlayerName from './PlayerName'

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

  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data, error } = await supabase.from('matches')
        .select(`finished_at,
          match_players(seat, nickname, score, money_left, result, is_bot, profile:profiles(username)),
          match_cards(seat, price_paid, card:cards(*))`)
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
            card: c.card as unknown as SummaryCard['card'],
          })),
        })
      }
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [gameId])

  if (loading) return <p className="center">Chargement…</p>
  if (failed) {
    return (
      <main className="page">
        <h1>Résumé indisponible</h1>
        <p className="hint">Le chargement a échoué. Vérifie ta connexion et réessaie.</p>
        <Link className="home-link" to="/">Accueil</Link>
      </main>
    )
  }
  if (!summary) {
    return (
      <main className="page">
        <h1>Partie introuvable ou non enregistrée</h1>
        <p className="hint">
          Le lien est peut-être erroné, ou la partie s'est jouée sans joueur à compte.
        </p>
        <Link className="home-link" to="/">Accueil</Link>
      </main>
    )
  }

  const winner = summary.players.find(p => p.result === 'win')

  return (
    <main className="page">
      <h1 className="podium-title">
        {winner ? `🏆 ${winner.username ?? winner.nickname} a gagné !` : 'Égalité !'}
      </h1>
      {summary.players.map(p => (
        <section key={p.seat} className={`result-row${p.result === 'win' ? ' winner' : ''}`}>
          <h2>
            <PlayerName nickname={p.nickname} username={p.username} />
            {p.isBot && <span className="badge"> bot</span>}
            {' '}— {p.score} pts <small>(reste {p.moneyLeft} €)</small>
          </h2>
          <div className="mini-cards">
            {summary.cards.filter(c => c.seat === p.seat).map(c => (
              <Card key={`${c.seat}-${c.card.id}`} card={c.card} size="mini" price={c.price} />
            ))}
          </div>
        </section>
      ))}
      <p className="hint">Partie du {new Date(summary.finishedAt).toLocaleDateString('fr-FR')}</p>
      <Link className="home-link" to="/">Accueil</Link>
    </main>
  )
}
