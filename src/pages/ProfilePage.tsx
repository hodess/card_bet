import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../hooks/useProfile'
import { cardTier } from '../lib/game'

type Counts = { games: number; wins: number; losses: number; draws: number }
type FriendRow = { requester: string; addressee: string; status: 'pending' | 'accepted' }
type HistoryRow = {
  matchId: string
  finishedAt: string
  result: 'win' | 'loss' | 'draw'
  score: number
  moneyLeft: number
  opponent: { nickname: string; username: string | null; score: number; isBot: boolean } | null
}
type DeckCard = { seat: number; price_paid: number; card: { id: number; name: string; rating: number; position: string } }

const PAGE = 20
const HISTORY_CAP = 200 // au-delà, on tronque (affiché en pied de liste)

const RESULT_LABEL = { win: 'Victoire', loss: 'Défaite', draw: 'Égalité' } as const

export default function ProfilePage() {
  const { username } = useParams<'username'>()
  const me = useProfile()
  const [notFound, setNotFound] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [stats, setStats] = useState<Counts | null>(null)
  const [h2h, setH2h] = useState<Counts | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [pages, setPages] = useState(1)
  const [friendship, setFriendship] = useState<FriendRow | null>(null)
  const [decks, setDecks] = useState<Record<string, DeckCard[]>>({})
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!username) return
    const { data: prof } = await supabase.from('profiles')
      .select('id, username').ilike('username', username).maybeSingle()
    if (!prof) { setNotFound(true); return }
    setProfileId(prof.id)
    setDisplayName(prof.username)

    const [statsRes, mineRes, friendsRes] = await Promise.all([
      supabase.rpc('get_profile_stats', { p_username: prof.username }),
      supabase.from('match_players')
        .select('match_id, seat, score, money_left, result, match:matches(id, finished_at)')
        .eq('profile_id', prof.id).limit(HISTORY_CAP),
      supabase.from('friendships').select('requester, addressee, status'),
    ])

    const payload = statsRes.data as { stats: Counts; head_to_head: Counts | null } | null
    setStats(payload?.stats ?? null)
    setH2h(payload?.head_to_head ?? null)
    setFriendship(
      (friendsRes.data as FriendRow[] | null)
        ?.find(f => f.requester === prof.id || f.addressee === prof.id) ?? null,
    )

    const mine = mineRes.data ?? []
    const ids = mine.map(r => r.match_id)
    const { data: all } = ids.length
      ? await supabase.from('match_players')
          .select('match_id, seat, nickname, profile_id, score, is_bot, profile:profiles(username)')
          .in('match_id', ids)
      : { data: [] }
    const rows: HistoryRow[] = mine.map(r => {
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
    }).sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    setHistory(rows)
  }, [username])

  useEffect(() => {
    setNotFound(false); setPages(1); setDecks({})
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

  async function friendAction(rpc: 'send_friend_request' | 'accept_friend_request' | 'remove_friendship') {
    setError(null)
    const { error } = await supabase.rpc(rpc, { p_username: displayName })
    if (error) return setError(error.message)
    await load()
  }

  if (notFound) {
    return (
      <main className="page">
        <h1>Profil introuvable</h1>
        <Link className="home-link" to="/">Accueil</Link>
      </main>
    )
  }
  if (!profileId) return <p className="center">Chargement…</p>

  const isMe = me.profile?.id === profileId
  const myId = me.profile?.id

  return (
    <main className="page">
      <h1>{displayName}</h1>

      {stats && (
        <p>
          {stats.games} parties classées · {stats.wins} V / {stats.losses} D / {stats.draws} N
        </p>
      )}
      <p className="hint">Seules les parties entre joueurs à compte comptent dans les stats.</p>

      {!isMe && me.profile && (
        <>
          {h2h && (
            <section className="public-setup">
              <h2>Face-à-face</h2>
              <p>{h2h.games} parties : {h2h.wins} V / {h2h.losses} D / {h2h.draws} N (de ton point de vue)</p>
            </section>
          )}
          {!friendship && (
            <button onClick={() => friendAction('send_friend_request')}>Ajouter en ami</button>
          )}
          {friendship?.status === 'pending' && friendship.requester === myId && (
            <button className="secondary" onClick={() => friendAction('remove_friendship')}>
              Demande envoyée — Annuler
            </button>
          )}
          {friendship?.status === 'pending' && friendship.addressee === myId && (
            <button onClick={() => friendAction('accept_friend_request')}>Accepter la demande d'ami</button>
          )}
          {friendship?.status === 'accepted' && (
            <button className="secondary" onClick={() => friendAction('remove_friendship')}>
              Amis ✓ — Retirer
            </button>
          )}
        </>
      )}
      {!isMe && !me.profile && (
        <p className="hint"><Link className="player-link" to="/account">Crée ton compte</Link> pour l'ajouter en ami.</p>
      )}

      <section className="board">
        <h2>Historique</h2>
        {history.length === 0 && <p className="hint">Aucune partie enregistrée.</p>}
        {history.slice(0, pages * PAGE).map(r => (
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
                    <div key={`${c.seat}-${c.card.id}`} className={`fut-card mini ${cardTier(c.card.rating)}`}>
                      <div className="fut-rating">{c.card.rating}</div>
                      <div className="fut-name">{c.card.name}</div>
                      <div className="fut-price">{c.price_paid} €</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="secondary" onClick={() => toggleDeck(r.matchId)}>
              {decks[r.matchId] ? 'Masquer' : 'Decks'}
            </button>
          </div>
        ))}
        {history.length > pages * PAGE && (
          <button className="secondary" onClick={() => setPages(p => p + 1)}>Voir plus</button>
        )}
        {history.length >= HISTORY_CAP && (
          <p className="hint">Historique limité aux {HISTORY_CAP} dernières parties.</p>
        )}
      </section>

      {error && <p className="error">{error}</p>}
      <Link className="home-link" to="/">Accueil</Link>
    </main>
  )
}
