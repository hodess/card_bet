import { describe, expect, it } from 'vitest'
import { avatarHue, avatarInitial } from './avatar'

describe('avatarInitial', () => {
  it('prend la première lettre en majuscule', () => {
    expect(avatarInitial('romain')).toBe('R')
    expect(avatarInitial('Zizou')).toBe('Z')
  })
  it('ignore les espaces de bord', () => {
    expect(avatarInitial('  ana')).toBe('A')
  })
  it('retombe sur ? si vide', () => {
    expect(avatarInitial('')).toBe('?')
    expect(avatarInitial('   ')).toBe('?')
  })
})

describe('avatarHue', () => {
  it('reste stable pour un pseudo donné (valeur figée)', () => {
    // Valeur figée volontairement : si l'algorithme change (le *31 ou le %360),
    // ce test doit casser pour qu'on remarque que tous les avatars existants
    // changeraient de couleur.
    expect(avatarHue('romain')).toBe(166)
  })
  it('ignore la casse', () => {
    expect(avatarHue('Romain')).toBe(avatarHue('romain'))
  })
  it('reste dans [0, 360[', () => {
    for (const n of ['a', 'romain', 'Zizou_42', 'x'.repeat(20), '']) {
      const h = avatarHue(n)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(360)
    }
  })
  it('distingue des pseudos proches', () => {
    expect(avatarHue('romain')).not.toBe(avatarHue('romaim'))
  })
})
