// @vitest-environment jsdom
import { afterAll, describe, expect, it } from 'vitest'
import { errorMessage, SERVER_CODES } from './errors'
import { en, fr, setLang } from '../i18n'

afterAll(() => { setLang('fr') })

describe('errorMessage', () => {
  it('traduit un code SQL en français', () => {
    setLang('fr')
    expect(errorMessage(new Error('GAME_FULL'))).toBe('La partie est déjà complète.')
    expect(errorMessage(new Error('USERNAME_TAKEN'))).toBe('Ce pseudo est déjà pris.')
    expect(errorMessage(new Error('SELF_FRIENDSHIP'))).toBe('Tu ne peux pas t’ajouter toi-même.')
  })
  it('traduit le même code en anglais', () => {
    setLang('en')
    expect(errorMessage(new Error('GAME_FULL'))).toBe('This game is already full.')
  })
  it('traduit les messages Supabase Auth dans les deux langues', () => {
    setLang('fr')
    expect(errorMessage(new Error('Invalid login credentials'))).toBe('Email ou mot de passe incorrect.')
    expect(errorMessage(new Error('A user with this email address has already been registered')))
      .toBe('Cet email est déjà associé à un compte — connecte-toi plutôt.')
    setLang('en')
    expect(errorMessage(new Error('Invalid login credentials'))).toBe('Wrong email or password.')
  })
  it('accepte autre chose qu’une Error', () => {
    setLang('fr')
    expect(errorMessage('GAME_NOT_FOUND')).toBe('Partie introuvable.')
  })
  it('retombe sur le message brut si code inconnu', () => {
    expect(errorMessage(new Error('TRUC_INCONNU'))).toBe('TRUC_INCONNU')
  })
})

describe('synchronisation codes ↔ dictionnaires', () => {
  it('chaque code serveur a sa clé dans fr et en', () => {
    const manquantes = SERVER_CODES.filter(c => !fr[`errors.${c}`] || !en[`errors.${c}`])
    expect(manquantes).toEqual([])
  })
})
