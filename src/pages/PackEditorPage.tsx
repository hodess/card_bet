import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import PackCardRow from '../components/PackCardRow'
import PackCardSheet from '../components/PackCardSheet'
import PackErrorSummary from '../components/PackErrorSummary'
import PackPositionsPanel from '../components/PackPositionsPanel'
import PackSettingsPanel from '../components/PackSettingsPanel'
import PositionChips from '../components/PositionChips'
import config from '../config.json'
import { usePackDraft } from '../hooks/usePackDraft'
import { useProfile } from '../hooks/useProfile'
import { useT } from '../hooks/useT'
import {
  draftFromPack, draftToJson, newCard, otherNames, positionCounts, ratingRange,
  sortDraftCards, type DraftCard, type IssueTarget,
} from '../lib/packDraft'
import type { PackError, PackInput } from '../lib/packs'
import { getPack, listPackCards, savePack } from '../lib/packsApi'
import { errorMessage } from '../lib/errors'

// Contenu de l'exemple prérempli : de la copie d'interface, donc sous t() —
// un pack de démonstration n'a pas de langue de référence, contrairement à un
// vrai pack (nom, positions, cartes : des données saisies par son auteur).
function exemplePack(t: (key: string) => string): PackInput {
  return {
    name: t('editor.sample.name'),
    emoji: t('editor.sample.emoji'),
    description: t('editor.sample.description'),
    positions: { A: t('editor.sample.position1'), B: t('editor.sample.position2') },
    cards: [
      { name: t('editor.sample.card1'), position: 'A', rating: 80 },
      { name: t('editor.sample.card2'), position: 'B', rating: 70 },
    ],
  }
}

// Un seul écran à la fois : ce type rend la règle structurelle au lieu de la
// confier à trois booléens qui pourraient être vrais ensemble. `retour` permet
// au chip « + » d'une carte d'aller définir une position puis de revenir à la
// saisie en cours — la carte survit parce qu'elle vit ici, pas dans la feuille.
type Ecran =
  | { vue: 'liste' }
  | { vue: 'carte'; card: DraftCard; mode: 'ajout' | 'edition' }
  | { vue: 'positions'; retour: { card: DraftCard; mode: 'ajout' | 'edition' } | null }
  | { vue: 'reglages' }

