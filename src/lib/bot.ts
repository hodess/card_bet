import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { maxBid } from './game'
import config from '../config.json'

export type BotView = {
  botPlayerId: string
  currentBidder: string
  currentBid: number
  bankroll: number
  slotsMissing: number
  minBid: number
}

export function decideBid(view: BotView, rng: () => number): number | null {
  if (view.slotsMissing <= 0) return null
  if (view.currentBidder === view.botPlayerId) return null
  if (rng() >= config.bot.bidProbability) return null
  const r = rng()
  const increment = r < 0.5 ? 10 : r < 0.8 ? 50 : 100
  const cap = maxBid(view.bankroll, view.slotsMissing, view.minBid)
  const amount = view.currentBid + increment
  if (amount <= cap) return amount
  const fallback = view.currentBid + 10
  return fallback <= cap ? fallback : null
}

export function startBot(gameCode: string): () => void {
  let stopped = false
  let bidInFlight = false
  let timer: ReturnType<typeof setInterval> | undefined
  const passRolled = new Set<string>() // une seule décision de passe par enchère

  const bot = createClient<Database>(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, storageKey: 'cardbet-bot' } },
  )

  const stop = () => {
    stopped = true
    if (timer) clearInterval(timer)
  }

  const run = async () => {
    const { error: authError } = await bot.auth.signInAnonymously()
    if (authError || stopped) return
    const nickname = config.bot.names[Math.floor(Math.random() * config.bot.names.length)]
    const { data, error } = await bot.rpc('join_game', { game_code: gameCode, nickname, p_is_bot: true })
    if (error || stopped) return
    const gameId = (data as { game_id: string }).game_id
    const { data: auth } = await bot.auth.getUser()
    const botUid = auth.user?.id

    const tick = async () => {
      if (stopped || bidInFlight) return
      const [gameRes, auctionRes, playersRes, cardsRes] = await Promise.all([
        bot.from('games').select('status, deck_size, min_bid').eq('id', gameId).maybeSingle(),
        bot.from('auctions').select('*').eq('game_id', gameId).order('seq', { ascending: false }).limit(1),
        bot.from('players').select('*').eq('game_id', gameId),
        bot.from('player_cards').select('player_id').eq('game_id', gameId),
      ])
      const game = gameRes.data
      if (!game || game.status === 'finished') { stop(); return }
      const auction = auctionRes.data?.[0]
      const me = playersRes.data?.find(p => p.auth_uid === botUid)
      if (game.status !== 'playing' || !auction || auction.status !== 'open' || !me) return
      // sursis de révélation : le serveur refuse mises et passes avant l'ouverture
      if (new Date(auction.opened_at).getTime() > Date.now()) return
      if (auction.passed.includes(me.id)) return

      const myCards = (cardsRes.data ?? []).filter(c => c.player_id === me.id).length
      const view: BotView = {
        botPlayerId: me.id,
        currentBidder: auction.current_bidder,
        currentBid: auction.current_bid,
        bankroll: me.bankroll,
        slotsMissing: game.deck_size - myCards,
        minBid: game.min_bid,
      }
      const amount = decideBid(view, Math.random)

      if (amount === null) {
        // pas meneur, et soit bloqué soit pas envie : envisager de passer (une fois par enchère)
        const isLeader = auction.current_bidder === me.id
        if (!isLeader && !passRolled.has(auction.id)) {
          passRolled.add(auction.id)
          const cap = maxBid(view.bankroll, view.slotsMissing, view.minBid)
          const cannotBid = view.slotsMissing <= 0 || auction.current_bid + 10 > cap
          if (cannotBid || Math.random() < config.bot.passProbability) {
            await bot.rpc('pass_auction', { g_id: gameId }) // erreurs ignorées (races normales)
          }
        }
        return
      }

      bidInFlight = true
      const delay = config.bot.delayMinMs + Math.random() * (config.bot.delayMaxMs - config.bot.delayMinMs)
      setTimeout(async () => {
        if (!stopped) {
          await bot.rpc('place_bid', { g_id: gameId, amount }) // erreurs ignorées
        }
        bidInFlight = false
      }, delay)
    }

    timer = setInterval(tick, config.bot.pollMs)
  }

  run()
  return stop
}
