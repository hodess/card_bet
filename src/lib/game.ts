export function maxBid(bankroll: number, slotsMissing: number, minBid: number): number {
  return bankroll - (slotsMissing - 1) * minBid
}

export function formatMs(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(1)
}

export function cardTier(rating: number): string {
  return rating >= 88 ? 'gold' : rating >= 85 ? 'silver' : 'bronze'
}

export function cardsOf<T extends { player_id: string }>(cards: T[], playerId: string | null): T[] {
  return cards.filter(c => c.player_id === playerId)
}
