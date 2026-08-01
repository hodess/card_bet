import type { SeatRow } from '../lib/players'
import { seatUnits } from '../lib/table'
import PlayerSeat from './PlayerSeat'

// L'anneau de sièges. `rows` arrive déjà ordonné par `seatOrder` (moi en premier) :
// la géométrie se contente de suivre l'ordre reçu.
// Le conteneur ne porte que le rôle `list` : il n'a ni taille ni style, les
// sièges étant positionnés en absolu sur la plaque qui l'englobe. Il rend
// valides les `listitem` des sièges, dont l'`aria-label` porte le statut que
// l'interface ne montre qu'en couleur.
export default function PlayerSeats({ rows, myPlayerId, onDeckRef }: {
  rows: SeatRow[]
  myPlayerId: string | null
  onDeckRef: (playerId: string, el: HTMLDivElement | null) => void
}) {
  const units = seatUnits(rows.length)
  return (
    <div role="list">
      {rows.map((row, i) => (
        <PlayerSeat
          key={row.id}
          row={row}
          unit={units[i]}
          isMe={row.id === myPlayerId}
          onDeckRef={onDeckRef}
        />
      ))}
    </div>
  )
}
