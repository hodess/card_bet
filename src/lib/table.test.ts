import { describe, expect, it } from 'vitest'
import config from '../config.json'
import { seatOrder, seatUnits } from './table'

const TABLE = config.ui.auction.table

// Les sièges se posent sur le périmètre du rectangle de la carte : un siège est
// donc soit sur un bord latéral (x = 0 ou 1), soit sur le bord haut (y = 0).
function surLeBord({ x, y }: { x: number; y: number }): boolean {
  return x === 0 || x === 1 || y === 0
}

describe('seatUnits', () => {
  it('rend autant de sièges que de joueurs, de 2 à 8', () => {
    for (let n = 2; n <= 8; n++) expect(seatUnits(n)).toHaveLength(n)
  })

  it("ne place jamais un siège à l'intérieur de la carte", () => {
    for (let n = 2; n <= 8; n++) {
      for (const siege of seatUnits(n)) {
        expect(surLeBord(siege)).toBe(true)
        expect(siege.x).toBeGreaterThanOrEqual(0)
        expect(siege.x).toBeLessThanOrEqual(1)
        expect(siege.y).toBeGreaterThanOrEqual(0)
        expect(siege.y).toBeLessThanOrEqual(1)
      }
    }
  })

  it('parcourt les bords dans l’ordre gauche → haut → droite, sans retour', () => {
    const rang = { left: 0, top: 1, right: 2 }
    for (let n = 2; n <= 8; n++) {
      const rangs = seatUnits(n).map(s => rang[s.edge])
      expect(rangs).toEqual([...rangs].sort((a, b) => a - b))
      expect(seatUnits(n)[0].edge).toBe('left')
      expect(seatUnits(n)[n - 1].edge).toBe('right')
    }
  })

  it('est symétrique : le siège i et le siège miroir se répondent', () => {
    for (let n = 2; n <= 8; n++) {
      const sieges = seatUnits(n)
      for (let i = 0; i < n; i++) {
        const miroir = sieges[n - 1 - i]
        expect(miroir.x).toBeCloseTo(1 - sieges[i].x, 6)
        expect(miroir.y).toBeCloseTo(sieges[i].y, 6)
      }
    }
  })

  it('à 2 joueurs : les deux extrémités du chemin', () => {
    expect(seatUnits(2)).toEqual([
      { edge: 'left', x: 0, y: 0.45 },
      { edge: 'right', x: 1, y: 0.45 },
    ])
  })

  it('à 3 joueurs : un siège au centre du bord haut', () => {
    const [, milieu] = seatUnits(3)
    expect(milieu.edge).toBe('top')
    expect(milieu.x).toBeCloseTo(0.5, 6)
    expect(milieu.y).toBe(0)
  })

  it('à 4 joueurs : extrémités et deux coins hauts (la maquette)', () => {
    const sieges = seatUnits(4)
    expect(sieges.map(s => s.edge)).toEqual(['left', 'top', 'top', 'right'])
    expect(sieges[1].x).toBeCloseTo(0.140650, 5)
    expect(sieges[2].x).toBeCloseTo(0.859350, 5)
  })

  it('à 8 joueurs : 2 à gauche, 4 en haut, 2 à droite', () => {
    const bords = seatUnits(8).map(s => s.edge)
    expect(bords.filter(e => e === 'left')).toHaveLength(2)
    expect(bords.filter(e => e === 'top')).toHaveLength(4)
    expect(bords.filter(e => e === 'right')).toHaveLength(2)
  })

  it('à 6 joueurs : la répartition est 2 / 2 / 2', () => {
    const bords = seatUnits(6).map(s => s.edge)
    expect(bords.filter(e => e === 'left')).toHaveLength(2)
    expect(bords.filter(e => e === 'top')).toHaveLength(2)
    expect(bords.filter(e => e === 'right')).toHaveLength(2)
  })

  it('espace les sièges à intervalle constant le long du périmètre', () => {
    // Dérivation indépendante de celle de seatUnits : on reconvertit chaque
    // siège en distance parcourue depuis le départ (bas du bord gauche), pour
    // vérifier que le découpage du chemin est bien régulier — un test qui ne
    // regarderait que x/y par bord ne détecterait pas une erreur de pas.
    const monte = TABLE.startFraction * TABLE.cardH
    const traverse = TABLE.cardW
    for (let n = 2; n <= 8; n++) {
      const distances = seatUnits(n).map(({ edge, x, y }) => {
        if (edge === 'left') return monte - y * TABLE.cardH
        if (edge === 'top') return monte + x * TABLE.cardW
        return monte + traverse + y * TABLE.cardH
      })
      const ecarts = distances.slice(1).map((d, i) => d - distances[i])
      for (const ecart of ecarts) expect(ecart).toBeCloseTo(ecarts[0], 6)
    }
  })

  it('ne plante pas sur un effectif dégénéré', () => {
    expect(seatUnits(1)).toEqual([{ edge: 'top', x: 0.5, y: 0 }])
    expect(seatUnits(0)).toEqual([{ edge: 'top', x: 0.5, y: 0 }])
  })
})

const lignes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

describe('seatOrder', () => {
  it('me place en première position sans changer l’ordre relatif des autres', () => {
    expect(seatOrder(lignes, 'b')).toEqual([{ id: 'b' }, { id: 'c' }, { id: 'a' }])
  })
  it('ne touche à rien quand je suis déjà premier', () => {
    expect(seatOrder(lignes, 'a')).toEqual(lignes)
  })
  it('rend la liste inchangée quand je n’y suis pas ou que je suis inconnu', () => {
    expect(seatOrder(lignes, null)).toEqual(lignes)
    expect(seatOrder(lignes, 'zzz')).toEqual(lignes)
  })
})
