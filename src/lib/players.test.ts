import { describe, expect, it } from 'vitest'
import { playerColor, seatRows } from './players'

describe('playerColor', () => {
  it('donne une couleur stable pour un siège donné', () => {
    expect(playerColor(0)).toBe(playerColor(0))
    expect(playerColor(0)).toMatch(/^#[0-9a-f]{6}$/)
  })
  it('distingue les 8 premiers sièges', () => {
    const couleurs = Array.from({ length: 8 }, (_, seat) => playerColor(seat))
    expect(new Set(couleurs).size).toBe(8)
  })
  it('reboucle au-delà de la palette au lieu de rendre undefined', () => {
    expect(playerColor(8)).toBe(playerColor(0))
    expect(playerColor(9)).toBe(playerColor(1))
  })
})

const joueurs = [
  { id: 'a', nickname: 'Alice', bankroll: 800, seat: 0 },
  { id: 'b', nickname: 'Bob', bankroll: 950, seat: 1 },
]
const base = {
  players: joueurs,
  ownedCards: [{ player_id: 'a' }],
  deckSize: 3,
  leaderId: 'b',
  passedIds: [] as string[],
  pendingWinnerId: null,
  justWon: null,
}

describe('seatRows', () => {
  it('compte les slots remplis et marque le meneur', () => {
    const [alice, bob] = seatRows(base)
    expect(alice.filled).toBe(1)
    expect(alice.status).toBe(null)
    expect(bob.filled).toBe(0)
    expect(bob.status).toBe('leading')
    expect(bob.total).toBe(3)
  })

  it("cache la carte adjugée tant qu'elle n'a pas atterri", () => {
    // player_cards est déjà arrivé côté realtime, mais la carte vole encore
    const [alice] = seatRows({
      ...base, ownedCards: [{ player_id: 'a' }, { player_id: 'a' }], pendingWinnerId: 'a',
    })
    expect(alice.filled).toBe(1)
    expect(alice.popIndex).toBe(null)
  })

  it("à l'atterrissage : slot qui pope, coût payé et statut gagne", () => {
    const [alice] = seatRows({
      ...base,
      ownedCards: [{ player_id: 'a' }, { player_id: 'a' }],
      pendingWinnerId: null,
      justWon: { playerId: 'a', amount: 210 },
    })
    expect(alice.filled).toBe(2)
    expect(alice.popIndex).toBe(1)
    expect(alice.paid).toBe(210)
    expect(alice.status).toBe('wins')
  })

  it('le statut gagne prime sur mène pour le même joueur', () => {
    const [, bob] = seatRows({ ...base, justWon: { playerId: 'b', amount: 100 } })
    expect(bob.status).toBe('wins')
  })

  it('marque les joueurs qui ont passé', () => {
    const [alice] = seatRows({ ...base, passedIds: ['a'] })
    expect(alice.status).toBe('passed')
  })

  it('ne descend jamais sous zéro slot rempli', () => {
    const [, bob] = seatRows({ ...base, pendingWinnerId: 'b' })
    expect(bob.filled).toBe(0)
  })
})
