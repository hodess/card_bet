// Traduit les codes d'erreur serveur (SQL `raise exception 'CODE'` et Supabase Auth)
// en messages affichables. Fallback : le message brut.
const CODES: Record<string, string> = {
  // comptes
  USERNAME_TAKEN: 'Ce pseudo est déjà pris.',
  INVALID_USERNAME: '3 à 20 caractères : lettres, chiffres et _ uniquement.',
  ALREADY_HAS_PROFILE: 'Ce compte a déjà un pseudo.',
  ANONYMOUS_NOT_ALLOWED: 'Crée d’abord ton compte pour choisir un pseudo.',
  NOT_AUTHENTICATED: 'Connexion perdue — recharge la page.',
  // parties
  GAME_NOT_FOUND: 'Partie introuvable.',
  GAME_FULL: 'La partie est déjà complète.',
  GAME_ALREADY_STARTED: 'La partie a déjà commencé.',
  GAME_NOT_FINISHED: 'La partie n’est pas terminée.',
  NICKNAME_REQUIRED: 'Choisis un pseudo.',
  INVALID_SETTINGS: 'Réglages invalides.',
  SETTINGS_LOCKED: 'Les réglages d’une partie publique sont figés.',
  NOT_HOST: 'Seul l’hôte peut faire ça.',
  NOT_A_PLAYER: 'Tu n’es pas dans cette partie.',
  // amis
  PLAYER_NOT_FOUND: 'Joueur introuvable.',
  SELF_FRIENDSHIP: 'Tu ne peux pas t’ajouter toi-même.',
  ALREADY_FRIENDS: 'Vous êtes déjà amis.',
  REQUEST_NOT_FOUND: 'Demande introuvable.',
  PROFILE_REQUIRED: 'Crée ton compte pour utiliser les amis.',
}

export function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  const hit = Object.entries(CODES).find(([code]) => msg.includes(code))
  if (hit) return hit[1]
  if (msg.includes('already been registered') || msg.includes('already registered'))
    return 'Cet email est déjà associé à un compte — connecte-toi plutôt.'
  if (msg.includes('Invalid login credentials')) return 'Email ou mot de passe incorrect.'
  if (msg.includes('Password should be')) return 'Mot de passe trop court (6 caractères minimum).'
  return msg
}
