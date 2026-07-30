// Erreurs renvoyées par Supabase au retour d'un flux OAuth raté.
// Fichier sans import supabase : parseAuthError doit rester testable en vitest.
export type AuthReturnError = { code: string; description: string }

// Supabase met les paramètres d'erreur en query ET en fragment — on cherche dans les deux.
export function parseAuthError(search: string, hash: string): AuthReturnError | null {
  const from = (raw: string): AuthReturnError | null => {
    const params = new URLSearchParams(raw.replace(/^[?#]/, ''))
    // error_code est le plus précis ; error suffit à savoir qu'il y a eu un échec
    const code = params.get('error_code') ?? params.get('error')
    if (!code) return null
    return { code, description: params.get('error_description') ?? '' }
  }
  return from(search) ?? from(hash)
}

let pendingAuthError: AuthReturnError | null = null

// À appeler une fois au démarrage. Ne touche à l'URL QUE si des paramètres
// d'erreur sont présents : un retour OAuth réussi (?code=…) n'est jamais modifié (PKCE).
export function captureAuthError(): void {
  const err = parseAuthError(window.location.search, window.location.hash)
  if (!err) return
  pendingAuthError = err
  window.history.replaceState(null, '', window.location.origin + window.location.pathname)
}

export function peekAuthError(): AuthReturnError | null {
  return pendingAuthError
}

export function takeAuthError(): AuthReturnError | null {
  const err = pendingAuthError
  pendingAuthError = null
  return err
}
