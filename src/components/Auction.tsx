import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import type { GameState } from '../hooks/useGame'
import { useServerOffset } from '../hooks/useServerOffset'
import { useCountdown } from '../hooks/useCountdown'
import { useAuctionPhase } from '../hooks/useAuctionPhase'
import { isSettled, isUrgent, pauseRemaining } from '../lib/auctionPhase'
import { maxBid, cardsOf } from '../lib/game'
import { playerColor, seatRows } from '../lib/players'
import { seatOrder } from '../lib/table'
import config from '../config.json'
import AuctionHeader from './AuctionHeader'
import LeaderBanner from './LeaderBanner'
import CardScene from './CardScene'
import CardCount from './CardCount'
import BidButtons from './BidButtons'
import PlayerSeats from './PlayerSeats'
import { useT } from '../hooks/useT'

export default function Auction({ state, onSequenceChange }: {
  state: GameState
  onSequenceChange?: (enCours: boolean) => void
}) {
  const { game, players, auction, previousAuction, ownedCards, myPlayerId } = state
  const { t } = useT()
  const gameId = game!.id
  const closeMs = game!.close_delay_seconds * 1000
  const capMs = game!.max_auction_seconds * 1000
  const offset = useServerOffset()
  // Le joker est la seule action irréversible et non répétable du jeu : ni son
  // refus ni son double appel ne peuvent rester silencieux. `jokerEnVol` ferme la
  // porte pendant l'appel, `jokerErreur` porte le motif à l'écran.
  const [jokerErreur, setJokerErreur] = useState<string | null>(null)
  const [jokerEnVol, setJokerEnVol] = useState(false)
  const delayDeadline = auction ? new Date(auction.last_bid_at).getTime() + closeMs : null
  const capDeadline = auction ? new Date(auction.opened_at).getTime() + capMs : null
  const deadline = delayDeadline !== null && capDeadline !== null ? Math.min(delayDeadline, capDeadline) : null
  const windowMs = capDeadline !== null && deadline === capDeadline ? capMs : closeMs
  // La temporisation ouvre l'enchère avec `last_bid_at` dans le futur (il vaut
  // `opened_at`) : au début de la pause, `deadline − now` atteint donc deux fois le
  // délai de la partie — 16 s pour une fenêtre de 8 s, au réglage par défaut. D'où
  // le clamp à `windowMs` plus bas : pendant l'animation d'adjudication et l'entrée
  // de la carte, il montre un chrono plein et à l'arrêt, au lieu d'un compte à
  // rebours plus long que la fenêtre qu'il est censé représenter.
  const restant = useCountdown(deadline, offset)

  const anim = useAuctionPhase(auction, previousAuction, ownedCards, offset)

  // Pendant la temporisation, le compte à rebours affiché est celui de la pause :
  // même durée (le délai d'adjudication de la partie), mais il mesure le temps
  // qu'il reste pour vetoer, pas pour surenchérir.
  const pauseRestant = auction
    ? pauseRemaining(new Date(auction.opened_at).getTime(), Date.now() + offset)
    : 0
  const enPause = anim.phase === 'pause'
  const remaining = enPause ? pauseRestant : Math.min(restant, windowMs)
  const expired = !enPause && remaining <= 0

  // Valeur affichée, distincte de `remaining` : pendant la défausse la carte est
  // hors jeu, il n'y a plus rien à attendre, mais `remaining` doit rester intact
  // pour `expired` — sinon on adjugerait la carte suivante que la défausse vient
  // d'ouvrir. Calculée ici et non dans les deux composants qui l'affichent : une
  // seule vérité.
  const remainingAffiche = anim.phase === 'discarded' ? 0 : remaining

  // Calculée ici et non dans les deux composants qui l'affichent : une seule vérité.
  const urgent = anim.phase === 'bid' && isUrgent(remaining)

  const me = players.find(p => p.id === myPlayerId)
  const missing = game!.deck_size - cardsOf(ownedCards, myPlayerId).length
  const iLead = auction?.current_bidder === myPlayerId
  const iPassed = !!(myPlayerId && auction?.passed.includes(myPlayerId))
  const myMax = me ? maxBid(me.bankroll, missing, game!.min_bid) : 0
  const closed = isSettled(anim.phase)
  // J'ouvre cette carte : le serveur m'a désigné et l'enchère n'a pas démarré.
  // C'est la seule fenêtre où le veto est accepté (JOKER_TOO_LATE ensuite).
  const jOuvre = enPause && auction?.forced_bidder === myPlayerId
  // Adjudication, entrée de la carte, temporisation : le serveur refuse toute
  // action tant que l'enchère n'a pas démarré (AUCTION_NOT_STARTED), l'interface aussi.
  const cantAct = iLead || iPassed || missing <= 0 || expired || closed
    || anim.phase === 'reveal' || enPause

  // Fin du compte à rebours, ou partie terminée par le serveur : on lance la
  // séquence d'adjudication et on demande la clôture (le serveur reste l'arbitre).
  // startSold est appelé ici, dans le corps de l'effet, et jamais dans le callback
  // de l'intervalle : une closure de longue vie relancerait une séquence en cours.
  useEffect(() => {
    if (!auction) return
    if (expired || game!.status === 'finished') anim.startSold()
    if (!expired) return
    const tryClose = () => { void supabase.rpc('close_auction', { g_id: gameId }).then(null, () => {}) }
    tryClose()
    const id = setInterval(tryClose, 1000)
    return () => clearInterval(id)
  }, [auction, expired, gameId, game, anim.startSold])

  // Fin de la temporisation : on demande la clôture une fois, sans attendre notre
  // propre compte à rebours. Le serveur tranche avec `has_challenger` — sans cet
  // appel, une carte que personne ne peut ou ne veut suivre resterait affichée un
  // délai entier, et la fin de partie en solo prendrait deux fois le temps prévu.
  // Dépendances volontairement resserrées sur `auction?.id` : `auction` est un
  // objet neuf à chaque événement temps réel, et le mettre en dépendance
  // rejouerait cet effet à chaque mise, chaque passe et chaque changement de
  // bankroll d'un autre joueur.
  useEffect(() => {
    if (!auction || enPause) return
    void supabase.rpc('close_auction', { g_id: gameId }).then(null, () => {})
  }, [auction?.id, enPause, gameId])

  // Carte suivante : le motif du veto refusé ne concerne plus rien à l'écran, et la
  // garde anti-double-clic n'a plus de raison de rester armée pour cette carte-ci.
  useEffect(() => { setJokerErreur(null); setJokerEnVol(false) }, [auction?.id])

  // Remonté à GamePage, qui retient l'écran de résultats le temps que
  // l'adjudication de la dernière carte finisse de s'animer.
  useEffect(() => {
    onSequenceChange?.(anim.sequenceEnCours)
  }, [anim.sequenceEnCours, onSequenceChange])

  // erreurs volontairement silencieuses : races normales du temps réel
  async function bid(amount: number) {
    const { error } = await supabase.rpc('place_bid', { g_id: gameId, amount })
    if (error) console.warn(error.message)
  }

  async function pass() {
    const { error } = await supabase.rpc('pass_auction', { g_id: gameId })
    if (error) console.warn(error.message)
  }

  // Le joker échappe à l'exception « races normales d'enchère » : un veto avalé
  // laisse le joueur croire qu'il a défaussé pendant que la carte s'ouvre à son nom.
  async function joker() {
    if (jokerEnVol) return
    setJokerEnVol(true)
    setJokerErreur(null)
    const { error } = await supabase.rpc('use_joker', { g_id: gameId })
    if (error) setJokerErreur(errorMessage(error))
    setJokerEnVol(false)
  }

  if (!auction || !anim.card) return <p className="center">{t('auction.preparing')}</p>

  const leader = players.find(p => p.id === anim.leaderId)
  const defausse = anim.phase === 'discarded'
  const neutre = anim.phase === 'reveal' || defausse || !leader
  const couleur = neutre ? 'var(--muted)' : playerColor(leader.seat)
  // L'anneau ne mesure pas toujours une enchère : or pendant une décision
  // d'ouverture, gris quand la carte sort, couleur du meneur sinon.
  const ringTone = enPause ? 'accent' : defausse ? 'muted' : 'player'
  const surTitre = anim.phase === 'reveal' ? t('auction.cardLabel')
    : defausse || enPause ? t('auction.forcedOpening')
    : closed ? t('auction.soldTo')
    : leader?.id === myPlayerId ? t('auction.youLead')
    : t('auction.chipLeading')
  const nomBandeau = defausse ? t('auction.discarded')
    : anim.phase === 'reveal' ? t('auction.newCard')
    : enPause
      ? (jOuvre ? t('auction.yourOpening') : t('auction.othersOpening', { name: leader?.nickname ?? t('auction.newCard') }))
      : leader?.nickname ?? t('auction.newCard')
  const rows = seatRows({
    players, ownedCards, deckSize: game!.deck_size,
    leaderId: anim.leaderId, passedIds: auction.passed,
    pendingWinnerId: anim.pendingWinnerId, justWon: anim.justWon,
    // le ★ « Ouvre » n'a de sens que pendant la fenêtre de décision
    openerId: enPause ? auction.forced_bidder : null,
  })
  const sieges = seatOrder(rows, myPlayerId)
  // La géométrie des sièges est calculée sur cette même boîte (voir lib/table.ts) :
  // une seule source de vérité, côté config.
  const tableVars = {
    '--card-w': `${config.ui.auction.table.cardW}px`,
    '--card-ratio': `${config.ui.auction.table.cardW} / ${config.ui.auction.table.cardH}`,
    '--lane-top': `${config.ui.auction.table.laneTop}px`,
  } as CSSProperties

  return (
    <main className="page auction">
      <AuctionHeader
        won={ownedCards.length}
        total={game!.deck_size * players.length}
      />
      <div className="auction-table" style={tableVars}>
        <div className="table-plate">
          <CardScene
            card={anim.card}
            phase={anim.phase}
            remaining={remainingAffiche}
            windowMs={windowMs}
            color={couleur}
            ringTone={ringTone}
            urgent={urgent}
            flyStyle={anim.flyStyle}
            winnerName={leader?.nickname ?? ''}
            nextOpenerName={players.find(p => p.id === auction.forced_bidder)?.nickname ?? ''}
            amount={anim.bid}
            cardRef={anim.cardRef}
          />
          <PlayerSeats rows={sieges} myPlayerId={myPlayerId} onDeckRef={anim.setDeckRef} />
        </div>
      </div>
      <LeaderBanner
        color={couleur}
        overline={surTitre}
        name={nomBandeau}
        bid={defausse ? null : anim.bid}
        bidKey={`${auction.id}-${anim.bid}`}
        raise={anim.raise}
        neutral={neutre}
      />
      <CardCount phase={anim.phase} remaining={remainingAffiche} urgent={urgent} color={couleur} />
      <BidButtons
        currentBid={auction.current_bid}
        myMax={myMax}
        bankroll={me?.bankroll ?? 0}
        canAct={!cantAct}
        hasPassed={iPassed}
        iLead={iLead}
        closed={closed}
        deckFull={missing <= 0}
        opening={jOuvre}
        othersOpening={enPause && !jOuvre}
        openerName={leader?.nickname ?? ''}
        minBid={game!.min_bid}
        hasJoker={!me?.joker_used}
        jokerBusy={jokerEnVol}
        jokerError={jokerErreur}
        pauseRemaining={pauseRestant}
        pauseWindowMs={closeMs}
        onBid={bid}
        onPass={pass}
        onJoker={joker}
      />
    </main>
  )
}
