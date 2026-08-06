import { cardsOf } from './game'

// Couleurs de joueur en partie : attribuées par siège (jamais par pseudo) pour
// rester stables du début à la fin. avatarHue() garde son rôle hors partie.
const PLAYER_COLORS = [
  '#46b1ff', '#ff7a6b', '#7ee0a8', '#c89bff',
  '#ffc861', '#5fd8d8', '#ff9ad2', '#9fb0ff',
]

export function playerColor(seat: number): string {
  return PLAYER_COLORS[seat % PLAYER_COLORS.length]
}

export type SeatRow = {
  id: string
  nickname: string
  seat: number
  bankroll: number
  filled: number
  total: number
  status: 'leading' | 'wins' | 'passed' | null
  popIndex: number | null
  paid: number | null
  // Joker encore en poche ? L'information est publique : quand un joker part,
  // toute la table voit la carte être défaussée.
  jokerUsed: boolean
  // Ce siège est celui que le serveur a désigné pour l'ouverture forcée.
  opens: boolean
}

export type SeatInput = {
  players: { id: string; nickname: string; bankroll: number; seat: number; joker_used: boolean }[]
  ownedCards: { player_id: string }[]
  deckSize: number
  leaderId: string | null
  passedIds: string[]
  // Carte adjugée dont l'animation n'est pas terminée : on ne la montre pas
  // encore dans le deck, même si player_cards est déjà arrivé.
  pendingWinnerId: string | null
  justWon: { playerId: string; amount: number } | null
  // Ouvreur désigné, pendant la temporisation seulement (null le reste du temps).
  openerId: string | null
}

export function seatRows(input: SeatInput): SeatRow[] {
  const { players, ownedCards, deckSize, leaderId, passedIds, pendingWinnerId, justWon, openerId } = input
  return players.map(p => {
    const owned = cardsOf(ownedCards, p.id).length
    const filled = Math.max(0, owned - (pendingWinnerId === p.id ? 1 : 0))
    const gagne = justWon?.playerId === p.id
    return {
      id: p.id,
      nickname: p.nickname,
      seat: p.seat,
      bankroll: p.bankroll,
      filled,
      total: deckSize,
      status: gagne ? 'wins'
        : p.id === leaderId ? 'leading'
        : passedIds.includes(p.id) ? 'passed'
        : null,
      popIndex: gagne ? filled - 1 : null,
      paid: gagne ? justWon.amount : null,
      jokerUsed: p.joker_used,
      opens: p.id === openerId,
    }
  })
}
