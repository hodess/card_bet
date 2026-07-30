// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { en, fr, getLang, locale, setLang, subscribe, t } from './index'

describe('dictionnaires', () => {
  it('fr et en ont exactement le même jeu de clés', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort())
  })
  it('aucune valeur vide', () => {
    // concaténation et non spread d'objets : un spread écraserait les valeurs fr
    // par les valeurs en (mêmes clés) et ne vérifierait qu'un seul dictionnaire.
    const vides = [...Object.entries(fr), ...Object.entries(en)].filter(([, v]) => !v.trim())
    expect(vides).toEqual([])
  })
  it('fr et en interpolent les mêmes variables pour chaque clé', () => {
    // même expression que `t` : l'ordre d'apparition peut légitimement différer
    // entre deux langues, on compare donc des ensembles triés.
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()
    const divergentes = Object.keys(fr).filter(k => {
      // ?? '' : si une clé manque côté en (ou fr), on compare à un ensemble vide
      // plutôt que de planter — le test échoue alors avec le nom de la clé en cause.
      const a = JSON.stringify(vars(fr[k] ?? ''))
      const b = JSON.stringify(vars(en[k] ?? ''))
      return a !== b
    })
    expect(divergentes).toEqual([])
  })
})

describe('t', () => {
  beforeEach(() => { setLang('fr') })

  it('rend la chaîne de la langue courante', () => {
    expect(t('common.home')).toBe('Accueil')
    setLang('en')
    expect(t('common.home')).toBe('Home')
  })
  it('interpole les variables', () => {
    expect(t('history.capped', { n: 200 })).toBe('Historique limité aux 200 dernières parties.')
  })
  it('laisse le motif en place si la variable manque', () => {
    expect(t('history.capped')).toBe('Historique limité aux {n} dernières parties.')
  })
  it('renvoie la clé si elle est absente', () => {
    expect(t('truc.inconnu')).toBe('truc.inconnu')
  })
})

describe('langue', () => {
  it('persiste le choix et notifie les abonnés', () => {
    setLang('fr')
    let notified = 0
    const off = subscribe(() => { notified++ })
    setLang('en')
    expect(getLang()).toBe('en')
    expect(localStorage.getItem('cardbet-lang')).toBe('en')
    expect(notified).toBe(1)
    setLang('en')
    expect(notified).toBe(1)  // même langue : pas de notification
    off()
    setLang('fr')
    expect(notified).toBe(1)  // désabonné
  })
  it('expose la locale de formatage', () => {
    setLang('fr'); expect(locale()).toBe('fr-FR')
    setLang('en'); expect(locale()).toBe('en-GB')
  })
  it('synchronise document.documentElement.lang', () => {
    setLang('en')
    expect(document.documentElement.lang).toBe('en')
    setLang('fr')
    expect(document.documentElement.lang).toBe('fr')
  })
})