export default function PackEditorPage() {
  const { slug } = useParams<'slug'>()
  const nav = useNavigate()
  const { t } = useT()
  const { loading: chargementProfil, profile } = useProfile()
  // useProfile renvoie un nouvel objet `profile` à chaque événement d'auth
  // (rafraîchissement de jeton silencieux compris, en tâche de fond, sans
  // action de l'utilisateur) : on ne dépend donc que de son id, stable tant
  // que le compte ne change pas vraiment.
  const profileId = profile?.id ?? null
  const fichier = useRef<HTMLInputElement>(null)

  const d = usePackDraft()
  // `d` est un objet neuf à chaque rendu : le mettre dans les dépendances d'un
  // effet bouclerait indéfiniment. On extrait la seule fonction dont les effets
  // ont besoin — elle est stable (useCallback sans dépendance).
  const { charger } = d
  const [visibility, setVisibility] = useState<'public' | 'private'>('private')
  const [ecran, setEcran] = useState<Ecran>({ vue: 'liste' })
  const [menu, setMenu] = useState(false)
  const [filtreChoisi, setFiltre] = useState<string | null>(null)
  const [refusPosition, setRefusPosition] = useState<PackError | null>(null)

  const [chargement, setChargement] = useState(Boolean(slug))
  const [introuvable, setIntrouvable] = useState(false)
  const [echecChargement, setEchecChargement] = useState(false)
  const [enregistrement, setEnregistrement] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Le chargement initial ne doit jamais réécrire ce que l'utilisateur a saisi
  // depuis : sans cette référence, l'effet se réexécuterait à chaque nouvel id
  // de profil et écraserait le brouillon en cours. `null` après un échec (voir
  // `reessayer`) pour permettre un nouvel essai sur le même slug.
  const packCharge = useRef<string | null>(null)
  const [tentative, setTentative] = useState(0)

  // À la création, on part de l'exemple : il fait découvrir la notion de position,
  // la plus abstraite d'un pack. Une seule fois, jamais par-dessus une saisie.
  const exempleMis = useRef(false)
  useEffect(() => {
    if (slug || exempleMis.current) return
    exempleMis.current = true
    charger(draftFromPack(exemplePack(t)))
  }, [slug, charger, t])

  useEffect(() => {
    if (!slug || chargementProfil) return
    if (packCharge.current === slug) return
    packCharge.current = slug
    let alive = true
    Promise.all([getPack(slug), listPackCards(slug)])
      .then(([p, cards]) => {
        if (!alive) return
        setEchecChargement(false)
        setError(null)
        setIntrouvable(false)
        // Pack inexistant, ou qui ne m'appartient pas : le serveur refuserait
        // l'enregistrement avec NOT_PACK_OWNER. Même écran que « introuvable ».
        if (!p || !profileId || p.owner_id !== profileId) {
          setIntrouvable(true)
          setChargement(false)
          return
        }
        charger(draftFromPack({
          name: p.name,
          emoji: p.emoji,
          description: p.description,
          positions: (p.positions ?? {}) as Record<string, string>,
          cards: cards.map(c => ({ name: c.name, position: c.position, rating: c.rating })),
        }))
        setVisibility(p.visibility as 'public' | 'private')
        setChargement(false)
      })
      .catch(e => {
        if (!alive) return
        // On ne remplit jamais le brouillon ici : il garderait l'EXEMPLE, donc
        // un pack valide, donc un bouton Enregistrer actif qui écraserait le
        // vrai pack en base. On bascule sur un écran dédié qui rend l'éditeur
        // inatteignable tant que le chargement n'a pas réussi.
        packCharge.current = null
        setError(errorMessage(e))
        setEchecChargement(true)
        setChargement(false)
      })
    return () => {
      alive = false
      // Effet nettoyé avant la réponse (double montage StrictMode en dev, ou
      // aller-retour rapide) : on libère le verrou, sinon la tentative suivante
      // resterait bloquée sur « Chargement… ».
      if (packCharge.current === slug) packCharge.current = null
    }
  }, [slug, chargementProfil, profileId, tentative, charger])

  // Rechargement et fermeture d'onglet. La navigation interne n'est pas couverte :
  // useBlocker exige un data router, l'app monte <HashRouter> (App.tsx:1).
  useEffect(() => {
    if (!d.modifie) return
    const garde = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', garde)
    return () => window.removeEventListener('beforeunload', garde)
  }, [d.modifie])

  function reessayer() {
    packCharge.current = null
    setError(null)
    setEchecChargement(false)
    setChargement(true)
    setTentative(n => n + 1)
  }

  function quitter() {
    if (d.modifie && !confirm(t('editor.leaveWarning'))) return
    nav(slug ? `/packs/${encodeURIComponent(slug)}` : '/packs')
  }

  async function importer(f: File) {
    setError(null)
    try {
      const errors = d.importer(await f.text())
      // Un fichier refusé en bloc, ou des champs inconnus rencontrés au passage :
      // on les dit tous, sans jamais réparer en silence.
      setError(errors.length > 0 ? errors.map(e => t(e.key, e.params)).join(' ') : null)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  // Nom de fichier assaini : un nom de pack peut contenir des caractères
  // interdits dans un nom de fichier (/, \, :…).
  function exporter() {
    const nom = d.draft.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'pack'
    // draftToJson et non formatPackJson(payload) : on doit pouvoir exporter un
    // pack en cours, fautif compris, pour le finir ailleurs.
    const blob = new Blob([draftToJson(d.draft)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${nom}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function enregistrer() {
    const payload = d.payload()
    if (!payload) return
    setError(null)
    setEnregistrement(true)
    try {
      const nouveau = await savePack(slug ?? null, payload, visibility)
      nav(`/packs/${encodeURIComponent(nouveau)}`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setEnregistrement(false)
    }
  }

  // Le récapitulatif envoie vers l'endroit où corriger. Un filtre qui masquerait
  // la carte fautive est levé au passage, sinon le clic ne mènerait à rien.
  function allerA(cible: IssueTarget) {
    if (cible.kind === 'settings') { setEcran({ vue: 'reglages' }); return }
    if (cible.kind === 'positions') { setEcran({ vue: 'positions', retour: null }); return }
    if (cible.kind === 'list') { setFiltre(null); return }
    const card = d.draft.cards.find(c => c.id === cible.id)
    if (!card) return
    setFiltre(null)
    setEcran({ vue: 'carte', card, mode: 'edition' })
  }

  // Retour du panneau Positions vers une carte en cours : sa position a pu être
  // renommée ou supprimée pendant l'aller-retour. Une carte déjà au brouillon a
  // reçu la propagation de `renamePosition`, on la relit donc par son id ; une
  // carte en cours d'ajout n'y est pas, on se rabat sur la première position
  // encore existante plutôt que de la laisser sur un code disparu.
  function carteAuRetour(card: DraftCard): DraftCard {
    const auBrouillon = d.draft.cards.find(c => c.id === card.id)
    // On ne reprend du brouillon QUE la position : c'est le seul champ que
    // `renamePosition` a pu changer sous nos pieds. Rendre la carte du brouillon
    // en entier écraserait le nom et la note que l'utilisateur vient de taper.
    if (auBrouillon) return { ...card, position: auBrouillon.position }
    const codesVivants = d.draft.positions.map(p => p.code)
    if (codesVivants.includes(card.position)) return card
    return { ...card, position: d.draft.positions[0]?.code ?? '' }
  }

  if (chargementProfil) return <p className="center">{t('common.loading')}</p>

  // Compte anonyme, ou compte sans pseudo choisi : le serveur lèverait
  // NICKNAME_REQUIRED à l'enregistrement. Autant le dire avant de faire saisir
  // un pack entier.
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
    return <main className="page"><h1>{t('packs.notFound')}</h1></main>
  }

  // Échec du chargement d'un pack existant : jamais l'éditeur ici.
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

  const codes = d.draft.positions.map(p => p.code)
  // Le filtre ne peut pas désigner une position qui vient d'être renommée ou
  // supprimée : on le dérive au rendu plutôt que de le remettre à zéro dans
  // chaque mutation, où la prochaine mutation ajoutée oublierait de le faire.
  const filtre = filtreChoisi !== null && codes.includes(filtreChoisi) ? filtreChoisi : null

  const compte = positionCounts(d.draft)
  const bornes = ratingRange(d.draft.cards)
  const libelle = (code: string) => d.draft.positions.find(p => p.code === code)?.label ?? null
  const visibles = filtre === null
    ? sortDraftCards(d.draft.cards)
    : sortDraftCards(d.draft.cards).filter(c => c.position === filtre)

  return (
    <main className="page">
      <div className="editor-head">
        <button type="button" className="linklike" aria-label={t('editor.back')}
                onClick={quitter}>‹</button>
        <span className="editor-title">
          <strong>{d.draft.emoji} {d.draft.name || t('editor.untitled')}</strong>
          <span>
            {t(visibility === 'private' ? 'packs.private' : 'packs.public')}
            {' · '}
            {bornes
              ? t('packs.summary', { count: d.draft.cards.length, min: bornes.min, max: bornes.max })
              : t('editor.summaryEmpty')}
          </span>
        </span>
        <button type="button" className="editor-icon" aria-label={t('editor.menu')}
                onClick={() => setMenu(m => !m)}>⋯</button>
        <button type="button" disabled={d.issues.count > 0 || enregistrement} onClick={enregistrer}>
          {enregistrement ? t('editor.saving') : t('editor.save')}
        </button>

        {menu && (
          <>
            <div className="nav-overlay" onClick={() => setMenu(false)} />
            <div className="editor-menu">
              <span className="editor-menu-group">{t('editor.menuFile')}</span>
              <button type="button" onClick={() => {
                setMenu(false)
                if (d.modifie && !confirm(t('editor.importConfirm'))) return
                fichier.current?.click()
              }}>{t('editor.import')}</button>
              <button type="button" onClick={() => { setMenu(false); exporter() }}>
                {t('editor.export')}
              </button>
              <button type="button" onClick={() => {
                setMenu(false)
                if (d.modifie && !confirm(t('editor.resetConfirm'))) return
                d.remplacer(draftFromPack(exemplePack(t)))
              }}>{t('editor.starter')}</button>
              <span className="editor-menu-group">{t('editor.menuPack')}</span>
              <button type="button" onClick={() => { setMenu(false); setEcran({ vue: 'reglages' }) }}>
                {t('editor.menuIdentity')}
              </button>
              <button type="button" onClick={() => {
                setMenu(false)
                setEcran({ vue: 'positions', retour: null })
              }}>{t('editor.menuPositions', { count: d.draft.positions.length })}</button>
            </div>
          </>
        )}
      </div>

      <input ref={fichier} type="file" accept="application/json,.json"
             style={{ display: 'none' }}
             onChange={e => {
               const f = e.target.files?.[0]
               // Sans cette remise à zéro, rechoisir le MÊME fichier n'émet pas
               // de nouvel événement `change` : l'import serait silencieusement
               // inerte, juste après une confirmation destructrice acceptée.
               e.target.value = ''
               if (f) importer(f)
             }} />

      {error && <p className="error">{error}</p>}

      {ecran.vue === 'liste' && (
        <>
          <PositionChips positions={d.draft.positions} value={filtre} counts={compte}
                         allLabel={`${t('editor.filterAll')} ${d.draft.cards.length}`}
                         onPick={setFiltre}
                         onAdd={() => setEcran({ vue: 'positions', retour: null })} />

          {visibles.length === 0
            ? <p className="hint">{t('editor.emptyList')}</p>
            : (
              <div className="card-rows">
                {visibles.map(c => (
                  <PackCardRow key={c.id} card={c} label={libelle(c.position)}
                               issues={d.issues.cards[c.id]}
                               onClick={() => setEcran({ vue: 'carte', card: c, mode: 'edition' })} />
                ))}
              </div>
              )}

          <div className="editor-foot">
            <PackErrorSummary issues={d.plates} onGo={allerA} />
            <button type="button" className="editor-add"
                    disabled={d.draft.cards.length >= config.packs.cards.max}
                    onClick={() => setEcran({
              vue: 'carte',
              // Position de départ : celle du filtre courant si on en a un (on est en
              // train de garnir cette position), sinon la première du vocabulaire. Pas
              // « la dernière carte » : `cards` est trié par note, sa dernière entrée
              // est la moins bien notée, pas la dernière saisie. C'est `Ajouter et
              // continuer` qui assure la vraie reprise d'une carte à la suivante.
              card: newCard(filtre ?? d.draft.positions[0]?.code ?? ''),
              mode: 'ajout',
            })}>
              {t('editor.addCard')}
            </button>
          </div>
        </>
      )}

      {ecran.vue === 'carte' && (
        <PackCardSheet
          card={ecran.card}
          positions={d.draft.positions}
          others={otherNames(d.draft.cards, ecran.card.id)}
          mode={ecran.mode}
          number={d.draft.cards.length + 1}
          onChange={card => setEcran({ ...ecran, card })}
          onSubmit={() => { d.enregistrerCarte(ecran.card); setEcran({ vue: 'liste' }) }}
          onAddNext={() => {
            d.enregistrerCarte(ecran.card)
            // Pack plein : on ne propose pas une carte de plus qu'on refuserait
            // ensuite. « Ajouter et continuer » enchaîne jusqu'au plafond, puis rend.
            const plein = d.draft.cards.filter(c => c.id !== ecran.card.id).length + 1
              >= config.packs.cards.max
            setEcran(plein
              ? { vue: 'liste' }
              : { vue: 'carte', card: newCard(ecran.card.position), mode: 'ajout' })
          }}
          onDelete={() => { d.supprimerCarte(ecran.card.id); setEcran({ vue: 'liste' }) }}
          onCancel={() => setEcran({ vue: 'liste' })}
          onAddPosition={() => setEcran({
            vue: 'positions',
            retour: { card: ecran.card, mode: ecran.mode },
          })}
        />
      )}

      {ecran.vue === 'positions' && (
        <PackPositionsPanel
          positions={d.draft.positions}
          counts={compte}
          issues={d.issues.positions}
          refus={refusPosition}
          onRename={(id, code) => { setRefusPosition(null); d.renommerPosition(id, code) }}
          onLabel={(id, label) => { setRefusPosition(null); d.changerLibelle(id, label) }}
          onAdd={() => { setRefusPosition(null); d.ajouterPosition() }}
          onRemove={id => setRefusPosition(d.supprimerPosition(id))}
          onClose={() => {
            setRefusPosition(null)
            // Retour à la carte en cours de saisie : sa position peut avoir été
            // renommée ou supprimée pendant l'aller-retour, on la re-résout.
            setEcran(ecran.retour
              ? { vue: 'carte', card: carteAuRetour(ecran.retour.card), mode: ecran.retour.mode }
              : { vue: 'liste' })
          }}
        />
      )}

      {ecran.vue === 'reglages' && (
        <PackSettingsPanel
          name={d.draft.name} emoji={d.draft.emoji} description={d.draft.description}
          visibility={visibility}
          issues={d.issues.pack}
          cardCount={d.draft.cards.length}
          onField={d.setChamp}
          onVisibility={setVisibility}
          onImport={() => {
            if (d.modifie && !confirm(t('editor.importConfirm'))) return
            // On revient à la liste avant d'ouvrir le sélecteur : le compte-rendu
            // d'import s'affiche dans le corps de la page, qu'un panneau plein
            // écran masquerait entièrement.
            setEcran({ vue: 'liste' })
            fichier.current?.click()
          }}
          onExport={exporter}
          onClose={() => setEcran({ vue: 'liste' })}
        />
      )}
    </main>
  )
}
