import { t } from '../i18n'

// Codes d'erreur serveur (SQL `raise exception 'CODE'`). Chaque code a une clé
// `errors.<CODE>` dans les dictionnaires — le test errors.test.ts le vérifie.
export const SERVER_CODES = [
  // comptes
  'USERNAME_TAKEN', 'INVALID_USERNAME', 'ALREADY_HAS_PROFILE',
  'ANONYMOUS_NOT_ALLOWED', 'NOT_AUTHENTICATED',
  // parties
  'GAME_NOT_FOUND', 'GAME_FULL', 'GAME_ALREADY_STARTED', 'GAME_NOT_FINISHED',
  'GAME_NOT_IN_LOBBY',
  'NICKNAME_REQUIRED', 'INVALID_SETTINGS', 'SETTINGS_LOCKED', 'NOT_HOST', 'NOT_A_PLAYER',
  'CANNOT_KICK_SELF', 'NOT_ENOUGH_CARDS', 'MAX_PLAYERS_TOO_LOW', 'NOT_ENOUGH_PLAYERS',
  'UNKNOWN_PACK',
  // amis
  'PLAYER_NOT_FOUND', 'SELF_FRIENDSHIP', 'ALREADY_FRIENDS', 'REQUEST_NOT_FOUND',
  'PROFILE_REQUIRED',
] as const

// Messages Supabase Auth (anglais, non codés) reconnus par fragment.
const AUTH_MATCHES: [needles: string[], key: string][] = [
  [['already been registered', 'already registered'], 'errors.emailAlreadyRegistered'],
  [['Invalid login credentials'], 'errors.invalidCredentials'],
  [['Password should be'], 'errors.passwordTooShort'],
]

// Traduit une erreur serveur en message affichable. Fallback : le message brut.
export function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  const code = SERVER_CODES.find(c => msg.includes(c))
  if (code) return t(`errors.${code}`)
  const auth = AUTH_MATCHES.find(([needles]) => needles.some(n => msg.includes(n)))
  if (auth) return t(auth[1])
  return msg
}
