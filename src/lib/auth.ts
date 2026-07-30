import { supabase } from './supabase'

// retour OAuth : la racine du site, jamais une route hash
// (origin + pathname marche en local ET sur GitHub Pages, et ignore le #/…)
const oauthRedirect = () => window.location.origin + window.location.pathname

export async function upgradeWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email, password })
  if (error) throw error
  // le JWT garde is_anonymous=true jusqu'au refresh (updateUser ne fait pas tourner le token)
  await supabase.auth.refreshSession()
}

export async function upgradeWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo: oauthRedirect() },
  })
  if (error) throw error
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: oauthRedirect() },
  })
  if (error) throw error
}

export async function claimUsername(username: string): Promise<void> {
  const { error } = await supabase.rpc('claim_username', { p_username: username })
  if (error) throw error
  // un RPC ne déclenche aucun événement auth : le refresh notifie tous les useProfile (dont UsernameGate)
  await supabase.auth.refreshSession()
}

export async function signOutToAnonymous(): Promise<void> {
  await supabase.auth.signOut()
  const { error } = await supabase.auth.signInAnonymously()
  if (error) throw error
}
