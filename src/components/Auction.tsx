import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { GameState } from '../hooks/useGame'
import { useServerOffset } from '../hooks/useServerOffset'
import { useCountdown } from '../hooks/useCountdown'
import { useAuctionPhase } from '../hooks/useAuctionPhase'
import { maxBid, cardsOf } from '../lib/game'
import { playerColor, stripRows } from '../lib/players'
import AuctionHeader from './AuctionHeader'
import LeaderBanner from './LeaderBanner'
import CardScene from './CardScene'
import BidButtons from './BidButtons'
import PlayersStrip from './PlayersStrip'
import { useT } from '../hooks/useT'

export default function Auction({ state, onSequenceChange }: {
  state: GameState
  onSequenceChange?: (enCours: boolean) => void
}) {
  const { game, players, auction, ownedCards, myPlayerId } = state
  const { t } = useT()
  const gameId = game!.id
  const closeMs = game!.close_delay_seconds * 1000
  const capMs = game!.max_auction_seconds * 1000
  const offset = useServerOffset()
  const delayDeadline = auction ? new Date(auction.last_bid_at).getTime() + closeMs : null
  const capDeadline = auction ? new Date(auction.opened_at).getTime() + capMs : null
  const deadline = delayDeadline !== null && capDeadline !== null ? Math.min(delayDeadline, capDeadline) : null
  const windowMs = capDeadline !== null && deadline === capDeadline ? capMs : closeMs
  // Sursis de révélation : le serveur ouvre l'enchère suivante avec une échéance
  // décalée d'une séquence d'adjudication entière. On borne l'affichage à la
  // fenêtre pour montrer un chrono plein et à l'arrêt pendant l'animation,
  // plutôt qu'un compte à rebours de 6 s sur une fenêtre de 3 s.
  const restant = useCountdown(deadline, offset)
  const remaining = Math.min(restant, windowMs)
  const expired = remaining <= 0

  const anim = useAuctionPhase(auction, ownedCards)

  const me = players.find(p => p.id === myPlayerId)
  const missing = game!.deck_size - cardsOf(ownedCards, myPlayerId).length
  const iLead = auction?.current_bidder === myPlayerId
  const iPassed = !!(myPlayerId && auction?.passed.includes(myPlayerId))
  const myMax = me ? maxBid(me.bankroll, missing, game!.min_bid) : 0
  const closed = anim.phase === 'sold' || anim.phase === 'fly' || anim.phase === 'landed'
  // Adjudication puis entrée de la carte : le serveur refuse toute action tant
  // que l'enchère n'a pas démarré (AUCTION_NOT_STARTED), l'interface aussi.
  const cantAct = iLead || iPassed || missing <= 0 || expired || closed || anim.phase === 'reveal'

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

  if (!auction || !anim.card) return <p className="center">{t('auction.preparing')}</p>

  const leader = players.find(p => p.id === anim.leaderId)
  const neutre = anim.phase === 'reveal' || !leader
  const couleur = neutre ? 'var(--muted)' : playerColor(leader.seat)
  const surTitre = anim.phase === 'reveal' ? t('auction.cardLabel')
    : closed ? t('auction.soldTo')
    : leader?.id === myPlayerId ? t('auction.youLead')
    : t('auction.chipLeading')
  const rows = stripRows({
    players, ownedCards, deckSize: game!.deck_size,
    leaderId: anim.leaderId, passedIds: auction.passed,
    pendingWinnerId: anim.pendingWinnerId, justWon: anim.justWon,
  })

  return (
    <main className="page auction">
      <AuctionHeader
        seq={auction.seq}
        total={game!.deck_size * players.length}
        bankroll={me?.bankroll ?? 0}
      />
      <LeaderBanner
        color={couleur}
        overline={surTitre}
        name={neutre ? t('auction.newCard') : leader.nickname}
        bid={anim.bid}
        bidKey={`${auction.id}-${anim.bid}`}
        raise={anim.raise}
        neutral={neutre}
      />
      <CardScene
        card={anim.card}
        phase={anim.phase}
        remaining={remaining}
        windowMs={windowMs}
        color={couleur}
        flyStyle={anim.flyStyle}
        winnerName={leader?.nickname ?? ''}
        amount={anim.bid}
        cardRef={anim.cardRef}
      />
      <BidButtons
        currentBid={auction.current_bid}
        myMax={myMax}
        canAct={!cantAct}
        hasPassed={iPassed}
        iLead={iLead}
        closed={closed}
        deckFull={missing <= 0}
        onBid={bid}
        onPass={pass}
      />
      <PlayersStrip rows={rows} onDeckRef={anim.setDeckRef} />
    </main>
  )
}
