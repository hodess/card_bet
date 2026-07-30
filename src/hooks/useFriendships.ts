import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type FriendEntry = {
  otherId: string
  username: string
  status: 'pending' | 'accepted'
  direction: 'sent' | 'received'
}

type FriendshipRow = { requester: string; addressee: string; status: 'pending' | 'accepted' }

// Mes relations d'amitié : la RLS ne renvoie que les lignes où j'apparais,
// on résout les pseudos des contreparties en une seconde requête.
export function useFriendships(enabled: boolean) {
  const [entries, setEntries] = useState<FriendEntry[]>([])

  const refresh = useCallback(async () => {
    if (!enabled) { setEntries([]); return }
    const { data: { user } } = await supabase.auth.getUser()
    const myId = user?.id
    if (!myId) { setEntries([]); return }
    const { data } = await supabase.from('friendships').select('requester, addressee, status')
    const rows = (data as FriendshipRow[] | null) ?? []
    const otherIds = rows.map(f => (f.requester === myId ? f.addressee : f.requester))
    const profs = otherIds.length
      ? (await supabase.from('profiles').select('id, username').in('id', otherIds)).data
      : []
    const names = new Map((profs ?? []).map(p => [p.id, p.username]))
    setEntries(rows.flatMap(f => {
      const otherId = f.requester === myId ? f.addressee : f.requester
      const username = names.get(otherId)
      if (!username) return []  // profil disparu : on ignore la ligne
      return [{
        otherId,
        username,
        status: f.status,
        direction: f.addressee === myId ? 'received' as const : 'sent' as const,
      }]
    }))
  }, [enabled])

  useEffect(() => { refresh() }, [refresh])

  const pendingReceivedCount =
    entries.filter(e => e.status === 'pending' && e.direction === 'received').length

  return { entries, pendingReceivedCount, refresh }
}
