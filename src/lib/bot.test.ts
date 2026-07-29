import { describe, expect, it } from 'vitest'
import { decideBid, type BotView } from './bot'

const base: BotView = {
  botPlayerId: 'bot',
  currentBidder: 'adversaire',
  currentBid: 100,
  bankroll: 1000,
  slotsMissing: 3,
  minBid: 10,
}
const seq = (...vals: number[]) => { let i = 0; return () => vals[i++] ?? 0 }

describe('decideBid', () => {
  it('ne surenchérit jamais sur lui-même', () => {
    expect(decideBid({ ...base, currentBidder: 'bot' }, seq(0, 0))).toBeNull()
  })
  it('ne mise plus quand son deck est plein', () => {
    expect(decideBid({ ...base, slotsMissing: 0 }, seq(0, 0))).toBeNull()
  })
  it('laisse filer quand le tirage dépasse bidProbability (0,6)', () => {
    expect(decideBid(base, seq(0.9))).toBeNull()
  })
  it('mise +10 si rng < 0,5, +50 entre 0,5 et 0,8, +100 au-delà', () => {
    expect(decideBid(base, seq(0, 0.4))).toBe(110)
    expect(decideBid(base, seq(0, 0.6))).toBe(150)
    expect(decideBid(base, seq(0, 0.9))).toBe(200)
  })
  it('respecte la règle de réserve : replie sur +10, sinon null', () => {
    expect(decideBid({ ...base, currentBid: 950 }, seq(0, 0.9))).toBe(960)
    expect(decideBid({ ...base, currentBid: 975 }, seq(0, 0.4))).toBeNull()
  })
})
