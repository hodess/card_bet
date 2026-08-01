import { supabase } from './supabase'
import config from '../config.json'

type GameRef = { game_id: string }

// Les RPC d'entrée en partie : renvoient l'id de la partie, throw en erreur serveur.
export async function createGame(opts: {
  nickname: string
  deckSize: number
  startBankroll: number
  minBid: number
  closeDelaySeconds: number
  maxPlayers: number
  pack: string
  visibility: 'private' | 'public'
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_game', {
    nickname: opts.nickname,
    p_deck_size: opts.deckSize,
    p_start_bankroll: opts.startBankroll,
    p_min_bid: opts.minBid,
    p_close_delay_seconds: opts.closeDelaySeconds,
    p_max_auction_seconds: config.game.maxAuctionSeconds,
    p_visibility: opts.visibility,
    p_max_players: opts.maxPlayers,
    p_pack: opts.pack,
  })
  if (error) throw error
  return (data as GameRef).game_id
}

export async function joinGameByCode(code: string, nickname: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_game', { game_code: code, nickname })
  if (error) throw error
  return (data as GameRef).game_id
}

export async function joinGameById(gameId: string, nickname: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_game_by_id', { g_id: gameId, nickname })
  if (error) throw error
  return (data as GameRef).game_id
}

export async function rematchGame(oldGameId: string): Promise<string> {
  const { data, error } = await supabase.rpc('rematch_game', { old_game_id: oldGameId })
  if (error) throw error
  return (data as GameRef).game_id
}
