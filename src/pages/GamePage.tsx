import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { t } from '../i18n'
import { useGame } from '../hooks/useGame'
import { startBot } from '../lib/bot'
import Lobby from '../components/Lobby'
import Auction from '../components/Auction'
import Results from '../components/Results'
import MatchSummary from '../components/MatchSummary'

export default function GamePage() {
  const { gameId } = useParams<'gameId'>()
  const state = useGame(gameId!)
  const botStop = useRef<(() => void) | null>(null)
  // La partie passe à `finished` dans la même transaction que la dernière
  // adjudication : on garde l'écran d'enchère le temps de son animation.
  const [sequenceEnCours, setSequenceEnCours] = useState(false)

  useEffect(() => () => { botStop.current?.() }, [])

  function addBot(code: string) {
    if (!botStop.current) botStop.current = startBot(code)
  }

  if (state.loading) return <p className="center">{t('common.loading')}</p>
  // partie invisible (visiteur bloqué par la RLS) ou purgée : on tente le résumé persistant
  if (!state.game) return <MatchSummary gameId={gameId!} />
  if (state.game.status === 'lobby') return <Lobby state={state} onAddBot={addBot} />
  if (state.game.status === 'playing' || sequenceEnCours) {
    return <Auction state={state} onSequenceChange={setSequenceEnCours} />
  }
  return <Results state={state} />
}
