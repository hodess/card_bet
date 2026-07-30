import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { GameState } from '../hooks/useGame'
import GameSettingsFields, { type GameSettings } from './GameSettingsFields'
import PlayerName from './PlayerName'
import { useUsernames } from '../hooks/useUsernames'

export default function Lobby({ state, onAddBot }: { state: GameState; onAddBot: (code: string) => void }) {
  const { game, players, myPlayerId } = state
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
    const { error } = await supabase.rpc('update_game_settings', {
      g_id: game!.id,
      p_deck_size: draft.deckSize,
      p_start_bankroll: draft.startBankroll,
      p_min_bid: draft.minBid,
      p_close_delay_seconds: draft.closeDelaySeconds,
    })
    setSaving(false)
    if (error) alert(error.message)
  }

  async function start() {
    const { error } = await supabase.rpc('start_game', { g_id: game!.id })
    if (error) alert(error.message)
  }

  function addBot() {
    setBotRequested(true)
    onAddBot(game!.code)
  }

  const canEdit = isHost && isPrivate

  return (
    <main className="page">
      <h1>Salon <span className="badge">{isPrivate ? 'Privée' : 'Publique'}</span></h1>
      <p>Code de la partie : <strong className="code">{game!.code}</strong></p>
      <ul className="player-list">
        {players.map(p => (
          <li key={p.id}>
            <PlayerName nickname={p.nickname} username={usernames[p.auth_uid]} />
            {p.seat === 0 && ' (hôte)'}
          </li>
        ))}
      </ul>

      <section className="public-setup">
        <h2>Réglages {canEdit ? '' : '(lecture seule)'}</h2>
        <GameSettingsFields value={draft} onChange={setDraft} disabled={!canEdit} />
        {canEdit && (
          <button className="secondary" onClick={saveSettings} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer les réglages'}
          </button>
        )}
      </section>

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
