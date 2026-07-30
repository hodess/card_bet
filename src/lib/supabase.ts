import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  // PKCE : le retour OAuth arrive en ?code= (query) et non en #access_token — indispensable avec HashRouter
  { auth: { flowType: 'pkce' } },
)

export async function ensureSession(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    const { error } = await supabase.auth.signInAnonymously()
    if (error) throw error
  }
}
