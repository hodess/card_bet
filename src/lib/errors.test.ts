import { describe, expect, it } from 'vitest'
import { errorMessage } from './errors'

describe('errorMessage', () => {
  it('traduit un code SQL en français', () => {
    expect(errorMessage(new Error('GAME_FULL'))).toBe('La partie est déjà complète.')
    expect(errorMessage(new Error('USERNAME_TAKEN'))).toBe('Ce pseudo est déjà pris.')
    expect(errorMessage(new Error('SELF_FRIENDSHIP'))).toBe('Tu ne peux pas t’ajouter toi-même.')
  })
  it('traduit les messages Supabase Auth', () => {
    expect(errorMessage(new Error('Invalid login credentials'))).toBe('Email ou mot de passe incorrect.')
    expect(errorMessage(new Error('A user with this email address has already been registered')))
      .toBe('Cet email est déjà associé à un compte — connecte-toi plutôt.')
  })
  it('accepte autre chose qu’une Error', () => {
    expect(errorMessage('GAME_NOT_FOUND')).toBe('Partie introuvable.')
  })
  it('retombe sur le message brut si code inconnu', () => {
    expect(errorMessage(new Error('TRUC_INCONNU'))).toBe('TRUC_INCONNU')
  })
})
