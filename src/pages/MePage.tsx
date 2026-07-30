import { Link, Navigate } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import { useProfile } from '../hooks/useProfile'
import { useFriendships, type FriendEntry } from '../hooks/useFriendships'
import { useT } from '../hooks/useT'
import Avatar from '../components/Avatar'
import config from '../config.json'

export default function MePage() {
  const me = useProfile()
  const { entries, refresh } = useFriendships(!!me.profile)
  const { t } = useT()
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{ username: string }[]>([])

  // recherche de joueurs (debounce léger)
  useEffect(() => {
    if (query.trim().length < 2) { setFound([]); return }
    let alive = true
    const timer = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('username')
        .ilike('username', `%${query.trim()}%`).limit(10)
      if (alive) setFound(data ?? [])
    }, config.ui.searchDebounceMs)
    return () => { alive = false; clearTimeout(timer) }
  }, [query])

  async function act(rpc: 'accept_friend_request' | 'remove_friendship', username: string) {
    setError(null)
    const { error } = await supabase.rpc(rpc, { p_username: username })
    if (error) return setError(errorMessage(error))
    await refresh()
  }

  if (me.loading) return <p className="center">{t('common.loading')}</p>
  if (!me.profile) return <Navigate to="/account" replace />

  const received = entries.filter(e => e.status === 'pending' && e.direction === 'received')
  const sent = entries.filter(e => e.status === 'pending' && e.direction === 'sent')
  const friends = entries.filter(e => e.status === 'accepted')

  const row = (username: string, key: string, actions: ReactNode, highlight = false) => (
    <div key={key} className={`board-row friend-row${highlight ? ' highlight' : ''}`}>
      <Avatar username={username} />
      <Link className="player-link" to={`/profile/${username}`}>{username}</Link>
      {actions && <div className="friend-actions">{actions}</div>}
    </div>
  )
  const friendRow = (e: FriendEntry, actions: ReactNode, highlight = false) =>
    row(e.username, e.otherId, actions, highlight)

  return (
    <main className="page">
      <header className="me-header">
        <Avatar username={me.profile.username} size="lg" />
        <div>
          <h1>{me.profile.username}</h1>
          <Link className="player-link" to={`/profile/${me.profile.username}`}>
            {t('me.viewPublicProfile')}
          </Link>
        </div>
      </header>

      <section className="board">
        <h2>{t('search.title')}</h2>
        <input placeholder={t('search.placeholder')} value={query}
          onChange={e => setQuery(e.target.value)} />
        {found.map(f => row(f.username, f.username, null))}
        {query.trim().length >= 2 && found.length === 0 && (
          <p className="hint">{t('search.none')}</p>
        )}
      </section>

      <section className="board">
        <h2>{t('me.requestsReceived')}</h2>
        {received.length === 0 && <p className="hint">{t('me.noRequests')}</p>}
        {received.map(e => friendRow(e, (
          <>
            <button onClick={() => act('accept_friend_request', e.username)}>{t('me.accept')}</button>
            <button className="secondary" onClick={() => act('remove_friendship', e.username)}>
              {t('me.decline')}
            </button>
          </>
        ), true))}
      </section>

      {sent.length > 0 && (
        <section className="board">
          <h2>{t('me.requestsSent')}</h2>
          {sent.map(e => friendRow(e, (
            <button className="secondary" onClick={() => act('remove_friendship', e.username)}>
              {t('common.cancel')}
            </button>
          )))}
        </section>
      )}

      <section className="board">
        <h2>{t('me.friends')}</h2>
        {friends.length === 0 && <p className="hint">{t('me.noFriends')}</p>}
        {friends.map(e => friendRow(e, (
          <button className="secondary" onClick={() => act('remove_friendship', e.username)}>
            {t('me.remove')}
          </button>
        )))}
      </section>

      {error && <p className="error">{error}</p>}
    </main>
  )
}
