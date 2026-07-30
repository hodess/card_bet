import config from '../config.json'
import { useT } from '../hooks/useT'

// Toute la zone d'action de l'enchère : incréments, Max, Je passe.
export default function BidButtons({ currentBid, myMax, canAct, hasPassed, onBid, onPass }: {
  currentBid: number
  myMax: number
  canAct: boolean
  hasPassed: boolean
  onBid: (amount: number) => void
  onPass: () => void
}) {
  const { t } = useT()
  return (
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
  )
}
