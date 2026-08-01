import type { CSSProperties } from 'react'
import type { SeatRow } from '../lib/players'
import type { SeatUnit } from '../lib/table'
import { playerColor } from '../lib/players'
import { avatarInitial } from '../lib/avatar'
import { useT } from '../hooks/useT'

// Un siège autour de la table : identité, bankroll, slots de deck. Le bloc de
// slots porte la ref exposée au parent : c'est la cible du vol de la carte adjugée.
// La position vient de `unit` (fractions du rectangle de la carte) ; `unit.edge`
// devient une classe, qui porte l'ancrage vers l'extérieur de la carte.
export default function PlayerSeat({ row, unit, isMe, onDeckRef }: {
  row: SeatRow
  unit: SeatUnit
  isMe: boolean
  onDeckRef: (playerId: string, el: HTMLDivElement | null) => void
}) {
  const { t } = useT()
  const mene = row.status === 'leading' || row.status === 'wins'
  const classes = ['seat', `seat-${unit.edge}`]
  if (mene) classes.push('leading')
  if (row.status === 'passed') classes.push('passed')
  if (isMe) classes.push('me')

  // Le statut n'est porté visuellement que par la couleur et l'échelle : sans
  // ce libellé il serait invisible pour un lecteur d'écran. Le rôle `listitem`
  // est nécessaire, un `aria-label` sur un élément générique étant ignoré.
  const statuts = {
    leading: t('auction.chipLeading'),
    wins: t('auction.chipWins'),
    passed: t('auction.chipPassed'),
  }
  const libelle = [
    row.nickname,
    isMe ? t('auction.you') : null,
    row.status ? statuts[row.status] : null,
    `${row.bankroll} €`,
  ].filter(Boolean).join(', ')

  return (
    <div
      className={classes.join(' ')}
      role="listitem"
      aria-label={libelle}
      style={{
        '--pc': playerColor(row.seat),
        '--sx': unit.x,
        '--sy': unit.y,
      } as CSSProperties}
    >
      <span className="seat-avatar">{avatarInitial(row.nickname)}</span>
      <span className="seat-name">{row.nickname}</span>
      {/* key = valeur : rejoue `slam` quand la bankroll change */}
      <span className="seat-bank" key={row.bankroll}>{row.bankroll} €</span>
      <div className="seat-deck" ref={el => { onDeckRef(row.id, el) }}>
        {Array.from({ length: row.total }, (_, i) => (
          <i
            key={i}
            className={`seat-slot${i < row.filled ? ' filled' : ''}${i === row.popIndex ? ' pop' : ''}`}
          />
        ))}
      </div>
      {row.paid !== null && <span className="seat-paid">−{row.paid} €</span>}
    </div>
  )
}
