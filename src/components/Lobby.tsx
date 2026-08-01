import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { GameState } from '../hooks/useGame'
import GameSettingsFields, { type GameSettings } from './GameSettingsFields'
import PlayerName from './PlayerName'
import { useUsernames } from '../hooks/useUsernames'
import { errorMessage } from '../lib/errors'
import { useT } from '../hooks/useT'
import config from '../config.json'

export default function Lobby({ state, onAddBot }: {
  state: GameState
  onAddBot: (code: string, seatedNames: string[]) => void
}) {
  const { game, players, myPlayerId, refresh } = state
  const { t } = useT()
  const isHost = players.find(p => p.id === myPlayerId)?.seat === 0
  const usernames = useUsernames(players.map(p => p.auth_uid))
  const isPrivate = game!.visibility === 'private'
  // Réarmé dès que la table change : le bot est arrivé (ou son arrivée a échoué).
  const [botPending, setBotPending] = useState(false)
  useEffect(() => { setBotPending(false) }, [players.length])
  // Filet de sécurité : si l'arrivée du bot échoue silencieusement (auth ou
  // RPC en erreur), `players.length` ne bouge jamais et le bouton resterait
  // bloqué sur « Bot en route… » indéfiniment sans ce délai.
  useEffect(() => {
    if (!botPending) return
    const id = setTimeout(() => setBotPending(false), config.bot.joinTimeoutMs)
    return () => clearTimeout(id)
  }, [botPending])
  // Un joueur exclu ne reçoit pas forcément l'événement realtime de sa propre
  // suppression (la RLS s'applique aussi aux notifications) : filet de sécurité.
  useEffect(() => {
    const id = setInterval(refresh, config.ui.lobbyPollMs)
    return () => clearInterval(id)
  }, [refresh])
  const [draft, setDraft] = useState<GameSettings>({
    deckSize: game!.deck_size,
    startBankroll: game!.start_bankroll,
    minBid: game!.min_bid,
    closeDelaySeconds: game!.close_delay_seconds,
    maxPlayers: game!.max_players,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // les réglages appliqués côté serveur font foi (realtime) — on resynchronise le brouillon
  useEffect(() => {
    setDraft({
      deckSize: game!.deck_size,
      startBankroll: game!.start_bankroll,
      minBid: game!.min_bid,
      closeDelaySeconds: game!.close_delay_seconds,
      maxPlayers: game!.max_players,
    })
  }, [game!.deck_size, game!.start_bankroll, game!.min_bid, game!.close_delay_seconds,
      game!.max_players])

  async function saveSettings() {
    setSaving(true)
    setError(null)
    const { error } = await supabase.rpc('update_game_settings', {
      g_id: game!.id,
      p_deck_size: draft.deckSize,
      p_start_bankroll: draft.startBankroll,
      p_min_bid: draft.minBid,
      p_close_delay_seconds: draft.closeDelaySeconds,
      p_max_players: draft.maxPlayers,
    })
    setSaving(false)
    if (error) setError(errorMessage(error))
  }

  async function start() {
    setError(null)
    const { error } = await supabase.rpc('start_game', { g_id: game!.id })
    if (error) setError(errorMessage(error))
  }

  async function kick(playerId: string) {
    setError(null)
    const { error } = await supabase.rpc('kick_player', { g_id: game!.id, p_player_id: playerId })
    if (error) setError(errorMessage(error))
    // les DELETE de `players` ne sont pas répliqués (replica identity par défaut),
    // et exclure le dernier siège ne produit même pas d'UPDATE de recompaction à
    // observer : sans ce refresh explicite, l'hôte garde la ligne jusqu'au poll
    else refresh()
  }

  function addBot() {
    setBotPending(true)
    onAddBot(game!.code, players.map(p => p.nickname))
  }

  const canEdit = isHost && isPrivate
  const full = players.length >= game!.max_players

  return (
    <main className="page">
      <h1>{t('lobby.title')} <span className="badge">{isPrivate ? t('lobby.private') : t('lobby.public')}</span></h1>
      <p>{t('lobby.code')} <strong className="code">{game!.code}</strong></p>
      <p className="hint">
        {t('lobby.playerCount', { count: players.length, max: game!.max_players })}
      </p>
      <ul className="player-list">
        {players.map(p => (
          <li key={p.id}>
            <span>
              <PlayerName nickname={p.nickname} username={usernames[p.auth_uid]} />
              {p.seat === 0 && ` ${t('lobby.host')}`}
            </span>
            {isHost && p.id !== myPlayerId && (
              <button className="secondary" onClick={() => kick(p.id)}>{t('lobby.kick')}</button>
            )}
          </li>
        ))}
      </ul>

      <section className="public-setup">
        <h2>{canEdit ? t('lobby.settings') : t('lobby.settingsReadOnly')}</h2>
        <GameSettingsFields value={draft} onChange={setDraft} disabled={!canEdit} />
        {canEdit && (
          <button className="secondary" onClick={saveSettings} disabled={saving}>
            {saving ? t('lobby.saving') : t('lobby.saveSettings')}
          </button>
        )}
      </section>

      {isHost && !full && (
        <button className="secondary" onClick={addBot} disabled={botPending}>
          {botPending ? t('lobby.botComing') : t('lobby.addBot')}
        </button>
      )}
      {isHost
        ? <button onClick={start} disabled={players.length < 2}>{t('lobby.start')}</button>
        : <p>{t('lobby.waitingHost')}</p>}
      {error && <p className="error">{error}</p>}
    </main>
  )
}
