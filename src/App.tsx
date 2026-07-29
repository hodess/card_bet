import { HashRouter, Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { ensureSession } from './lib/supabase'
import HomePage from './pages/HomePage'
import GamePage from './pages/GamePage'

export default function App() {
  const [ready, setReady] = useState(false)
  useEffect(() => { ensureSession().then(() => setReady(true)) }, [])
  if (!ready) return <p className="center">Connexion…</p>
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/game/:gameId" element={<GamePage />} />
      </Routes>
    </HashRouter>
  )
}
