import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../hooks/useProfile'

type FriendRow = { requester: string; addressee: string; status: 'pending' | 'accepted' }
type Entry = { otherId: string; username: string; kind: 'received' | 'sent' | 'friend' }

export default function MePage() {
  const me = useProfile()
  const [entries, setEntries] = useState<Entry[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (myId: string) => {
    const { data: rows } = await supabase.from('friendships')
      .select('requester, addressee, status')
    const friendRows = (rows as FriendRow[] | null) ?? []
    const otherIds = friendRows.map(f => (f.requester === myId ? f.addressee : f.requester))
    const { data: profs } = otherIds.length
      ? await supabase.from('profiles').select('id, username').in('id', otherIds)
      : { data: [] }
    const names = Object.fromEntries((profs ?? []).map(p => [p.id, p.username]))
    setEntries(friendRows.map(f => {
      const otherId = f.requester === myId ? f.addressee : f.requester
      return {
        otherId,
        username: names[otherId] ?? '?',
        kind: f.status === 'accepted' ? 'friend' : f.addressee === myId ? 'received' : 'sent',
      }
    }).filter(e => e.username !== '?') as unknown as Entry[])
  }, [])

  useEffect(() => {
    if (me.profile) load(me.profile.id)
  }, [me.profile, load])

  async function act(rpc: 'accept_friend_request' | 'remove_friendship', username: string) {
    setError(null)
    const { error } = await supabase.rpc(rpc, { p_username: username })
    if (error) return setError(error.message)
    if (me.profile) await load(me.profile.id)
  }

  if (me.loading) return <p className="center">Chargement…</p>
  if (!me.profile) return <Navigate to="/account" replace />

  const received = entries.filter(e => e.kind === 'received')
  const sent = entries.filter(e => e.kind === 'sent')
  const friends = entries.filter(e => e.kind === 'friend')

  return (
    <main className="page">
      <h1>{me.profile.username}</h1>
      <Link className="player-link" to={`/profile/${me.profile.username}`}>
        Voir mon profil public (stats & historique)
      </Link>

      <section className="board">
        <h2>Demandes reçues</h2>
        {received.length === 0 && <p className="hint">Aucune demande en attente.</p>}
        {received.map(e => (
          <div key={e.otherId} className="board-row">
            <Link className="player-link" to={`/profile/${e.username}`}>{e.username}</Link>
            <div>
              <button onClick={() => act('accept_friend_request', e.username)}>Accepter</button>
              <button className="secondary" onClick={() => act('remove_friendship', e.username)}>Refuser</button>
            </div>
          </div>
        ))}
      </section>

      {sent.length > 0 && (
        <section className="board">
          <h2>Demandes envoyées</h2>
          {sent.map(e => (
            <div key={e.otherId} className="board-row">
              <Link className="player-link" to={`/profile/${e.username}`}>{e.username}</Link>
              <button className="secondary" onClick={() => act('remove_friendship', e.username)}>Annuler</button>
            </div>
          ))}
        </section>
      )}

      <section className="board">
        <h2>Mes amis</h2>
        {friends.length === 0 && <p className="hint">Pas encore d'amis — cherche un joueur depuis l'accueil.</p>}
        {friends.map(e => (
          <div key={e.otherId} className="board-row">
            <Link className="player-link" to={`/profile/${e.username}`}>{e.username}</Link>
            <button className="secondary" onClick={() => act('remove_friendship', e.username)}>Retirer</button>
          </div>
        ))}
      </section>

      {error && <p className="error">{error}</p>}
      <Link className="home-link" to="/">Accueil</Link>
    </main>
  )
}
