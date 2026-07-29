import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Database } from '../lib/database.types'

type GameRow = Database['public']['Tables']['games']['Row']
type PlayerRow = Database['public']['Tables']['players']['Row']
type CardRow = Database['public']['Tables']['cards']['Row']
type AuctionRow = Database['public']['Tables']['auctions']['Row']
type PlayerCardRow = Database['public']['Tables']['player_cards']['Row']

export type AuctionWithCard = AuctionRow & { card: CardRow }
export type OwnedCard = PlayerCardRow & { card: CardRow }

export type GameState = {
  loading: boolean
  game: GameRow | null
  players: PlayerRow[]
  auction: AuctionWithCard | null
  ownedCards: OwnedCard[]
  myPlayerId: string | null
}

export function useGame(gameId: string): GameState {
  const [state, setState] = useState<GameState>({
    loading: true, game: null, players: [], auction: null, ownedCards: [], myPlayerId: null,
  })

  const loadAll = useCallback(async () => {
    const [gameRes, playersRes, auctionsRes, ownedRes, authRes] = await Promise.all([
      supabase.from('games').select('*').eq('id', gameId).maybeSingle(),
      supabase.from('players').select('*').eq('game_id', gameId).order('seat'),
      supabase.from('auctions').select('*, card:cards(*)').eq('game_id', gameId)
        .order('seq', { ascending: false }).limit(1),
      supabase.from('player_cards').select('*, card:cards(*)').eq('game_id', gameId),
      supabase.auth.getUser(),
    ])
    const players = playersRes.data ?? []
    const me = players.find(p => p.auth_uid === authRes.data.user?.id) ?? null
    setState({
      loading: false,
      game: gameRes.data ?? null,
      players,
      auction: (auctionsRes.data?.[0] as AuctionWithCard | undefined) ?? null,
      ownedCards: (ownedRes.data as OwnedCard[] | null) ?? [],
      myPlayerId: me?.id ?? null,
    })
  }, [gameId])

  useEffect(() => {
    loadAll()
    const channel = supabase
      .channel(`game-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auctions', filter: `game_id=eq.${gameId}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_cards', filter: `game_id=eq.${gameId}` }, loadAll)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [gameId, loadAll])

  return state
}
