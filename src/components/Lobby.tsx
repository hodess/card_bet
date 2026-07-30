import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { GameState } from '../hooks/useGame'
import GameSettingsFields, { type GameSettings } from './GameSettingsFields'
import PlayerName from './PlayerName'
import { useUsernames } from '../hooks/useUsernames'
import { errorMessage } from '../lib/errors'
import { useT } from '../hooks/useT'

export default function Lobby({ state, onAddBot }: { state: GameState; onAddBot: (code: string) => void }) {
  const { game, players, myPlayerId } = state
  const { t } = useT()
  const isHost = players.find(p => p.id === myPlayerId)?.seat === 0
  const usernames = useUsernames(players.map(p => p.auth_uid))
  const isPrivate = game!.visibility === 'private'
  const [botRequested, setBotRequested] = useState(false)
  const [draft, setDraft] = useState<GameSettings>({
    deckSize: game!.deck_size,
    startBankroll: game!.start_bankroll,
    minBid: game!.min_bid,
    closeDelaySeconds: game!.close_delay_seconds,
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
    })
  }, [game!.deck_size, game!.start_bankroll, game!.min_bid, game!.close_delay_seconds])

  async function saveSettings() {
    setSaving(true)
    setError(null)
    const { error } = await supabase.rpc('update_game_settings', {
      g_id: game!.id,
      p_deck_size: draft.deckSize,
      p_start_bankroll: draft.startBankroll,
      p_min_bid: draft.minBid,
      p_close_delay_seconds: draft.closeDelaySeconds,
    })
    setSaving(false)
    if (error) setError(errorMessage(error))
  }

  async function start() {
    setError(null)
    const { error } = await supabase.rpc('start_game', { g_id: game!.id })
    if (error) setError(errorMessage(error))
  }

  function addBot() {
    setBotRequested(true)
    onAddBot(game!.code)
  }

  const canEdit = isHost && isPrivate

  return (
    <main className="page">
      <h1>{t('lobby.title')} <span className="badge">{isPrivate ? t('lobby.private') : t('lobby.public')}</span></h1>
      <p>{t('lobby.code')} <strong className="code">{game!.code}</strong></p>
      <ul className="player-list">
        {players.map(p => (
          <li key={p.id}>
            <PlayerName nickname={p.nickname} username={usernames[p.auth_uid]} />
            {p.seat === 0 && ` ${t('lobby.host')}`}
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

      {isHost && players.length < 2 && (
        <button className="secondary" onClick={addBot} disabled={botRequested}>
          {botRequested ? t('lobby.botComing') : t('lobby.addBot')}
        </button>
      )}
      {isHost
        ? <button onClick={start} disabled={players.length < 2}>{t('lobby.start')}</button>
        : <p>{t('lobby.waitingHost')}</p>}
      {error && <p className="error">{error}</p>}
    </main>
  )
}
