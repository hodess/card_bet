import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { AuctionWithCard, OwnedCard } from './useGame'
import type { CardData } from '../components/Card'
import {
  canFly, FLOAT_MS, flyTransform, phaseDuration, venteDe, type Box, type Phase,
} from '../lib/auctionPhase'

// Carte gelée le temps de la séquence d'adjudication : `useGame` recharge tout à
// chaque événement realtime, donc la ligne player_cards (et même l'enchère
// suivante) peut arriver avant la fin du vol. On continue d'afficher celle-ci.
// `leaderPredit`/`misePredite` ne servent qu'à l'affichage entre le tampon
// « Adjugé » et la confirmation serveur : le gagnant, lui, vient de player_cards.
type Sortante = {
  auctionId: string
  cardId: number
  card: CardData
  leaderPredit: string
  misePredite: number
}

export type AuctionPhase = {
  phase: Phase
  card: CardData | null
  leaderId: string | null
  bid: number
  raise: number | null
  flyStyle: string | null
  justWon: { playerId: string; amount: number } | null
  pendingWinnerId: string | null
  // Vrai tant qu'une adjudication est en cours d'animation : GamePage s'en sert
  // pour retenir la bascule vers l'écran de résultats en fin de partie.
  sequenceEnCours: boolean
  cardRef: RefObject<HTMLDivElement | null>
  setDeckRef: (playerId: string, el: HTMLDivElement | null) => void
  startSold: () => void
}

function boxOf(el: HTMLElement | null | undefined): Box | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

// Clé d'adjudication : l'id seul ne suffit pas. `place_bid` ne vérifie aucune
// expiration côté serveur, donc une mise acceptée juste après l'expiration
// locale relance la même enchère — `last_bid_at` change alors, et l'enchère
// redevient légitimement adjugeable.
function cleAdjuge(a: AuctionWithCard): string {
  return `${a.id}:${a.last_bid_at}`
}

