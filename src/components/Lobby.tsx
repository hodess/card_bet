import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { GameState } from '../hooks/useGame'

export default function Lobby({ state, onAddBot }: { state: GameState; onAddBot: (code: string) => void }) {
  const { game, players, myPlayerId } = state
  const isHost = players.find(p => p.id === myPlayerId)?.seat === 0
  const [botRequested, setBotRequested] = useState(false)

  async function start() {
    const { error } = await supabase.rpc('start_game', { g_id: game!.id })
    if (error) alert(error.message)
  }

  function addBot() {
    setBotRequested(true)
    onAddBot(game!.code)
  }

  return (
    <main className="page">
      <h1>Salon</h1>
      <p>Code de la partie : <strong className="code">{game!.code}</strong></p>
      <ul className="player-list">
        {players.map(p => <li key={p.id}>{p.nickname}{p.seat === 0 && ' (hôte)'}</li>)}
      </ul>
      {isHost && players.length < 2 && (
        <button className="secondary" onClick={addBot} disabled={botRequested}>
          {botRequested ? 'Bot en route…' : '+ Ajouter un bot'}
        </button>
      )}
      {isHost
        ? <button onClick={start} disabled={players.length < 2}>Démarrer</button>
        : <p>En attente de l'hôte…</p>}
    </main>
  )
}
