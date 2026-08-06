// Anneau de compte à rebours : contour rectangulaire de la carte (246×316).
// Aucune rotation sur les rect — elle déformerait la géométrie du tracé.
// `tone` dit ce que l'anneau mesure : une enchère (couleur du meneur), une
// décision d'ouverture (or), ou une carte qui sort (gris).
export default function TimerRing({ remaining, windowMs, urgent, tone = 'player' }:
  { remaining: number; windowMs: number; urgent: boolean; tone?: 'player' | 'accent' | 'muted' }) {
  const fraction = Math.max(0, Math.min(1, remaining / windowMs))
  return (
    <svg className={`timer-ring tone-${tone}${urgent ? ' urgent' : ''}`} viewBox="0 0 246 316" role="timer">
      <rect className="ring-bg" x="9" y="9" width="228" height="298" rx="22" />
      <rect
        className="ring-fg"
        x="9" y="9" width="228" height="298" rx="22"
        pathLength={1000}
        strokeDasharray={1000}
        strokeDashoffset={1000 * (1 - fraction)}
      />
    </svg>
  )
}
