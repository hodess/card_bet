import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile'
import { useFriendships } from '../hooks/useFriendships'
import { signOutToAnonymous } from '../lib/auth'

// Burger fixe en haut à gauche + drawer. Désactivé pendant une partie
// (pas de sortie accidentelle en pleine enchère).
export default function NavMenu() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { profile } = useProfile()
  const { pendingReceivedCount, refresh } = useFriendships(!!profile)
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
      <button className="nav-burger" aria-label="Menu" disabled={inGame}
        onClick={() => setOpen(true)}>
        ☰
        {pendingReceivedCount > 0 && <span className="nav-badge">{pendingReceivedCount}</span>}
      </button>
      {open && !inGame && (
        <>
          <div className="nav-overlay" onClick={close} />
          <nav className="nav-drawer">
            <Link to="/" onClick={close}>Accueil</Link>
            {profile && (
              <>
                <Link to={`/profile/${profile.username}`} onClick={close}>Mon profil</Link>
                <Link to="/me" onClick={close}>
                  Mes amis
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
                    Se déconnecter
                  </button>
                </>
              ) : (
                <Link to="/account" onClick={close}>Créer mon compte / Se connecter</Link>
              )}
            </div>
          </nav>
        </>
      )}
    </>
  )
}
