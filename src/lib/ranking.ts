// Classement du jeu (RULES.md § 6) : total des notes, puis argent restant, puis
// ex æquo partagés — deux premiers, pas de deuxième. Partagé par l'écran de fin
// et l'historique, qui classaient la même chose de deux façons différentes.
export type Score = { total: number; money: number }
export type Ranked<T> = { row: T; rank: number }

export function rankRows<T>(rows: T[], score: (row: T) => Score): Ranked<T>[] {
  const tries = [...rows].sort((a, b) => {
    const sa = score(a)
    const sb = score(b)
    return sb.total - sa.total || sb.money - sa.money
  })
  let rank = 0
  return tries.map((row, i) => {
    const s = score(row)
    const prev = i > 0 ? score(tries[i - 1]) : null
    if (!prev || prev.total !== s.total || prev.money !== s.money) rank = i + 1
    return { row, rank }
  })
}
