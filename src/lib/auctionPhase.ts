import config from '../config.json'

const A = config.ui.auction

// Séquence locale d'une carte. `bid` n'a pas de durée propre : elle s'arrête
// quand le compte à rebours serveur expire, pas sur un timer client. `pause` non
// plus : elle finit quand `opened_at` est atteint — c'est le serveur qui décide.
export type Phase = 'reveal' | 'pause' | 'bid' | 'sold' | 'fly' | 'landed' | 'discarded'

// Rectangle mesuré, réduit à ce dont on a besoin : DOMRect n'est pas
// instanciable en test et on ne veut pas dépendre du DOM ici.
export type Box = { left: number; top: number; width: number; height: number }

export type PipState = 'won' | 'current' | 'todo'

// Durée de vie des animations « one-shot » (bulle +X €, −X €).
export const FLOAT_MS = A.floatMs

// Durée totale de la séquence d'adjudication, du tampon « Adjugé » à la carte
// suivante posée. Elle se déroule PENDANT la temporisation serveur : celle-ci doit
// donc la couvrir, sinon le compte à rebours de la carte suivante s'écoulerait
// pendant l'animation.
export const SEQUENCE_MS = A.soldMs + A.flyMs + A.landedMs + A.revealMs

// Ce qu'il doit rester à l'ouvreur pour décider de son joker, une fois l'animation
// finie. Sans ce paramètre, la seule contrainte sur le plancher du délai
// d'adjudication serait « l'animation tient », ce qui laissait zéro seconde de
// décision à l'humain quand les bots, eux, gardaient leur fenêtre entière.
export const MIN_JOKER_WINDOW_MS = A.minJokerWindowMs

// Défausse : le tampon « Joker » tombe, puis la carte sort de l'écran par le haut.
// Aucune constante nouvelle — les deux temps sont ceux de l'adjudication.
export const DISCARD_MS = A.soldMs + A.flyMs

// Vérité serveur d'une adjudication : la ligne `player_cards` de la carte.
// Le client ne devine jamais le gagnant. Une mise acceptée juste avant la
// clôture peut ne jamais lui parvenir : il ferait alors voler la carte vers le
// mauvais deck.
export type Vente = { winnerId: string; amount: number }

export function venteDe(
  ownedCards: { card_id: number; player_id: string; price_paid: number }[],
  cardId: number,
): Vente | null {
  const ligne = ownedCards.find(c => c.card_id === cardId)
  return ligne ? { winnerId: ligne.player_id, amount: ligne.price_paid } : null
}

// Sortie à jouer pour l'enchère qu'on quitte sans que le compte à rebours local ait
// expiré : la carte a été vendue (elle vole vers le deck de son acheteur) ou
// défaussée au joker (elle sort de l'écran, personne ne la reçoit).
//
// La vérité est `auctions.status`, écrit par le serveur. L'inférence « pas de ligne
// player_cards donc défausse » ne vaut pas : les deux écritures sont bien dans la
// même transaction, mais les lectures du client sont indépendantes (`useGame` tire
// quatre requêtes en parallèle, chacune dans son propre instantané), donc un
// chargement déjà en vol au moment du commit peut lire `auctions` après et
// `player_cards` avant. Le chemin est étroit mais chaud : c'est celui de toute
// clôture immédiate sans challenger, donc de chaque carte de fin de partie en solo.
//
// L'inférence ne reste qu'en repli, pour le cas où la ligne serveur lue n'est pas
// celle qu'on quitte — deux enchères ayant pu naître entre deux chargements.
export function sortieDe(
  quittee: { id: string; card_id: number },
  precedente: { id: string; status: string } | null,
  ownedCards: { card_id: number; player_id: string; price_paid: number }[],
): 'sold' | 'discarded' {
  if (precedente && precedente.id === quittee.id) {
    return precedente.status === 'discarded' ? 'discarded' : 'sold'
  }
  return venteDe(ownedCards, quittee.card_id) ? 'sold' : 'discarded'
}

const DURATIONS: Record<Phase, number> = {
  reveal: A.revealMs,
  pause: 0,
  bid: 0,
  sold: A.soldMs,
  fly: A.flyMs,
  landed: A.landedMs,
  discarded: DISCARD_MS,
}

export function nextPhase(phase: Phase): Phase {
  switch (phase) {
    case 'reveal': return 'pause'
    case 'pause': return 'bid'
    case 'bid': return 'sold'
    case 'sold': return 'fly'
    case 'fly': return 'landed'
    case 'landed': return 'reveal'
    case 'discarded': return 'reveal'
  }
}

export function phaseDuration(phase: Phase): number {
  return DURATIONS[phase]
}

export function isUrgent(remaining: number): boolean {
  return remaining > 0 && remaining < A.urgentMs
}

// Temps restant avant que l'enchère devienne vivante. C'est la fenêtre du joker :
// le serveur y refuse mise et passe (AUCTION_NOT_STARTED) et n'y accepte que le
// veto de l'ouvreur forcé.
export function pauseRemaining(openedAt: number, now: number): number {
  return Math.max(0, openedAt - now)
}

// L'enchère est close : soit la carte part chez son gagnant (tampon, vol,
// atterrissage), soit elle a été défaussée et sort de l'écran.
export function isSettled(phase: Phase): boolean {
  return phase === 'sold' || phase === 'fly' || phase === 'landed' || phase === 'discarded'
}

export function showPips(total: number): boolean {
  return total <= A.maxPips
}

// Position 1-based dans le total des cartes à gagner. Ce n'est PAS `auctions.seq` :
// une enchère close n'attribue plus forcément une carte depuis le joker, donc un
// `seq` peut avoir été consommé sans remplir aucun deck. L'appelant passe le rang
// compté en cartes adjugées (cf. `AuctionHeader`), et on borne ici pour qu'un rang
// hors plage ne rende pas un tableau incohérent.
export function pipStates(total: number, seq: number): PipState[] {
  const current = Math.min(Math.max(seq, 1), total)
  return Array.from({ length: total }, (_, i) =>
    i + 1 < current ? 'won' : i + 1 === current ? 'current' : 'todo')
}

export function flyTransform(card: Box, target: Box): string {
  const dx = Math.round(target.left + target.width / 2 - (card.left + card.width / 2))
  const dy = Math.round(target.top + target.height / 2 - (card.top + card.height / 2))
  return `translate(${dx}px, ${dy}px) scale(.09) rotate(8deg)`
}

// Une ligne joueur scrollée hors écran donnerait un vol vers le vide :
// dans ce cas l'appelant remplace le vol par un fondu.
export function canFly(target: Box | null, viewportHeight: number): boolean {
  if (!target || target.width <= 0) return false
  return target.top >= 0 && target.top <= viewportHeight
}
