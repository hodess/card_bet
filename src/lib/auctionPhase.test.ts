import { describe, expect, it } from 'vitest'
import config from '../config.json'
import {
  canFly, flyTransform, isSettled, isUrgent, nextPhase, phaseDuration, pipStates, SEQUENCE_MS,
  showPips, venteDe,
} from './auctionPhase'

const A = config.ui.auction

describe('nextPhase', () => {
  it('enchaîne une carte du reveal au landed puis reboucle', () => {
    expect(nextPhase('reveal')).toBe('bid')
    expect(nextPhase('bid')).toBe('sold')
    expect(nextPhase('sold')).toBe('fly')
    expect(nextPhase('fly')).toBe('landed')
    expect(nextPhase('landed')).toBe('reveal')
  })
})

describe('phaseDuration', () => {
  it('lit les durées dans la config', () => {
    expect(phaseDuration('reveal')).toBe(A.revealMs)
    expect(phaseDuration('sold')).toBe(A.soldMs)
    expect(phaseDuration('fly')).toBe(A.flyMs)
    expect(phaseDuration('landed')).toBe(A.landedMs)
  })
  it('donne 0 pour bid : la durée vient du serveur, pas d\'un timer', () => {
    expect(phaseDuration('bid')).toBe(0)
  })
})

describe('SEQUENCE_MS', () => {
  // Contrat avec la migration `v1_3_reveal_grace` : le serveur retarde de
  // 3 000 ms le démarrage de l'enchère suivante. Si les durées d'animation
  // changent, ce test tombe et la migration doit suivre.
  it('vaut le sursis de révélation appliqué par le serveur (3 s)', () => {
    expect(SEQUENCE_MS).toBe(3000)
    expect(SEQUENCE_MS).toBe(A.soldMs + A.flyMs + A.landedMs + A.revealMs)
  })
})

describe('venteDe', () => {
  const owned = [
    { card_id: 7, player_id: 'p1', price_paid: 120 },
    { card_id: 9, player_id: 'p2', price_paid: 40 },
  ]
  it('rend le gagnant et le prix payés par le serveur', () => {
    expect(venteDe(owned, 9)).toEqual({ winnerId: 'p2', amount: 40 })
  })
  it('rend null tant que la carte n\'est pas adjugée', () => {
    expect(venteDe(owned, 3)).toBeNull()
    expect(venteDe([], 7)).toBeNull()
  })
})

describe('isUrgent', () => {
  it('vrai juste sous le seuil, faux au-dessus', () => {
    expect(isUrgent(A.urgentMs - 1)).toBe(true)
    expect(isUrgent(A.urgentMs)).toBe(false)
    expect(isUrgent(A.urgentMs + 500)).toBe(false)
  })
  it('faux à zéro ou en négatif : l\'enchère est finie, pas urgente', () => {
    expect(isUrgent(0)).toBe(false)
    expect(isUrgent(-200)).toBe(false)
  })
})

describe('isSettled', () => {
  it('vrai pendant les trois phases d\'adjudication', () => {
    expect(isSettled('sold')).toBe(true)
    expect(isSettled('fly')).toBe(true)
    expect(isSettled('landed')).toBe(true)
  })
  it('faux avant l\'adjudication', () => {
    expect(isSettled('reveal')).toBe(false)
    expect(isSettled('bid')).toBe(false)
  })
})

describe('showPips', () => {
  it('affiche les pips jusqu\'à maxPips, plus au-delà', () => {
    expect(showPips(A.maxPips)).toBe(true)
    expect(showPips(A.maxPips + 1)).toBe(false)
  })
})

describe('pipStates', () => {
  it('marque les cartes passées, la courante et les suivantes', () => {
    // seq est 1-based : à la 2e carte sur 4, une seule est déjà gagnée
    expect(pipStates(4, 2)).toEqual(['won', 'current', 'todo', 'todo'])
  })
  it('gère la première et la dernière carte', () => {
    expect(pipStates(3, 1)).toEqual(['current', 'todo', 'todo'])
    expect(pipStates(3, 3)).toEqual(['won', 'won', 'current'])
  })
  it('borne un seq hors plage plutôt que de rendre un tableau incohérent', () => {
    expect(pipStates(3, 0)).toEqual(['current', 'todo', 'todo'])
    expect(pipStates(3, 9)).toEqual(['won', 'won', 'current'])
  })
})

describe('flyTransform', () => {
  it('translate du centre de la carte vers le centre de la cible', () => {
    const card = { left: 100, top: 200, width: 210, height: 280 }   // centre 205 / 340
    const target = { left: 300, top: 600, width: 40, height: 14 }   // centre 320 / 607
    expect(flyTransform(card, target)).toBe('translate(115px, 267px) scale(.09) rotate(8deg)')
  })
  it('arrondit à l\'entier : pas de sous-pixel dans un transform', () => {
    const card = { left: 0, top: 0, width: 211, height: 281 }
    const target = { left: 0, top: 0, width: 40, height: 14 }
    expect(flyTransform(card, target)).toBe('translate(-85px, -133px) scale(.09) rotate(8deg)')
  })
})

describe('canFly', () => {
  it('refuse une cible absente ou non mesurée', () => {
    expect(canFly(null, 800)).toBe(false)
    expect(canFly({ left: 0, top: 10, width: 0, height: 0 }, 800)).toBe(false)
  })
  it('refuse une cible hors viewport (ligne scrollée)', () => {
    expect(canFly({ left: 0, top: -40, width: 40, height: 14 }, 800)).toBe(false)
    expect(canFly({ left: 0, top: 900, width: 40, height: 14 }, 800)).toBe(false)
  })
  it('accepte une cible visible', () => {
    expect(canFly({ left: 0, top: 640, width: 40, height: 14 }, 800)).toBe(true)
  })
})
