import type { CSSProperties } from 'react'
import { avatarHue, avatarInitial } from '../lib/avatar'

// Pastille d'identité : initiale du pseudo sur une teinte dérivée du pseudo.
// La teinte passe par une variable CSS (le cast est nécessaire : TS ne connaît
// pas les propriétés custom) — saturation et luminosité restent dans index.css.
export default function Avatar({ username, size = 'sm' }:
  { username: string; size?: 'sm' | 'lg' }) {
  return (
    <span className={`avatar${size === 'lg' ? ' lg' : ''}`} aria-hidden="true"
      style={{ '--avatar-hue': String(avatarHue(username)) } as CSSProperties}>
      {avatarInitial(username)}
    </span>
  )
}
