import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile'
import {
  claimUsername, signInWithGoogle, signInWithPassword,
  upgradeWithGoogle, upgradeWithPassword,
} from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { takeAuthError } from '../lib/authError'
import { useT } from '../hooks/useT'

export default function AuthPage() {
  const p = useProfile()
  const { t } = useT()
  if (p.loading) return <p className="center">{t('common.loading')}</p>
  if (p.profile) {
    return (
      <main className="page">
        <h1>{t('auth.myAccount')}</h1>
        <p>{t('auth.signedInAs', { username: p.profile.username })}</p>
        <Link className="home-link" to="/me">{t('auth.myProfile')}</Link>
      </main>
    )
  }
  if (p.hasAccount) return <UsernameForm onDone={p.refresh} />
  return <CredentialsForm />
}

function CredentialsForm() {
  const { t } = useT()
  const [params, setParams] = useSearchParams()
  // l'URL fait foi : absent ou valeur inconnue → création de compte (comportement historique)
  const signup = params.get('mode') !== 'login'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [returnError] = useState(() => takeAuthError())

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      if (signup) await upgradeWithPassword(email, password)
      else await signInWithPassword(email, password)
      // le onAuthStateChange de useProfile fait re-rendre AuthPage :
      // signup → UsernameForm ; login → écran connecté
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function google() {
    setError(null)
    try {
      // après une erreur « déjà lié », on se CONNECTE au compte existant
      if (signup && !returnError) await upgradeWithGoogle()
      else await signInWithGoogle()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <main className="page">
      <h1>{signup ? t('auth.signupTitle') : t('auth.loginTitle')}</h1>
      {returnError && returnError.code === 'identity_already_exists' && (
        <section className="public-setup">
          <p className="error">{t('auth.googleAlreadyLinked')}</p>
          <button className="secondary" onClick={google}>
            {t('auth.googleSignInWithIt')}
          </button>
        </section>
      )}
      {returnError && returnError.code !== 'identity_already_exists' && (
        <section className="public-setup">
          <p className="error">{t('auth.googleFailed')}</p>
          {returnError.description && <p className="hint">{returnError.description}</p>}
        </section>
      )}
      {signup && <p className="hint">{t('auth.signupPitch')}</p>}
      <form className="auth-form" onSubmit={submit}>
        <input type="email" placeholder={t('auth.email')} value={email} required
          onChange={e => setEmail(e.target.value)} />
        <input type="password" placeholder={t('auth.password')} value={password}
          required minLength={6} onChange={e => setPassword(e.target.value)} />
        <button type="submit" disabled={busy}>
          {busy ? t('common.wait') : signup ? t('auth.submitSignup') : t('auth.submitLogin')}
        </button>
      </form>
      <button className="secondary" onClick={google}>
        {signup ? t('auth.googleSignup') : t('auth.googleLogin')}
      </button>
      <button className="linklike"
        onClick={() => { setParams({ mode: signup ? 'login' : 'signup' }, { replace: true }); setError(null) }}>
        {signup ? t('auth.toLogin') : t('auth.toSignup')}
      </button>
      {error && <p className="error">{error}</p>}
    </main>
  )
}

function UsernameForm({ onDone }: { onDone: () => Promise<void> }) {
  const { t } = useT()
  const nav = useNavigate()
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await claimUsername(username)
      await onDone()
      nav('/')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <h1>{t('auth.chooseUsername')}</h1>
      <p className="hint">{t('auth.usernameHint')}</p>
      <form className="auth-form" onSubmit={submit}>
        <input placeholder={t('auth.usernamePlaceholder')} value={username} required
          onChange={e => setUsername(e.target.value)} />
        <button type="submit" disabled={busy}>{busy ? t('common.wait') : t('auth.validate')}</button>
      </form>
      {error && <p className="error">{error}</p>}
    </main>
  )
}
