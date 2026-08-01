import { describe, expect, it } from 'vitest'
import { rankRows } from './ranking'

type Ligne = { nom: string; total: number; money: number }
const score = (l: Ligne) => ({ total: l.total, money: l.money })
const rangs = (lignes: Ligne[]) =>
  rankRows(lignes, score).map(r => [r.row.nom, r.rank] as const)

describe('rankRows', () => {
  it('classe par total de notes décroissant', () => {
    expect(rangs([
      { nom: 'a', total: 100, money: 0 },
      { nom: 'b', total: 250, money: 0 },
      { nom: 'c', total: 180, money: 0 },
    ])).toEqual([['b', 1], ['c', 2], ['a', 3]])
  })
  it('départage à l’argent restant', () => {
    expect(rangs([
      { nom: 'a', total: 200, money: 10 },
      { nom: 'b', total: 200, money: 90 },
    ])).toEqual([['b', 1], ['a', 2]])
  })
  it('partage le rang à égalité parfaite et saute le suivant', () => {
    expect(rangs([
      { nom: 'a', total: 200, money: 50 },
      { nom: 'b', total: 200, money: 50 },
      { nom: 'c', total: 100, money: 0 },
    ])).toEqual([['a', 1], ['b', 1], ['c', 3]])
  })
  it('ne modifie pas le tableau reçu', () => {
    const lignes: Ligne[] = [
      { nom: 'a', total: 1, money: 0 },
      { nom: 'b', total: 2, money: 0 },
    ]
    rankRows(lignes, score)
    expect(lignes.map(l => l.nom)).toEqual(['a', 'b'])
  })
  it('accepte une table vide', () => {
    expect(rankRows([] as Ligne[], score)).toEqual([])
  })
})
