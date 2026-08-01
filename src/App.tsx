import { HashRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { ensureSession } from './lib/supabase'
import { captureAuthError, peekAuthError } from './lib/authError'
import { t } from './i18n'
import { useProfile } from './hooks/useProfile'
import NavMenu from './components/NavMenu'
import LangSwitch from './components/LangSwitch'
import HomePage from './pages/HomePage'
import GamePage from './pages/GamePage'
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import MePage from './pages/MePage'
import PacksPage from './pages/PacksPage'
import PackPage from './pages/PackPage'

// capture l'éventuelle erreur OAuth du retour Google et nettoie l'URL,
// avant tout rendu et avant l'init de la session
captureAuthError()

// une erreur OAuth en attente ? on atterrit sur /account qui sait l'afficher
function AuthErrorRedirect() {
  const nav = useNavigate()
  useEffect(() => {
    if (peekAuthError()) nav('/account', { replace: true })
  }, [nav])
  return null
}

// compte créé mais pseudo pas encore choisi (ex. OAuth interrompu) :
// on force l'écran de choix du pseudo, quelle que soit la route
function UsernameGate({ children }: { children: ReactNode }) {
  const p = useProfile()
  if (!p.loading && p.hasAccount && !p.profile) return <AuthPage />
  return <>{children}</>
}

export default function App() {
  const [ready, setReady] = useState(false)
  useEffect(() => { ensureSession().then(() => setReady(true)) }, [])
  // `t` direct (pas useT) : cet écran disparaît dès que la session est prête,
  // aucun changement de langue n'est possible avant.
  if (!ready) return <p className="center">{t('common.connecting')}</p>
  return (
    <HashRouter>
      <AuthErrorRedirect />
      <NavMenu />
      <LangSwitch />
      <UsernameGate>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/game/:gameId" element={<GamePage />} />
          <Route path="/account" element={<AuthPage />} />
          <Route path="/profile/:username" element={<ProfilePage />} />
          <Route path="/me" element={<MePage />} />
          <Route path="/packs" element={<PacksPage />} />
          <Route path="/packs/:slug" element={<PackPage />} />
        </Routes>
      </UsernameGate>
    </HashRouter>
  )
}
