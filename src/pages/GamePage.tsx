import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { t } from '../i18n'
import { useGame } from '../hooks/useGame'
import { startBot } from '../lib/bot'
import type { BotLevel } from '../lib/botBrain'
import { pickBotName } from '../lib/botNames'
import Lobby from '../components/Lobby'
import Auction from '../components/Auction'
import Results from '../components/Results'
import MatchSummary from '../components/MatchSummary'
import KickedNotice from '../components/KickedNotice'

export default function GamePage() {
  const { gameId } = useParams<'gameId'>()
  const state = useGame(gameId!)
  // Un bot = un client Supabase anonyme qui tourne dans l'onglet de l'hôte.
  // Jusqu'à sept pour une table de huit : on les arrête tous en quittant l'écran.
  const botStops = useRef<(() => void)[]>([])
  // Noms déjà demandés, jamais relâchés même si le bot correspondant a été
  // exclu depuis : deux clics rapprochés ne doivent jamais choisir le même nom,
  // ce qu'un instantané de `players` ne peut pas garantir (voir `pickBotName`).
  const requestedNames = useRef<string[]>([])
  // La partie passe à `finished` dans la même transaction que la dernière
  // adjudication : on garde l'écran d'enchère le temps de son animation.
  const [sequenceEnCours, setSequenceEnCours] = useState(false)

  useEffect(() => () => { botStops.current.forEach(stop => stop()) }, [])
  // La route /game/:gameId n'a pas de `key` : une revanche réutilise cette
  // instance de composant. Sans ce reset, les noms de bots déjà demandés lors
  // de la partie précédente survivraient et fausseraient pickBotName ici.
  useEffect(() => { requestedNames.current = [] }, [gameId])

  function addBot(code: string, seatedNames: string[], level: BotLevel) {
    const nickname = pickBotName([...seatedNames, ...requestedNames.current])
    requestedNames.current.push(nickname)
    botStops.current.push(startBot(code, nickname, level))
  }

  if (state.loading) return <p className="center">{t('common.loading')}</p>
  // exclu par l'hôte : à tester avant la partie invisible, la RLS produisant le même symptôme
  if (state.kicked) return <KickedNotice />
  // partie invisible (visiteur bloqué par la RLS) ou purgée : on tente le résumé persistant
  if (!state.game) return <MatchSummary gameId={gameId!} />
  if (state.game.status === 'lobby') return <Lobby state={state} onAddBot={addBot} />
  if (state.game.status === 'playing' || sequenceEnCours) {
    return <Auction state={state} onSequenceChange={setSequenceEnCours} />
  }
  return <Results state={state} />
}
