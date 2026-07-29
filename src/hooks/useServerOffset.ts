import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useServerOffset(): number {
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    supabase.rpc('get_server_time').then(({ data }) => {
      if (data) setOffset(new Date(data).getTime() - Date.now())
    })
  }, [])
  return offset
}
