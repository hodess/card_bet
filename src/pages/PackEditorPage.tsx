import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import config from '../config.json'
import PackJsonEditor from '../components/PackJsonEditor'
import PackPreview from '../components/PackPreview'
import { useProfile } from '../hooks/useProfile'
import { useT } from '../hooks/useT'
import { formatPackJson, parsePackJson, type PackInput } from '../lib/packs'
import { getPack, listPackCards, savePack } from '../lib/packsApi'
import { errorMessage } from '../lib/errors'

const EXEMPLE: PackInput = {
  name: 'Mon pack',
  emoji: '🃏',
  description: 'Deux cartes pour démarrer.',
  positions: { A: 'Première position', B: 'Seconde position' },
  cards: [
    { name: 'Première carte', position: 'A', rating: 80 },
    { name: 'Seconde carte', position: 'B', rating: 70 },
  ],
}

export default function PackEditorPage() {
  const { slug } = useParams<'slug'>()
  const nav = useNavigate()
  const { t } = useT()
  const { loading: chargementProfil, profile } = useProfile()
  // useProfile renvoie un nouvel objet `profile` à chaque événement d'auth
  // (rafraîchissement de jeton silencieux compris, en tâche de fond, sans
  // action de l'utilisateur) : on ne dépend donc que de son id, stable tant
  // que le compte ne change pas vraiment — l'effet de chargement ci-dessous
  // s'en sert pour ne jamais se réexécuter sans raison.
  const profileId = profile?.id ?? null
  const fichier = useRef<HTMLInputElement>(null)

  const [text, setText] = useState(() => formatPackJson(EXEMPLE))
  const [differe, setDiffere] = useState(text)
  const [visibility, setVisibility] = useState<'public' | 'private'>('private')
  const [chargement, setChargement] = useState(Boolean(slug))
  const [introuvable, setIntrouvable] = useState(false)
  // Échec réseau/serveur du chargement d'un pack existant (distinct de
  // `error`, qui sert aussi à afficher les erreurs d'import/enregistrement
  // une fois l'éditeur affiché) : voir l'effet ci-dessous pour pourquoi cet
  // état a besoin d'exister séparément.
  const [echecChargement, setEchecChargement] = useState(false)
  const [enregistrement, setEnregistrement] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // dernier aperçu valide : le rendu ne clignote pas à chaque frappe invalide
  const [dernierValide, setDernierValide] = useState<PackInput | null>(null)

  // Le chargement initial ne doit jamais réécrire ce que l'utilisateur a tapé
  // depuis : sans cette référence, l'effet ci-dessous se réexécuterait à
  // chaque nouvel id de profil et écraserait le brouillon en cours d'édition
  // avec la version serveur. `null` après un échec (voir `reessayer`) pour
  // permettre un nouvel essai sur le même slug.
  const packCharge = useRef<string | null>(null)
  // Incrémenté par `reessayer` : seul moyen de forcer une nouvelle exécution
  // de l'effet quand ni `slug`, ni `chargementProfil`, ni `profileId` n'ont
  // changé entre-temps.
  const [tentative, setTentative] = useState(0)

  // Édition : on reconstruit le JSON depuis la base. Le pack n'y est pas stocké
  // sous forme de fichier — le JSON n'est qu'un format de saisie et d'échange.
  // On attend que le profil soit chargé avant de vérifier la propriété : sans
  // ça, `profile` vaudrait encore `null` le temps du premier rendu et un pack
  // qui m'appartient serait à tort déclaré introuvable.
  useEffect(() => {
    if (!slug || chargementProfil) return
    if (packCharge.current === slug) return
    packCharge.current = slug
    let alive = true
    Promise.all([getPack(slug), listPackCards(slug)])
      .then(([p, cards]) => {
        if (!alive) return
        // Symétrique de `reessayer` : un échec resté affiché pour un autre
        // slug (navigation directe d'un pack en échec vers un autre, sans
        // passer par Réessayer — l'effet se rejoue alors sur ce nouveau
        // slug, mais le composant est le même instance) ne doit pas
        // survivre à un chargement qui, lui, a réussi.
        setEchecChargement(false)
        setError(null)
        // Pack inexistant, ou qui ne m'appartient pas : le serveur refuserait
        // l'enregistrement avec NOT_PACK_OWNER. Même écran que « introuvable ».
        if (!p || !profileId || p.owner_id !== profileId) {
          setIntrouvable(true)
          setChargement(false)
          return
        }
        const payload: PackInput = {
          name: p.name,
          emoji: p.emoji,
          description: p.description,
          positions: (p.positions ?? {}) as Record<string, string>,
          cards: cards.map(c => ({ name: c.name, position: c.position, rating: c.rating })),
        }
        setText(formatPackJson(payload))
        setDiffere(formatPackJson(payload))
        setVisibility(p.visibility as 'public' | 'private')
        setChargement(false)
      })
      .catch(e => {
        if (!alive) return
        // On ne remplit jamais `text`/`differe` ici : ils garderaient
        // l'EXEMPLE prérempli au montage, un JSON valide, donc un bouton
        // Enregistrer actif qui écraserait le vrai pack en base. On bascule
        // sur un écran dédié qui rend l'éditeur inatteignable tant que le
        // chargement n'a pas réussi. `slug` est garanti défini ici (l'effet
        // sort plus haut sinon) : en création, l'exemple reste légitime.
        packCharge.current = null
        setError(errorMessage(e))
        setEchecChargement(true)
        setChargement(false)
      })
    return () => {
      alive = false
      // Si l'effet est nettoyé avant que la requête n'ait pu aboutir (double
      // montage de StrictMode en dev, ou l'utilisateur quitte l'éditeur et y
      // revient avant la réponse), on libère le verrou : sinon la tentative
      // suivante resterait bloquée indéfiniment sur « Chargement… », son
      // résultat ayant été jeté en silence par `alive`.
      if (packCharge.current === slug) packCharge.current = null
    }
  }, [slug, chargementProfil, profileId, tentative])

  function reessayer() {
    packCharge.current = null
    setError(null)
    setEchecChargement(false)
    setChargement(true)
    setTentative(n => n + 1)
  }

  // L'analyse est différée : sur un pack de 300 cartes, parser à chaque touche
  // rendrait la frappe collante.
  useEffect(() => {
    const id = setTimeout(() => setDiffere(text), config.ui.packEditorDebounceMs)
    return () => clearTimeout(id)
  }, [text])

  const { pack, errors } = useMemo(() => parsePackJson(differe), [differe])
  useEffect(() => { if (pack) setDernierValide(pack) }, [pack])

  async function importer(f: File) {
    setError(null)
    try {
      setText(await f.text())
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  // Nom de fichier assaini : un nom de pack peut contenir des caractères
  // interdits dans un nom de fichier (/, \, :…).
  function exporter() {
    const nom = (pack?.name ?? 'pack').replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'pack'
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${nom}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function enregistrer() {
    // On repart du texte affiché, pas de la version différée (`pack`/`errors`
    // dérivés de `differe`) : entre la dernière frappe et le clic, le debounce
    // peut n'avoir pas encore couru, et enregistrer figerait une version
    // antérieure à ce que l'utilisateur croit avoir validé.
    const { pack: aJour } = parsePackJson(text)
    if (!aJour) {
      setDiffere(text) // fait apparaître les erreurs sous l'éditeur
      return
    }
    setError(null)
    setEnregistrement(true)
    try {
      const nouveau = await savePack(slug ?? null, aJour, visibility)
      nav(`/packs/${encodeURIComponent(nouveau)}`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setEnregistrement(false)
    }
  }

  if (chargementProfil) return <p className="center">{t('common.loading')}</p>

  // Compte anonyme, ou compte sans pseudo choisi (déjà intercepté par
  // UsernameGate en amont) : le serveur lèverait NICKNAME_REQUIRED à
  // l'enregistrement. Autant le dire avant de faire saisir un pack entier.
  if (!profile) {
    return (
      <main className="page">
        <h1>{t(slug ? 'editor.titleEdit' : 'editor.titleNew')}</h1>
        <p className="hint">
          <Link className="player-link" to="/account">{t('profile.createAccount')}</Link>
          {' '}{t('editor.needAccount')}
        </p>
      </main>
    )
  }

  if (introuvable) {
    return (
      <main className="page">
        <h1>{t('packs.notFound')}</h1>
      </main>
    )
  }

  // Échec du chargement du pack existant : jamais l'éditeur ici, même si
  // `text` contient un EXEMPLE valide qui rendrait Enregistrer cliquable.
  if (echecChargement) {
    return (
      <main className="page">
        <h1>{t('editor.loadErrorTitle')}</h1>
        {error && <p className="error">{error}</p>}
        <button type="button" onClick={reessayer}>{t('editor.retry')}</button>
      </main>
    )
  }

  if (chargement) return <p className="center">{t('common.loading')}</p>

  return (
    <main className="page">
      <div className="page-head">
        <h1>{slug ? t('editor.titleEdit') : t('editor.titleNew')}</h1>
        <div className="pack-actions">
          <input ref={fichier} type="file" accept="application/json,.json"
                 style={{ display: 'none' }}
                 onChange={e => { const f = e.target.files?.[0]; if (f) importer(f) }} />
          <button className="btn-ghost" onClick={() => setText(formatPackJson(EXEMPLE))}>
            {t('editor.starter')}
          </button>
          <button className="btn-ghost" onClick={() => fichier.current?.click()}>
            {t('editor.import')}
          </button>
          <button className="btn-ghost" onClick={exporter}>{t('editor.export')}</button>
          <label className="settings-field">
            <span>{t('editor.visibility')}</span>
            <select value={visibility}
                    onChange={e => setVisibility(e.target.value as 'public' | 'private')}>
              <option value="private">{t('packs.private')}</option>
              <option value="public">{t('packs.public')}</option>
            </select>
          </label>
          <button disabled={!pack || enregistrement} onClick={enregistrer}>
            {enregistrement ? t('editor.saving') : t('editor.save')}
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="pack-editor">
        <PackJsonEditor text={text} onChange={setText} errors={errors}
                        disabled={enregistrement} />
        <PackPreview pack={pack ?? dernierValide} />
      </div>
    </main>
  )
}
