import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useProfile } from '../hooks/useProfile'
import { usePacks } from '../hooks/usePacks'
import { useT } from '../hooks/useT'
import config from '../config.json'
import GameSettingsFields, { type GameSettings } from '../components/GameSettingsFields'
import { createGame as createGameRpc, joinGameByCode, joinGameById } from '../lib/gameApi'
import { errorMessage } from '../lib/errors'

type PublicGame = {
  game_id: string
  host_nickname: string
  host_username: string | null
  player_count: number
  max_players: number
  pack: string
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
  maxPlayers: config.game.maxPlayers,
  pack: config.game.pack,
}

export default function HomePage() {
  const nav = useNavigate()
  const { profile } = useProfile()
  const { t } = useT()
  const { packs, error: packsError } = usePacks()
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
    const id = setInterval(load, config.ui.boardPollMs)
    return () => { alive = false; clearInterval(id) }
  }, [])

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
        maxPlayers: s.maxPlayers,
        pack: s.pack,
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
        <input placeholder={t('home.nicknamePlaceholder')} value={nickname}
          onChange={e => setNickname(e.target.value)} />
      )}

      <button onClick={() => createGame('private')} disabled={noNick}>
        {t('home.createPrivate')}
      </button>

      {publicSetup ? (
        <section className="public-setup">
          <h2>{t('home.publicSettingsTitle')}</h2>
          <p className="hint">{t('home.publicSettingsHint')}</p>
          <GameSettingsFields value={settings} onChange={setSettings}
            packs={packs} />
          {/* échec de list_packs : le sélecteur retombe en lecture seule sans ce message */}
          {packsError && <p className="error">{packsError}</p>}
          <button onClick={() => createGame('public')} disabled={noNick}>{t('home.publish')}</button>
          <button className="secondary" onClick={() => setPublicSetup(false)}>{t('common.cancel')}</button>
        </section>
      ) : (
        <button className="secondary" onClick={() => setPublicSetup(true)}>
          {t('home.createPublic')}
        </button>
      )}

      <hr />
      <input placeholder={t('home.codePlaceholder')} value={code}
        onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} />
      <button onClick={joinByCode} disabled={noNick || code.length !== 6}>{t('home.joinByCode')}</button>

      <section className="board">
        <h2>{t('home.publicGames')}</h2>
        {board.length === 0 && <p className="hint">{t('home.noPublicGames')}</p>}
        {board.map(g => (
          <div key={g.game_id} className="board-row">
            <div className="board-info">
              {g.host_username
                ? <Link className="player-link" to={`/profile/${g.host_username}`}><strong>{g.host_username}</strong></Link>
                : <strong>{g.host_nickname}</strong>}
              <span className="hint">
                {t('lobby.playerCount', { count: g.player_count, max: g.max_players })}
              </span>
              <span className="hint">
                {t('home.gameSummary', {
                  deck: g.deck_size,
                  bankroll: g.start_bankroll,
                  minBid: g.min_bid,
                  delay: g.close_delay_seconds,
                })}
              </span>
              <span className="hint">{packs.find(p => p.slug === g.pack)?.name ?? g.pack}</span>
            </div>
            <button onClick={() => joinPublic(g.game_id)} disabled={noNick}>{t('home.join')}</button>
          </div>
        ))}
      </section>

      {error && <p className="error">{error}</p>}
    </main>
  )
}
