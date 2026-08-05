import config from '../config.json'

export function maxBid(bankroll: number, slotsMissing: number, minBid: number): number {
  return bankroll - (slotsMissing - 1) * minBid
}

export function formatMs(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(1)
}

// Les seuils vivent dans config.json : cardTier n'est plus le seul lecteur de la
// règle depuis que le curseur de note de l'éditeur dessine les bandes de palier.
export function cardTier(rating: number): string {
  const { gold, silver } = config.packs.cards.tiers
  return rating >= gold ? 'gold' : rating >= silver ? 'silver' : 'bronze'
}

export function cardsOf<T extends { player_id: string }>(cards: T[], playerId: string | null): T[] {
  return cards.filter(c => c.player_id === playerId)
}
