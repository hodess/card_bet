import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import config from '../config.json'
import GameSettingsFields, { type GameSettings } from '../components/GameSettingsFields'

type PublicGame = {
  game_id: string
  host_nickname: string
  player_count: number
  deck_size: number
  start_bankroll: number
  min_bid: number
  close_delay_seconds: number
  created_at: string
}

const DEFAULTS: GameSettings = {
  deckSize: config.game.deckSize,
  startBankroll: config.game.startBankroll,
  minBid: config.game.minBid,
  closeDelaySeconds: config.game.closeDelaySeconds,
}

export default function HomePage() {
  const nav = useNavigate()
  const [nickname, setNickname] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [publicSetup, setPublicSetup] = useState(false)
  const [settings, setSettings] = useState<GameSettings>(DEFAULTS)
  const [board, setBoard] = useState<PublicGame[]>([])

  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data } = await supabase.rpc('list_public_games')
      if (alive && data) setBoard(data as unknown as PublicGame[])
    }
    load()
    const id = setInterval(load, 3000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  async function createGame(visibility: 'private' | 'public') {
    const s = visibility === 'public' ? settings : DEFAULTS
    const { data, error } = await supabase.rpc('create_game', {
      nickname,
      p_deck_size: s.deckSize,
      p_start_bankroll: s.startBankroll,
      p_min_bid: s.minBid,
      p_close_delay_seconds: s.closeDelaySeconds,
      p_max_auction_seconds: config.game.maxAuctionSeconds,
      p_visibility: visibility,
    })
    if (error) return setError(error.message)
    nav(`/game/${(data as { game_id: string }).game_id}`)
  }

  async function joinByCode() {
    const { data, error } = await supabase.rpc('join_game', { game_code: code, nickname })
    if (error) return setError(error.message)
    nav(`/game/${(data as { game_id: string }).game_id}`)
  }

  async function joinPublic(gameId: string) {
    const { data, error } = await supabase.rpc('join_game_by_id', { g_id: gameId, nickname })
    if (error) return setError(error.message)
    nav(`/game/${(data as { game_id: string }).game_id}`)
  }

  const noNick = !nickname.trim()

  return (
    <main className="page">
      <h1>CardBet</h1>
      <input placeholder="Ton pseudo" value={nickname}
        onChange={e => setNickname(e.target.value)} />

      <button onClick={() => createGame('private')} disabled={noNick}>
        Créer une partie privée
      </button>

      {publicSetup ? (
        <section className="public-setup">
          <h2>Partie publique — réglages</h2>
          <p className="hint">Figés à la création : les joueurs du board les voient avant de rejoindre.</p>
          <GameSettingsFields value={settings} onChange={setSettings} />
          <button onClick={() => createGame('public')} disabled={noNick}>Publier la partie</button>
          <button className="secondary" onClick={() => setPublicSetup(false)}>Annuler</button>
        </section>
      ) : (
        <button className="secondary" onClick={() => setPublicSetup(true)}>
          Créer une partie publique…
        </button>
      )}

      <hr />
      <input placeholder="Code de partie" value={code}
        onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} />
      <button onClick={joinByCode} disabled={noNick || code.length !== 6}>Rejoindre par code</button>

      <section className="board">
        <h2>Parties publiques</h2>
        {board.length === 0 && <p className="hint">Aucune partie ouverte pour l'instant.</p>}
        {board.map(g => (
          <div key={g.game_id} className="board-row">
            <div className="board-info">
              <strong>{g.host_nickname}</strong>
              <span className="hint">
                {g.deck_size} cartes · {g.start_bankroll} € · mise min {g.min_bid} · {g.close_delay_seconds} s
              </span>
            </div>
            <button onClick={() => joinPublic(g.game_id)} disabled={noNick}>Rejoindre</button>
          </div>
        ))}
      </section>

      {error && <p className="error">{error}</p>}
    </main>
  )
}
