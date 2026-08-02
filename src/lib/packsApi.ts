import { supabase } from './supabase'
import type { Database } from './database.types'
import type { PackInput } from './packs'

// Le résumé renvoyé par la RPC list_packs — exactement ce qu'affiche PackTile.
export type PackSummary = {
  slug: string
  name: string
  emoji: string
  description: string
  positions: Record<string, string>
  owner_username: string | null
  visibility: 'public' | 'private'
  is_mine: boolean
  card_count: number
  min_rating: number
  max_rating: number
}

export type PackRow = Database['public']['Tables']['packs']['Row']
export type PackCard = Database['public']['Tables']['cards']['Row']

export async function listPacks(): Promise<PackSummary[]> {
  const { data, error } = await supabase.rpc('list_packs')
  if (error) throw error
  return (data ?? []) as unknown as PackSummary[]
}

// Le détail d'un pack ne passe pas par une RPC : les policies packs_read et
// cards_read suffisent, et elles cachent déjà le privé d'un autre.
export async function getPack(slug: string): Promise<PackRow | null> {
  const { data, error } = await supabase.from('packs').select('*')
    .eq('slug', slug).maybeSingle()
  if (error) throw error
  return data
}

export async function listPackCards(slug: string): Promise<PackCard[]> {
  const { data, error } = await supabase.from('cards').select('*')
    .eq('pack', slug)
    .eq('retired', false)
    .order('rating', { ascending: false })
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function savePack(slug: string | null, payload: PackInput,
                               visibility: 'public' | 'private'): Promise<string> {
  const { data, error } = await supabase.rpc('save_pack', {
    // p_slug est bien nullable côté SQL (création = pas de slug) : les types
    // générés ne le reflètent pas faute de valeur par défaut sur ce paramètre.
    p_slug: slug as string, p_payload: payload as never, p_visibility: visibility,
  })
  if (error) throw error
  return (data as unknown as { slug: string }).slug
}

export async function setPackVisibility(slug: string,
                                        visibility: 'public' | 'private'): Promise<void> {
  const { error } = await supabase.rpc('set_pack_visibility', {
    p_slug: slug, p_visibility: visibility,
  })
  if (error) throw error
}

export async function deletePack(slug: string): Promise<void> {
  const { error } = await supabase.rpc('delete_pack', { p_slug: slug })
  if (error) throw error
}
