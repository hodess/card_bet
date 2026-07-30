import { Link, Navigate } from 'react-router-dom'
import { useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import { useProfile } from '../hooks/useProfile'
import { useFriendships, type FriendEntry } from '../hooks/useFriendships'

export default function MePage() {
  const me = useProfile()
  const { entries, refresh } = useFriendships(!!me.profile)
  const [error, setError] = useState<string | null>(null)

  async function act(rpc: 'accept_friend_request' | 'remove_friendship', username: string) {
    setError(null)
    const { error } = await supabase.rpc(rpc, { p_username: username })
    if (error) return setError(errorMessage(error))
    await refresh()
  }

  if (me.loading) return <p className="center">Chargement…</p>
  if (!me.profile) return <Navigate to="/account" replace />

  const received = entries.filter(e => e.status === 'pending' && e.direction === 'received')
  const sent = entries.filter(e => e.status === 'pending' && e.direction === 'sent')
  const friends = entries.filter(e => e.status === 'accepted')

  const row = (e: FriendEntry, actions: ReactNode) => (
    <div key={e.otherId} className="board-row">
      <Link className="player-link" to={`/profile/${e.username}`}>{e.username}</Link>
      {actions}
    </div>
  )

  return (
    <main className="page">
      <h1>{me.profile.username}</h1>
      <Link className="player-link" to={`/profile/${me.profile.username}`}>
        Voir mon profil public (stats & historique)
      </Link>

      <section className="board">
        <h2>Demandes reçues</h2>
        {received.length === 0 && <p className="hint">Aucune demande en attente.</p>}
        {received.map(e => row(e, (
          <div>
            <button onClick={() => act('accept_friend_request', e.username)}>Accepter</button>
            <button className="secondary" onClick={() => act('remove_friendship', e.username)}>Refuser</button>
          </div>
        )))}
      </section>

      {sent.length > 0 && (
        <section className="board">
          <h2>Demandes envoyées</h2>
          {sent.map(e => row(e, (
            <button className="secondary" onClick={() => act('remove_friendship', e.username)}>Annuler</button>
          )))}
        </section>
      )}

      <section className="board">
        <h2>Mes amis</h2>
        {friends.length === 0 && <p className="hint">Pas encore d'amis — cherche un joueur depuis l'accueil.</p>}
        {friends.map(e => row(e, (
          <button className="secondary" onClick={() => act('remove_friendship', e.username)}>Retirer</button>
        )))}
      </section>

      {error && <p className="error">{error}</p>}
    </main>
  )
}
