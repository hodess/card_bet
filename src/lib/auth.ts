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

// traduit les codes d'erreur (SQL et Supabase Auth) en messages affichables
export function authErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('USERNAME_TAKEN')) return 'Ce pseudo est déjà pris.'
  if (msg.includes('INVALID_USERNAME')) return '3 à 20 caractères : lettres, chiffres et _ uniquement.'
  if (msg.includes('ALREADY_HAS_PROFILE')) return 'Ce compte a déjà un pseudo.'
  if (msg.includes('ANONYMOUS_NOT_ALLOWED')) return 'Crée d\'abord ton compte pour choisir un pseudo.'
  if (msg.includes('already been registered') || msg.includes('already registered'))
    return 'Cet email est déjà associé à un compte — connecte-toi plutôt.'
  if (msg.includes('Invalid login credentials')) return 'Email ou mot de passe incorrect.'
  if (msg.includes('Password should be')) return 'Mot de passe trop court (6 caractères minimum).'
  return msg
}
