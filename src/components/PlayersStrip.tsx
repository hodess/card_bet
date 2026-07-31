import type { CSSProperties } from 'react'
import type { StripRow } from '../lib/players'
import { playerColor } from '../lib/players'
import { avatarInitial } from '../lib/avatar'
import { useT } from '../hooks/useT'

// Bandeau joueurs : bankroll, slots de deck, statut. Le bloc de slots porte la
// ref exposée au parent : c'est la cible du vol de la carte adjugée.
export default function PlayersStrip({ rows, onDeckRef }: {
  rows: StripRow[]
  onDeckRef: (playerId: string, el: HTMLDivElement | null) => void
}) {
  const { t } = useT()
  const statuts = {
    leading: t('auction.chipLeading'),
    wins: t('auction.chipWins'),
    passed: t('auction.chipPassed'),
  }
  const unMeneur = rows.some(r => r.status === 'leading' || r.status === 'wins')

  return (
    <footer className={`players-strip${unMeneur ? ' has-leader' : ''}`}>
      {rows.map(row => (
        <div
          key={row.id}
          className={`player-row${row.status === 'leading' || row.status === 'wins' ? ' leading' : ''}`}
          style={{ '--pc': playerColor(row.seat) } as CSSProperties}
        >
          <span className="pr-avatar">{avatarInitial(row.nickname)}</span>
          <span className="pr-col">
            <span className="pr-name">{row.nickname}</span>
            {/* key = valeur : rejoue `slam` quand la bankroll change */}
            <span className="pr-bank" key={row.bankroll}>{row.bankroll} €</span>
          </span>
          {row.status && (
            <span className={`pr-status${row.status === 'passed' ? ' passed' : ''}`}>
              {statuts[row.status]}
            </span>
          )}
          <div className="pr-deck" ref={el => { onDeckRef(row.id, el) }}>
            {Array.from({ length: row.total }, (_, i) => (
              <i
                key={i}
                className={`pr-slot${i < row.filled ? ' filled' : ''}${i === row.popIndex ? ' pop' : ''}`}
              />
            ))}
          </div>
          {row.paid !== null && <span className="pr-paid">−{row.paid} €</span>}
        </div>
      ))}
    </footer>
  )
}
