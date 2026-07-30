import { HashRouter, Route, Routes } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { ensureSession } from './lib/supabase'
import { useProfile } from './hooks/useProfile'
import HomePage from './pages/HomePage'
import GamePage from './pages/GamePage'
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import MePage from './pages/MePage'

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
  if (!ready) return <p className="center">Connexion…</p>
  return (
    <HashRouter>
      <UsernameGate>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/game/:gameId" element={<GamePage />} />
          <Route path="/account" element={<AuthPage />} />
          <Route path="/profile/:username" element={<ProfilePage />} />
          <Route path="/me" element={<MePage />} />
        </Routes>
      </UsernameGate>
    </HashRouter>
  )
}
