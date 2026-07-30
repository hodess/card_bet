// Avatar déterministe : même pseudo → même initiale et même teinte, partout
// et sans stockage. La teinte sort en degrés HSL, le CSS fixe saturation et
// luminosité (donc aucune couleur en dur ici).
export function avatarInitial(username: string): string {
  return username.trim().charAt(0).toUpperCase() || '?'
}

export function avatarHue(username: string): number {
  let hash = 0
  for (const ch of username.trim().toLowerCase()) {
    hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) % 360
  }
  return hash
}
