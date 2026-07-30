import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile'
import { useFriendships } from '../hooks/useFriendships'
import { useT } from '../hooks/useT'
import { signOutToAnonymous } from '../lib/auth'

// Burger fixe en haut à gauche + drawer. Désactivé pendant une partie
// (pas de sortie accidentelle en pleine enchère).
export default function NavMenu() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { profile } = useProfile()
  const { pendingReceivedCount, refresh } = useFriendships(!!profile)
  const { t } = useT()
  const inGame = location.pathname.startsWith('/game/')

  useEffect(() => { if (open) refresh() }, [open, refresh])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const close = () => setOpen(false)

  return (
    <>
      <button className="nav-burger" aria-label={t('nav.menu')} disabled={inGame}
        onClick={() => setOpen(true)}>
        ☰
        {pendingReceivedCount > 0 && <span className="nav-badge">{pendingReceivedCount}</span>}
      </button>
      {open && !inGame && (
        <>
          <div className="nav-overlay" onClick={close} />
          <nav className="nav-drawer">
            <Link to="/" onClick={close}>{t('nav.home')}</Link>
            {profile && (
              <>
                <Link to={`/profile/${profile.username}`} onClick={close}>{t('nav.myProfile')}</Link>
                <Link to="/me" onClick={close}>
                  {t('nav.myFriends')}
                  {pendingReceivedCount > 0 && <span className="nav-badge inline">{pendingReceivedCount}</span>}
                </Link>
              </>
            )}
            <div className="nav-footer">
              {profile ? (
                <>
                  <span className="hint">{profile.username}</span>
                  <button className="linklike"
                    onClick={() => { close(); signOutToAnonymous().catch(e => console.warn(e)) }}>
                    {t('nav.signOut')}
                  </button>
                </>
              ) : (
                <>
                  <Link to="/account?mode=signup" onClick={close}>{t('nav.signUp')}</Link>
                  <Link to="/account?mode=login" onClick={close}>{t('nav.signIn')}</Link>
                </>
              )}
            </div>
          </nav>
        </>
      )}
    </>
  )
}
