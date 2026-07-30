import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile'
import {
  authErrorMessage, claimUsername, signInWithGoogle, signInWithPassword,
  upgradeWithGoogle, upgradeWithPassword,
} from '../lib/auth'

export default function AuthPage() {
  const p = useProfile()
  if (p.loading) return <p className="center">Chargement…</p>
  if (p.profile) {
    return (
      <main className="page">
        <h1>Mon compte</h1>
        <p>Connecté en tant que <strong>{p.profile.username}</strong>.</p>
        <Link className="home-link" to="/me">Mon profil</Link>
        <Link className="home-link" to="/">Accueil</Link>
      </main>
    )
  }
  if (p.hasAccount) return <UsernameForm onDone={p.refresh} />
  return <CredentialsForm />
}

function CredentialsForm() {
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const signup = mode === 'signup'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      if (signup) await upgradeWithPassword(email, password)
      else await signInWithPassword(email, password)
      // le onAuthStateChange de useProfile fait re-rendre AuthPage :
      // signup → UsernameForm ; login → écran connecté
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function google() {
    setError(null)
    try {
      if (signup) await upgradeWithGoogle()
      else await signInWithGoogle()
      // redirection OAuth : on quitte la page
    } catch (err) {
      setError(authErrorMessage(err))
    }
  }

  return (
    <main className="page">
      <h1>{signup ? 'Créer mon compte' : 'Se connecter'}</h1>
      {signup && <p className="hint">Ton compte garde ton pseudo, ton historique et tes amis.</p>}
      <form className="auth-form" onSubmit={submit}>
        <input type="email" placeholder="Email" value={email} required
          onChange={e => setEmail(e.target.value)} />
        <input type="password" placeholder="Mot de passe (6 caractères min.)" value={password}
          required minLength={6} onChange={e => setPassword(e.target.value)} />
        <button type="submit" disabled={busy}>
          {busy ? 'Un instant…' : signup ? 'Créer mon compte' : 'Se connecter'}
        </button>
      </form>
      <button className="secondary" onClick={google}>
        {signup ? 'Continuer avec Google' : 'Se connecter avec Google'}
      </button>
      <button className="linklike" onClick={() => { setMode(signup ? 'login' : 'signup'); setError(null) }}>
        {signup ? 'Déjà un compte ? Se connecter' : 'Pas de compte ? En créer un'}
      </button>
      {error && <p className="error">{error}</p>}
      <Link className="home-link" to="/">Accueil</Link>
    </main>
  )
}

function UsernameForm({ onDone }: { onDone: () => Promise<void> }) {
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
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <h1>Choisis ton pseudo</h1>
      <p className="hint">Unique et définitif : c'est lui qu'on verra en partie et sur ton profil.</p>
      <form className="auth-form" onSubmit={submit}>
        <input placeholder="Pseudo (3-20 : lettres, chiffres, _)" value={username} required
          onChange={e => setUsername(e.target.value)} />
        <button type="submit" disabled={busy}>{busy ? 'Un instant…' : 'Valider'}</button>
      </form>
      {error && <p className="error">{error}</p>}
    </main>
  )
}
