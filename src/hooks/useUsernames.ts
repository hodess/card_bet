import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// map auth_uid → username pour les uids ayant un profil
export function useUsernames(uids: string[]): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({})
  const key = [...uids].sort().join(',')

  useEffect(() => {
    if (!key) { setMap({}); return }
    let alive = true
    supabase.from('profiles').select('id, username').in('id', key.split(','))
      .then(({ data }) => {
        if (alive && data) setMap(Object.fromEntries(data.map(p => [p.id, p.username])))
      })
    return () => { alive = false }
  }, [key])

  return map
}
