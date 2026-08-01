import { Link } from 'react-router-dom'
import { useT } from '../hooks/useT'

// L'hôte a exclu ce joueur : la RLS lui a fermé la partie, on le dit plutôt que
// de le laisser sur un salon fantôme.
export default function KickedNotice() {
  const { t } = useT()
  return (
    <main className="page">
      <h1>{t('lobby.kickedTitle')}</h1>
      <p className="hint">{t('lobby.kickedHint')}</p>
      <Link className="home-link" to="/">{t('common.home')}</Link>
    </main>
  )
}