export function useAuctionPhase(
  auction: AuctionWithCard | null,
  ownedCards: OwnedCard[],
): AuctionPhase {
  const [phase, setPhase] = useState<Phase>('bid')
  const [sortante, setSortante] = useState<Sortante | null>(null)
  const [flyStyle, setFlyStyle] = useState<string | null>(null)
  const [justWon, setJustWon] = useState<{ playerId: string; amount: number } | null>(null)
  const [raise, setRaise] = useState<number | null>(null)

  const cardRef = useRef<HTMLDivElement | null>(null)
  const deckRefs = useRef(new Map<string, HTMLDivElement>())
  // Dernière enchère vue. On garde la ligne entière, pas seulement son id :
  // c'est elle qui fournit carte, gagnant et montant quand le serveur a adjugé
  // sans que le compte à rebours local expire.
  const precedente = useRef<AuctionWithCard | null>(null)
  const prevBid = useRef<number>(auction?.current_bid ?? 0)
  // Dernière enchère déjà adjugée : la clôture serveur peut échouer et laisser
  // `expired` vrai, l'appelant rappellerait alors startSold en boucle.
  const dernierAdjuge = useRef<string | null>(null)

  // Adjudication telle que le serveur l'a écrite. Tant qu'elle n'est pas
  // arrivée, on affiche le tampon mais on ne fait pas décoller la carte : sa
  // destination ne serait qu'une supposition.
  const vente = useMemo(
    () => (sortante ? venteDe(ownedCards, sortante.cardId) : null),
    [ownedCards, sortante],
  )
  // Dépendances d'effet en valeurs primitives : `ownedCards` est un tableau neuf
  // à chaque événement temps réel et relancerait les timers de la séquence.
  const gagnantId = vente?.winnerId ?? null
  const montant = vente?.amount ?? null

  const setDeckRef = useCallback((playerId: string, el: HTMLDivElement | null) => {
    if (el) deckRefs.current.set(playerId, el)
    else deckRefs.current.delete(playerId)
  }, [])

  // Gèle la carte et lance la séquence. Ne dépend que de setState et de refs :
  // identité stable, donc utilisable dans les dépendances d'un effet.
  const demarrerSold = useCallback((a: AuctionWithCard) => {
    dernierAdjuge.current = cleAdjuge(a)
    setSortante({
      auctionId: a.id,
      cardId: a.card_id,
      card: a.card,
      leaderPredit: a.current_bidder,
      misePredite: a.current_bid,
    })
    setPhase('sold')
  }, [])

  // Déclencheur avancé, appelé par Auction quand le compte à rebours expire ou
  // quand la partie passe à `finished`. Le serveur peut avoir adjugé avant :
  // la garde `dernierAdjuge` empêche de jouer deux fois la même adjudication.
  const startSold = useCallback(() => {
    if (!auction || sortante || dernierAdjuge.current === cleAdjuge(auction)) return
    demarrerSold(auction)
  }, [auction, sortante, demarrerSold])

  // Fausse alerte : le compte à rebours local avait expiré, mais le serveur a
  // accepté une mise de plus (horloges décalées). L'enchère continue.
  useEffect(() => {
    if (!auction || !sortante || gagnantId) return
    if (sortante.auctionId !== auction.id || dernierAdjuge.current === cleAdjuge(auction)) return
    setSortante(null)
    setPhase('bid')
  }, [auction, sortante, gagnantId])

  // sold → fly : on attend le gagnant confirmé (c'est la cible du vol), puis on
  // mesure au dernier moment, la mise en page est stabilisée.
  useEffect(() => {
    if (phase !== 'sold' || !gagnantId) return
    const id = setTimeout(() => {
      const carte = boxOf(cardRef.current)
      const cible = boxOf(deckRefs.current.get(gagnantId))
      setFlyStyle(carte && cible && canFly(cible, window.innerHeight)
        ? flyTransform(carte, cible)
        : null)
      setPhase('fly')
    }, phaseDuration('sold'))
    return () => clearTimeout(id)
  }, [phase, gagnantId])

  // fly → landed : le deck du gagnant se met à jour maintenant, pas avant
  useEffect(() => {
    if (phase !== 'fly') return
    const id = setTimeout(() => {
      if (gagnantId && montant !== null) setJustWon({ playerId: gagnantId, amount: montant })
      setPhase('landed')
    }, phaseDuration('fly'))
    return () => clearTimeout(id)
  }, [phase, gagnantId, montant])

  // landed → carte suivante. Si l'enchère suivante est déjà arrivée, on enchaîne
  // sur son animation d'entrée. Sinon on reste en `landed` : la carte y est à
  // `opacity: 0`, alors que repasser en `bid` ferait réapparaître la carte
  // vendue en pleine taille en attendant. `sortante` repasse à `null`, ce qui
  // signale la fin de séquence à l'appelant.
  useEffect(() => {
    if (phase !== 'landed') return
    const id = setTimeout(() => {
      setJustWon(null)
      setFlyStyle(null)
      setPhase(sortante && precedente.current?.id !== sortante.auctionId ? 'reveal' : 'landed')
      setSortante(null)
    }, phaseDuration('landed'))
    return () => clearTimeout(id)
  }, [phase, sortante])

  // reveal → bid
  useEffect(() => {
    if (phase !== 'reveal') return
    const id = setTimeout(() => setPhase('bid'), phaseDuration('reveal'))
    return () => clearTimeout(id)
  }, [phase])

  // Changement d'enchère côté serveur : c'est notre source de vérité.
  useEffect(() => {
    if (!auction) return
    const avant = precedente.current
    // Toujours la dernière version vue de la ligne : une surenchère met à jour
    // l'enchère en place, et c'est cette version-là dont l'adjudication
    // rétroactive a besoin (bonne carte, bonne clé).
    precedente.current = auction
    if (avant?.id === auction.id) return
    const premier = avant === null
    prevBid.current = auction.current_bid
    // Séquence en cours : `close_auction` ouvre l'enchère suivante dans la même
    // transaction que l'adjudication, la nouvelle carte arrive donc pendant
    // `sold`. C'est l'effet `landed` qui enchaînera sur `reveal`, pas nous —
    // sinon on avorte le vol et la carte sortante reste figée.
    if (sortante) return
    // Reprise d'une partie en cours de route : aucune animation. Seule la toute
    // première carte d'une partie (seq 1) mérite son animation d'entrée.
    if (premier) {
      if (auction.seq === 1) setPhase('reveal')
      return
    }
    // Le serveur a pu adjuger sans que le compte à rebours local expire (plus
    // aucun challenger). On joue alors la séquence rétroactivement, avec la
    // carte précédente — son gagnant, lui, vient de player_cards.
    if (avant && dernierAdjuge.current !== cleAdjuge(avant)) {
      demarrerSold(avant)
      return
    }
    setPhase('reveal')
  }, [auction, sortante, demarrerSold])

  // Surenchère : bulle +X €. Un delta négatif ou nul signifie « nouvelle carte »
  // (la mise repart au minimum), pas une surenchère.
  // Dépendances volontairement resserrées sur l'id et le montant : `auction`
  // est un objet neuf à chaque événement temps réel, et un simple « un joueur
  // a passé » relancerait cet effet, annulant le timer d'effacement sans le
  // réarmer — la bulle resterait collée à l'écran.
  useEffect(() => {
    if (!auction) { setRaise(null); return }
    const delta = auction.current_bid - prevBid.current
    prevBid.current = auction.current_bid
    // Pas de surenchère (nouvelle carte, ou événement temps réel sans mise) :
    // on efface la bulle au lieu de laisser un timer annulé la figer à l'écran.
    if (delta <= 0) { setRaise(null); return }
    setRaise(delta)
    const id = setTimeout(() => setRaise(null), FLOAT_MS)
    return () => clearTimeout(id)
  }, [auction?.id, auction?.current_bid])

  // Pendant sold et fly, la carte n'est pas encore « posée » dans le deck affiché.
  const avantAtterrissage = phase === 'sold' || phase === 'fly'
  return {
    phase,
    card: sortante?.card ?? auction?.card ?? null,
    leaderId: phase === 'reveal' ? null
      : (gagnantId ?? sortante?.leaderPredit ?? auction?.current_bidder ?? null),
    bid: montant ?? sortante?.misePredite ?? auction?.current_bid ?? 0,
    raise: phase === 'bid' ? raise : null,
    flyStyle: phase === 'fly' ? flyStyle : null,
    justWon,
    pendingWinnerId: avantAtterrissage ? gagnantId : null,
    sequenceEnCours: sortante !== null,
    cardRef,
    setDeckRef,
    startSold,
  }
}
