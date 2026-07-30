import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type Profile = { id: string; username: string }

export type ProfileState = {
  loading: boolean
  isAnonymous: boolean
  hasAccount: boolean          // connecté avec un vrai compte (non anonyme)
  profile: Profile | null      // null si anonyme, ou compte sans pseudo choisi
  refresh: () => Promise<void>
}

export function useProfile(): ProfileState {
  const [state, setState] = useState<Omit<ProfileState, 'refresh'>>({
    loading: true, isAnonymous: true, hasAccount: false, profile: null,
  })

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const anonymous = user?.is_anonymous ?? true
    let profile: Profile | null = null
    if (user && !anonymous) {
      const { data } = await supabase.from('profiles')
        .select('id, username').eq('id', user.id).maybeSingle()
      profile = data ?? null
    }
    setState({ loading: false, isAnonymous: anonymous, hasAccount: !!user && !anonymous, profile })
  }, [])

  useEffect(() => {
    refresh()
    const { data: sub } = supabase.auth.onAuthStateChange(() => { refresh() })
    return () => sub.subscription.unsubscribe()
  }, [refresh])

  return { ...state, refresh }
}
