import { supabase } from './supabase'
import type { Database } from './database.types'

// Le résumé renvoyé par la RPC list_packs — exactement ce qu'affiche PackTile.
export type PackSummary = {
  slug: string
  card_count: number
  min_rating: number
  max_rating: number
}

export type PackCard = Database['public']['Tables']['cards']['Row']

export async function listPacks(): Promise<PackSummary[]> {
  const { data, error } = await supabase.rpc('list_packs')
  if (error) throw error
  return (data ?? []) as unknown as PackSummary[]
}

// Le détail d'un pack ne passe pas par une RPC : la policy cards_read suffit.
export async function listPackCards(slug: string): Promise<PackCard[]> {
  const { data, error } = await supabase.from('cards').select('*')
    .eq('pack', slug)
    .order('rating', { ascending: false })
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}
