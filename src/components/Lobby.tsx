import { supabase } from '../lib/supabase'
import type { GameState } from '../hooks/useGame'

export default function Lobby({ state }: { state: GameState }) {
  const { game, players, myPlayerId } = state
  const isHost = players.find(p => p.id === myPlayerId)?.seat === 0

  async function start() {
    const { error } = await supabase.rpc('start_game', { g_id: game!.id })
    if (error) alert(error.message)
  }

  return (
    <main className="page">
      <h1>Salon</h1>
      <p>Code de la partie : <strong className="code">{game!.code}</strong></p>
      <ul>
        {players.map(p => <li key={p.id}>{p.nickname}{p.seat === 0 && ' (hôte)'}</li>)}
      </ul>
      {isHost
        ? <button onClick={start} disabled={players.length < 2}>Démarrer</button>
        : <p>En attente de l'hôte…</p>}
    </main>
  )
}
