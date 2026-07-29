import { describe, expect, it } from 'vitest'
import { maxBid, formatMs } from './game'

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
