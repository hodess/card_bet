export function maxBid(bankroll: number, slotsMissing: number, minBid: number): number {
  return bankroll - (slotsMissing - 1) * minBid
}

export function formatMs(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(1)
}
