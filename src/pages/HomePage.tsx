import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../hooks/useProfile'
import config from '../config.json'
import GameSettingsFields, { type GameSettings } from '../components/GameSettingsFields'
import { createGame as createGameRpc, joinGameByCode, joinGameById } from '../lib/gameApi'
import { errorMessage } from '../lib/errors'

type PublicGame = {
  game_id: string
  host_nickname: string
  host_username: string | null
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
  const { profile } = useProfile()
  const [nickname, setNickname] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [publicSetup, setPublicSetup] = useState(false)
  const [settings, setSettings] = useState<GameSettings>(DEFAULTS)
  const [board, setBoard] = useState<PublicGame[]>([])
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{ username: string }[]>([])

  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data } = await supabase.rpc('list_public_games')
      if (alive && data) setBoard(data as unknown as PublicGame[])
    }
    load()
    const id = setInterval(load, config.ui.boardPollMs)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // recherche de joueurs (debounce léger)
  useEffect(() => {
    if (query.trim().length < 2) { setFound([]); return }
    let alive = true
    const t = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('username')
        .ilike('username', `%${query.trim()}%`).limit(10)
      if (alive) setFound(data ?? [])
    }, config.ui.searchDebounceMs)
    return () => { alive = false; clearTimeout(t) }
  }, [query])

  // le pseudo du profil fait foi (le serveur l'impose de toute façon)
  const effectiveNickname = profile?.username ?? nickname
  const noNick = !effectiveNickname.trim()

  async function createGame(visibility: 'private' | 'public') {
    const s = visibility === 'public' ? settings : DEFAULTS
    try {
      const gameId = await createGameRpc({
        nickname: effectiveNickname,
        deckSize: s.deckSize,
        startBankroll: s.startBankroll,
        minBid: s.minBid,
        closeDelaySeconds: s.closeDelaySeconds,
        visibility,
      })
      nav(`/game/${gameId}`)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function joinByCode() {
    try {
      nav(`/game/${await joinGameByCode(code, effectiveNickname)}`)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function joinPublic(gameId: string) {
    try {
      nav(`/game/${await joinGameById(gameId, effectiveNickname)}`)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <main className="page">
      <h1>CardBet</h1>
      {!profile && (
        <input placeholder="Ton pseudo" value={nickname}
          onChange={e => setNickname(e.target.value)} />
      )}

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
              {g.host_username
                ? <Link className="player-link" to={`/profile/${g.host_username}`}><strong>{g.host_username}</strong></Link>
                : <strong>{g.host_nickname}</strong>}
              <span className="hint">
                {g.deck_size} cartes · {g.start_bankroll} € · mise min {g.min_bid} · {g.close_delay_seconds} s
              </span>
            </div>
            <button onClick={() => joinPublic(g.game_id)} disabled={noNick}>Rejoindre</button>
          </div>
        ))}
      </section>

      <section className="board">
        <h2>Trouver un joueur</h2>
        <input placeholder="Rechercher un pseudo…" value={query}
          onChange={e => setQuery(e.target.value)} />
        {found.map(f => (
          <div key={f.username} className="board-row">
            <Link className="player-link" to={`/profile/${f.username}`}>{f.username}</Link>
          </div>
        ))}
        {query.trim().length >= 2 && found.length === 0 && (
          <p className="hint">Aucun joueur trouvé.</p>
        )}
      </section>

      {error && <p className="error">{error}</p>}
    </main>
  )
}
