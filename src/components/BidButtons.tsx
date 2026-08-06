import config from '../config.json'
import { formatMs } from '../lib/game'
import { useT } from '../hooks/useT'

// Toute la zone d'action de l'enchère : ligne d'aide, incréments, Max, Je passe —
// et, pendant la temporisation, la décision d'ouverture. L'ouvreur ne voit pas les
// chips : il mène déjà, le serveur refuserait sa mise (SELF_OVERBID) comme sa
// passe (LEADER_CANNOT_PASS).
export default function BidButtons({
  currentBid, myMax, bankroll, canAct, hasPassed, iLead, closed, deckFull,
  opening, othersOpening, openerName, minBid, hasJoker, jokerBusy, jokerError,
  pauseRemaining, pauseWindowMs, onBid, onPass, onJoker,
}: {
  currentBid: number
  myMax: number
  bankroll: number
  canAct: boolean
  hasPassed: boolean
  iLead: boolean
  closed: boolean
  deckFull: boolean
  opening: boolean
  othersOpening: boolean
  openerName: string
  minBid: number
  hasJoker: boolean
  // Veto en cours d'appel : le bouton se ferme, le joker n'est pas répétable.
  jokerBusy: boolean
  // Motif d'un veto refusé par le serveur (JOKER_TOO_LATE, NOT_FORCED_BIDDER,
  // JOKER_ALREADY_USED), déjà traduit par l'appelant.
  jokerError: string | null
  pauseRemaining: number
  pauseWindowMs: number
  onBid: (amount: number) => void
  onPass: () => void
  onJoker: () => void
}) {
  const { t } = useT()
  const aide = opening ? t('auction.yourOpening')
    : deckFull ? t('auction.deckFull')
    : othersOpening ? t('auction.othersOpening', { name: openerName })
    : closed ? t('auction.closed')
    : iLead ? t('auction.waitYouLead')
    : hasPassed ? t('auction.passed')
    : canAct ? t('auction.yourTurn')
    : t('auction.closed')
  // Barre de progression de la temporisation : plein au début, vide à l'ouverture.
  const chrono = pauseWindowMs > 0
    ? Math.max(0, Math.min(100, (pauseRemaining / pauseWindowMs) * 100))
    : 0

  return (
    <div className="bid-zone">
      <p className="bid-help">
        <span>{aide}</span>
        <span>
          {t('auction.bankLabel')}{' '}
          {/* key = valeur : rejoue `slam` quand la bankroll change */}
          <strong key={bankroll}>{bankroll} €</strong>
          {' · '}{t('auction.maxInline', { n: myMax })}
        </span>
      </p>
      {opening ? (
        <div className="opening">
          <p className="opening-line">
            {hasJoker
              ? t('auction.openingLine', { n: minBid })
              : t('auction.openingLineUsed', { n: minBid })}
          </p>
          {/* joker consommé : l'option disparaît, pas de bouton désactivé */}
          {hasJoker && (
            <button className="joker" onClick={onJoker} disabled={jokerBusy}>
              {t('auction.jokerButton')}
            </button>
          )}
          <div className="opening-chrono">
            <span className="oc-track"><i style={{ width: `${chrono}%` }} /></span>
            <span className="oc-label">
              {t('auction.openingIn')} <strong>{formatMs(pauseRemaining)}</strong>
            </span>
          </div>
          <p className="opening-hint">
            {hasJoker ? t('auction.jokerHint') : t('auction.jokerHintUsed')}
          </p>
        </div>
      ) : (
        <>
          <div className="bid-buttons">
            {config.game.ui.increments.map(inc => {
              const amount = currentBid + inc
              return (
                <button key={inc} className="chip" onClick={() => onBid(amount)}
                  disabled={!canAct || amount > myMax}>
                  +{inc}
                </button>
              )
            })}
            <button className="chip max" onClick={() => onBid(myMax)}
              disabled={!canAct || myMax <= currentBid}>
              {t('auction.max', { n: myMax })}
            </button>
          </div>
          <button className="pass" onClick={onPass} disabled={!canAct}>
            {hasPassed ? t('auction.passed') : t('auction.pass')}
          </button>
        </>
      )}
      {/* Hors du ternaire à dessein : le motif le plus probable est JOKER_TOO_LATE,
          et le bloc d'ouverture disparaît justement au moment où le serveur le
          lève. Dans le ternaire, le message aurait clignoté puis disparu. */}
      {jokerError && <p className="error">{jokerError}</p>}
    </div>
  )
}
