import { useParams } from 'react-router-dom'
import { useGame } from '../hooks/useGame'
import Lobby from '../components/Lobby'
import Auction from '../components/Auction'
import Results from '../components/Results'

export default function GamePage() {
  const { gameId } = useParams<'gameId'>()
  const state = useGame(gameId!)
  if (state.loading) return <p className="center">Chargement…</p>
  if (!state.game) return <p className="center">Partie introuvable.</p>
  if (state.game.status === 'lobby') return <Lobby state={state} />
  if (state.game.status === 'playing') return <Auction state={state} />
  return <Results state={state} />
}
