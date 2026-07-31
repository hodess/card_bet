import config from '../config.json'

const A = config.ui.auction

// Séquence locale d'une carte. `bid` n'a pas de durée propre : elle s'arrête
// quand le compte à rebours serveur expire, pas sur un timer client.
export type Phase = 'reveal' | 'bid' | 'sold' | 'fly' | 'landed'

// Rectangle mesuré, réduit à ce dont on a besoin : DOMRect n'est pas
// instanciable en test et on ne veut pas dépendre du DOM ici.
export type Box = { left: number; top: number; width: number; height: number }

export type PipState = 'won' | 'current' | 'todo'

// Durée de vie des animations « one-shot » (bulle +X €, −X €).
export const FLOAT_MS = A.floatMs

// Durée totale de la séquence d'adjudication, du tampon « Adjugé » à la carte
// suivante posée. Le serveur applique exactement ce sursis avant de démarrer
// l'enchère suivante (migration `v1_3_reveal_grace`) : sans lui, le compte à
// rebours de la carte suivante s'écoulait pendant l'animation. Les deux valeurs
// doivent rester égales — un test verrouille celle-ci.
export const SEQUENCE_MS = A.soldMs + A.flyMs + A.landedMs + A.revealMs

// Vérité serveur d'une adjudication : la ligne `player_cards` de la carte.
// Le client ne devine jamais le gagnant. Une mise acceptée juste avant la
// clôture peut ne jamais lui parvenir (`useGame` ne lit que la dernière
// enchère) : il ferait alors voler la carte vers le mauvais deck.
export type Vente = { winnerId: string; amount: number }

export function venteDe(
  ownedCards: { card_id: number; player_id: string; price_paid: number }[],
  cardId: number,
): Vente | null {
  const ligne = ownedCards.find(c => c.card_id === cardId)
  return ligne ? { winnerId: ligne.player_id, amount: ligne.price_paid } : null
}

const DURATIONS: Record<Phase, number> = {
  reveal: A.revealMs,
  bid: 0,
  sold: A.soldMs,
  fly: A.flyMs,
  landed: A.landedMs,
}

export function nextPhase(phase: Phase): Phase {
  switch (phase) {
    case 'reveal': return 'bid'
    case 'bid': return 'sold'
    case 'sold': return 'fly'
    case 'fly': return 'landed'
    case 'landed': return 'reveal'
  }
}

export function phaseDuration(phase: Phase): number {
  return DURATIONS[phase]
}

export function isUrgent(remaining: number): boolean {
  return remaining > 0 && remaining < A.urgentMs
}

export function showPips(total: number): boolean {
  return total <= A.maxPips
}

// seq est 1-based (close_auction fait max(seq) + 1 depuis 0) et chaque enchère
// close attribue toujours une carte : les seq précédents sont donc gagnés.
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
