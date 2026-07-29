import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function HomePage() {
  const nav = useNavigate()
  const [nickname, setNickname] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function createGame() {
    const { data, error } = await supabase.rpc('create_game', { nickname })
    if (error) return setError(error.message)
    nav(`/game/${(data as { game_id: string }).game_id}`)
  }

  async function joinGame() {
    const { data, error } = await supabase.rpc('join_game', { game_code: code, nickname })
    if (error) return setError(error.message)
    nav(`/game/${(data as { game_id: string }).game_id}`)
  }

  return (
    <main className="page">
      <h1>CardBet</h1>
      <input placeholder="Ton pseudo" value={nickname}
        onChange={e => setNickname(e.target.value)} />
      <button onClick={createGame} disabled={!nickname.trim()}>Créer une partie</button>
      <hr />
      <input placeholder="Code de partie" value={code}
        onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} />
      <button onClick={joinGame} disabled={!nickname.trim() || code.length !== 6}>Rejoindre</button>
      {error && <p className="error">{error}</p>}
    </main>
  )
}
