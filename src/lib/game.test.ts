import { describe, expect, it } from 'vitest'
import { maxBid, formatMs, cardTier, cardsOf } from './game'

describe('maxBid (règle de réserve)', () => {
  it('réserve min_bid par slot manquant restant', () => {
    expect(maxBid(1000, 3, 10)).toBe(980)
  })
  it('dernier slot : toute la bankroll est misable', () => {
    expect(maxBid(500, 1, 10)).toBe(500)
  })
})

describe('formatMs', () => {
  it('affiche en secondes avec une décimale', () => {
    expect(formatMs(3900)).toBe('3.9')
  })
  it('ne descend pas sous zéro', () => {
    expect(formatMs(-200)).toBe('0.0')
  })
})

describe('cardTier', () => {
  it('or ≥ 88, argent 85–87, bronze < 85', () => {
    expect(cardTier(88)).toBe('gold')
    expect(cardTier(87)).toBe('silver')
    expect(cardTier(85)).toBe('silver')
    expect(cardTier(84)).toBe('bronze')
  })
})

describe('cardsOf', () => {
  const cards = [
    { player_id: 'a', card_id: 1 },
    { player_id: 'b', card_id: 2 },
    { player_id: 'a', card_id: 3 },
  ]
  it('filtre les cartes d\'un joueur', () => {
    expect(cardsOf(cards, 'a').map(c => c.card_id)).toEqual([1, 3])
  })
  it('renvoie vide pour un joueur inconnu ou null', () => {
    expect(cardsOf(cards, 'z')).toEqual([])
    expect(cardsOf(cards, null)).toEqual([])
  })
})
