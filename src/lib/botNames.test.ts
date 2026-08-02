import { describe, expect, it } from 'vitest'
import { pickBotName, temperamentOf } from './botNames'

describe('pickBotName', () => {
  it('prend le premier nom libre du config', () => {
    expect(pickBotName([])).toBe('Bot Zizou')
    expect(pickBotName(['Bot Zizou'])).toBe('Bot Bielsa')
  })
  it('ignore les pseudos humains inconnus', () => {
    expect(pickBotName(['Romain', 'Alice'])).toBe('Bot Zizou')
  })
  it('suffixe une fois les quatre noms pris', () => {
    const pris = ['Bot Zizou', 'Bot Bielsa', 'Bot Pep', 'Bot Arsène']
    expect(pickBotName(pris)).toBe('Bot Zizou 2')
    expect(pickBotName([...pris, 'Bot Zizou 2'])).toBe('Bot Bielsa 2')
  })
  it('donne sept noms distincts pour une table de huit', () => {
    const noms: string[] = []
    for (let i = 0; i < 7; i++) noms.push(pickBotName(['Romain', ...noms]))
    expect(noms).toEqual([
      'Bot Zizou', 'Bot Bielsa', 'Bot Pep', 'Bot Arsène',
      'Bot Zizou 2', 'Bot Bielsa 2', 'Bot Pep 2',
    ])
  })
})

describe('temperamentOf', () => {
  it('rend le tempérament du config pour un nom connu', () => {
    expect(temperamentOf('Bot Arsène')).toEqual({
      kappa: 0.88, gamma: 1, restraint: 0.72, jumpRate: 0.5, delayFactor: 0.9,
    })
  })
  it('est déterministe : deux appels donnent le même résultat', () => {
    expect(temperamentOf('Bot Zizou')).toEqual(temperamentOf('Bot Zizou'))
  })
  it('distingue les quatre tempéraments par leur retenue', () => {
    const retenues = ['Bot Zizou', 'Bot Bielsa', 'Bot Pep', 'Bot Arsène']
      .map(n => temperamentOf(n).restraint)
    expect(new Set(retenues).size).toBe(4)
  })
  it('décale légèrement un nom suffixé, sans changer de tempérament de base', () => {
    const base = temperamentOf('Bot Arsène')
    const copie = temperamentOf('Bot Arsène 2')
    expect(copie.kappa).toBeCloseTo(base.kappa + 0.03)
    expect(copie.restraint).toBeCloseTo(base.restraint + 0.02)
    expect(copie.gamma).toBe(base.gamma)
  })
  it('plafonne la retenue d’un nom très suffixé à 0,95', () => {
    expect(temperamentOf('Bot Zizou 9').restraint).toBeLessThanOrEqual(0.95)
  })
  it('retombe sur le premier tempérament pour un pseudo inconnu', () => {
    expect(temperamentOf('Romain')).toEqual(temperamentOf('Bot Zizou'))
  })
})
