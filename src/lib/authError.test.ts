// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseAuthError, captureAuthError, peekAuthError, takeAuthError } from './authError'

describe('parseAuthError', () => {
  const q = '?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user'
  const h = '#error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user&sb='

  it("lit l'erreur dans la query", () => {
    expect(parseAuthError(q, '')).toEqual({
      code: 'identity_already_exists',
      description: 'Identity is already linked to another user',
    })
  })
  it("lit l'erreur dans le fragment", () => {
    expect(parseAuthError('', h)).toEqual({
      code: 'identity_already_exists',
      description: 'Identity is already linked to another user',
    })
  })
  it('query prioritaire quand les deux sont présents', () => {
    expect(parseAuthError('?error_code=a&error_description=x', '#error_code=b')?.code).toBe('a')
  })
  it("null sans paramètres d'erreur (retour OAuth réussi)", () => {
    expect(parseAuthError('?code=1f383f91-abcd', '#/account')).toBeNull()
    expect(parseAuthError('', '')).toBeNull()
  })
  it('description absente → chaîne vide', () => {
    expect(parseAuthError('?error_code=server_error', '')).toEqual({ code: 'server_error', description: '' })
  })
})

describe('captureAuthError', () => {
  const setUrl = (search: string, hash: string) => {
    window.history.replaceState(null, '', `/${search}${hash}`)
  }

  it('capture l\'erreur, nettoie l\'URL, et take() ne la rend qu\'une fois', () => {
    setUrl('?error_code=identity_already_exists&error_description=Already+linked', '')
    captureAuthError()
    expect(peekAuthError()).toEqual({
      code: 'identity_already_exists',
      description: 'Already linked',
    })
    expect(window.location.search).toBe('')
    expect(peekAuthError()).not.toBeNull()   // peek ne consomme pas
    expect(takeAuthError()).not.toBeNull()
    expect(takeAuthError()).toBeNull()       // take consomme
  })

  it('ne touche pas une URL de retour OAuth réussi', () => {
    setUrl('?code=abc123', '#/account')
    captureAuthError()
    expect(takeAuthError()).toBeNull()
    expect(window.location.search).toBe('?code=abc123')
  })
})
