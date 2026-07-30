import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../hooks/useProfile'
import { useFriendships } from '../hooks/useFriendships'
import FriendButton from '../components/FriendButton'
import MatchHistoryList from '../components/MatchHistoryList'

type Counts = { games: number; wins: number; losses: number; draws: number }

export default function ProfilePage() {
  const { username } = useParams<'username'>()
  const me = useProfile()
  const { entries, refresh } = useFriendships(!!me.profile)
  const [notFound, setNotFound] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [stats, setStats] = useState<Counts | null>(null)
  const [h2h, setH2h] = useState<Counts | null>(null)

  const load = useCallback(async () => {
    if (!username) return
    const { data: prof } = await supabase.from('profiles')
      .select('id, username').ilike('username', username).maybeSingle()
    if (!prof) { setNotFound(true); return }
    setProfileId(prof.id)
    setDisplayName(prof.username)
    const { data } = await supabase.rpc('get_profile_stats', { p_username: prof.username })
    const payload = data as { stats: Counts; head_to_head: Counts | null } | null
    setStats(payload?.stats ?? null)
    setH2h(payload?.head_to_head ?? null)
  }, [username])

  useEffect(() => {
    setNotFound(false)
    load()
  }, [load])

  if (notFound) {
    return (
      <main className="page">
        <h1>Profil introuvable</h1>
      </main>
    )
  }
  if (!profileId) return <p className="center">Chargement…</p>

  const isMe = me.profile?.id === profileId
  const relation = entries.find(e => e.otherId === profileId) ?? null

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
          <FriendButton targetUsername={displayName} relation={relation} onChange={refresh} />
        </>
      )}
      {!isMe && !me.profile && (
        <p className="hint"><Link className="player-link" to="/account">Crée ton compte</Link> pour l'ajouter en ami.</p>
      )}

      <MatchHistoryList profileId={profileId} />
    </main>
  )
}
