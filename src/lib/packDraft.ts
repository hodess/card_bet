// L'état d'édition d'un pack, et lui seul. Module PUR (aucun accès disque ni
// réseau), donc entièrement testable — c'est le motif déjà employé par
// auctionPhase.ts / useAuctionPhase.ts : la logique ici, l'état React dans le hook.
//
// Il ne redéfinit AUCUNE règle de format : toutes viennent des vérificateurs de
// packs.ts, qui restent l'autorité unique. Ce module ne fait que les appliquer à
// une forme adaptée à l'édition, et ancrer leurs erreurs sur la bonne ligne.
import config from '../config.json'
import {
  CHAMPS_PACK, chaine, checkCardDuplicate, checkCardName, checkCardPosition, checkCardRating,
  checkCardsCount, checkDescription, checkEmoji, checkName, checkPositionCode, checkPositionLabel,
  checkPositionsCount, estObjet, type PackError, type PackInput,
} from './packs'

const L = config.packs

// Une position en cours d'édition. Tableau ordonné et non Record<code, label> :
// on doit pouvoir renommer un code, en avoir deux identiques le temps d'une
// frappe, et garder un ancrage stable pour les erreurs — trois choses qu'un
// objet indexé par le code ne sait pas faire.
export type DraftPosition = { id: string; code: string; label: string }

// `rating: null` = pas encore saisi, ou illisible à l'import. On ne remplace
// jamais une valeur fautive par un chiffre inventé : la ligne est signalée.
export type DraftCard = { id: string; name: string; position: string; rating: number | null }

export type PackDraft = {
  name: string
  emoji: string
  description: string
  positions: DraftPosition[]
  cards: DraftCard[]
}

// Identité locale, jamais envoyée au serveur : elle sert de clé React et de clé
// d'ancrage pour les erreurs. L'index ne peut pas jouer ce rôle, le tri par note
// déplaçant les lignes à chaque changement de note.
export function newId(): string {
  return crypto.randomUUID()
}

export function emptyDraft(): PackDraft {
  return { name: '', emoji: '', description: '', positions: [], cards: [] }
}

// La position est reprise de la carte précédente par l'appelant : en saisie
// enchaînée, on entre tous les attaquants d'affilée sans re-cliquer la chip.
export function newCard(position: string): DraftCard {
  return { id: newId(), name: '', position, rating: L.cards.ratingDefault }
}

export function draftFromPack(pack: PackInput): PackDraft {
  return {
    name: pack.name,
    emoji: pack.emoji,
    description: pack.description,
    positions: Object.entries(pack.positions).map(([code, label]) => ({ id: newId(), code, label })),
    cards: sortDraftCards(pack.cards.map(c => ({ id: newId(), ...c }))),
  }
}

// Le tri de l'éditeur est celui de tout le reste de l'app (aperçu de /packs,
// listPackCards côté serveur) : note décroissante puis nom. Il n'y a donc qu'un
// seul ordre dans lequel on voit un pack, et l'export est déterministe.
export function sortDraftCards(cards: readonly DraftCard[]): DraftCard[] {
  return [...cards].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name))
}

// Zéro compris : le panneau Positions affiche « 0 carte » en face d'une position
// inutilisée, c'est ce qui rend lisible le refus de suppression d'une position
// utilisée.
export function positionCounts(draft: PackDraft): Record<string, number> {
  const compte: Record<string, number> = {}
  for (const p of draft.positions) compte[p.code] = 0
  for (const c of draft.cards) if (c.position in compte) compte[c.position] += 1
  return compte
}

// Pour le sous-titre de l'en-tête (`packs.summary`). `null` tant qu'aucune note
// n'est saisie : Math.min d'un tableau vide vaut Infinity.
export function ratingRange(cards: readonly DraftCard[]): { min: number; max: number } | null {
  const notes = cards.map(c => c.rating).filter((n): n is number => n !== null)
  if (notes.length === 0) return null
  return { min: Math.min(...notes), max: Math.max(...notes) }
}

// --- Diagnostics -------------------------------------------------------------
// Les erreurs sont ancrées par id (et par champ pour les cartes) : c'est ce qui
// permet de les afficher sous la bonne ligne alors que le tri par note déplace
// les lignes en permanence.

export type CardIssues = { name?: PackError; position?: PackError; rating?: PackError }
export type PositionIssues = { code?: PackError; label?: PackError }
export type PackIssues = {
  name?: PackError; emoji?: PackError; description?: PackError
  positions?: PackError; cards?: PackError
}
export type DraftIssues = {
  pack: PackIssues
  positions: Record<string, PositionIssues>
  cards: Record<string, CardIssues>
  count: number
}

// Les noms présents plus d'une fois. On signale ainsi TOUTES les cartes d'un
// doublon, et pas seulement la seconde : dans une liste triée par note, la
// « première » occurrence n'a aucun sens visuel.
export function duplicateNames(cards: readonly DraftCard[]): Set<string> {
  const vus = new Set<string>()
  const doublons = new Set<string>()
  for (const c of cards) {
    const n = c.name.trim()
    if (vus.has(n)) doublons.add(n)
    vus.add(n)
  }
  return doublons
}

// Les noms des AUTRES cartes — ce que passe la feuille de saisie. L'exclusion par
// id couvre les deux cas sans branche : une carte déjà dans le brouillon s'exclut
// elle-même, une carte en cours de saisie n'y est pas encore.
export function otherNames(cards: readonly DraftCard[], id: string): Set<string> {
  return new Set(cards.filter(c => c.id !== id).map(c => c.name.trim()))
}

// La brique unique de validation d'une carte, appelée par validateDraft ET par la
// feuille de saisie. Le nom manquant passe avant le doublon : deux cartes vides
// sont « en double » au sens strict, mais le message utile est que le nom manque.
export function validateCard(card: DraftCard, codes: readonly string[],
                             dejaPris: ReadonlySet<string>): CardIssues {
  const issues: CardIssues = {}
  const nom = checkCardName(card.name) ?? checkCardDuplicate(card.name, dejaPris)
  if (nom) issues.name = nom
  const position = checkCardPosition(card.position, codes)
  if (position) issues.position = position
  const rating = checkCardRating(card.rating)
  if (rating) issues.rating = rating
  return issues
}

export function validateDraft(draft: PackDraft): DraftIssues {
  const issues: DraftIssues = { pack: {}, positions: {}, cards: {}, count: 0 }
  const noter = (e: PackError | null, poser: (e: PackError) => void) => {
    if (e) { poser(e); issues.count += 1 }
  }

  noter(checkName(draft.name), e => { issues.pack.name = e })
  noter(checkEmoji(draft.emoji), e => { issues.pack.emoji = e })
  noter(checkDescription(draft.description), e => { issues.pack.description = e })
  noter(checkPositionsCount(draft.positions.length), e => { issues.pack.positions = e })
  noter(checkCardsCount(draft.cards.length), e => { issues.pack.cards = e })

  // Le doublon de code n'a pas d'équivalent côté JSON (deux clés identiques dans
  // un objet : la dernière gagne, sans un mot) mais il est atteignable ici.
  const codesVus = new Set<string>()
  for (const p of draft.positions) {
    const pi: PositionIssues = {}
    const code = checkPositionCode(p.code)
      ?? (codesVus.has(p.code)
        ? { key: 'packError.positionDuplicate', params: { code: p.code } }
        : null)
    codesVus.add(p.code)
    if (code) { pi.code = code; issues.count += 1 }
    const label = checkPositionLabel(p.code, p.label)
    if (label) { pi.label = label; issues.count += 1 }
    if (pi.code || pi.label) issues.positions[p.id] = pi
  }

  const codes = draft.positions.map(p => p.code)
  const doublons = duplicateNames(draft.cards)
  for (const c of draft.cards) {
    const ci = validateCard(c, codes, doublons)
    const n = Object.keys(ci).length
    if (n > 0) { issues.cards[c.id] = ci; issues.count += n }
  }

  return issues
}

// Le payload envoyé à save_pack : exactement le même format qu'avant ce chantier.
// `null` dès qu'une erreur subsiste — l'appelant n'a pas à revérifier.
export function toPackInput(draft: PackDraft): PackInput | null {
  if (validateDraft(draft).count > 0) return null
  const positions: Record<string, string> = {}
  for (const p of draft.positions) positions[p.code] = p.label.trim()
  return {
    name: draft.name.trim(),
    emoji: draft.emoji,
    description: draft.description,
    positions,
    cards: sortDraftCards(draft.cards).map(c => ({
      name: c.name.trim(),
      position: c.position,
      // garanti entier borné par validateDraft ci-dessus
      rating: c.rating as number,
    })),
  }
}

// --- Import de fichier -------------------------------------------------------

function lireCarte(brut: unknown): DraftCard {
  // Une entrée illisible devient une ligne vide à corriger, pas une carte perdue :
  // l'auteur voit qu'il manque quelque chose au lieu de compter ses cartes.
  if (!estObjet(brut)) return { id: newId(), name: '', position: '', rating: null }
  return {
    id: newId(),
    name: chaine(brut.name),
    position: chaine(brut.position),
    // pas de coercition : une note illisible reste absente, et se signale
    rating: Number.isInteger(brut.rating) ? brut.rating as number : null,
  }
}

// Import TOLÉRANT, par opposition au parsePackJson tout-ou-rien : un fichier
// lisible entre en entier dans le brouillon, cartes fautives comprises, et c'est
// validateDraft qui les signale ligne par ligne. On ne refuse en bloc que
// l'ininterprétable — sans vocabulaire de positions, aucune carte n'a de sens.
export function draftFromJson(text: string): { draft: PackDraft | null; errors: PackError[] } {
  let brut: unknown
  try {
    brut = JSON.parse(text)
  } catch (e) {
    return { draft: null, errors: [{ key: 'packError.json', params: { message: (e as Error).message } }] }
  }
  if (!estObjet(brut)) return { draft: null, errors: [{ key: 'packError.rootNotObject' }] }
  if (!estObjet(brut.positions)) {
    return { draft: null, errors: [{ key: 'packError.positions', params: { max: L.positions.max } }] }
  }

  const errors: PackError[] = Object.keys(brut)
    .filter(k => !CHAMPS_PACK.includes(k as typeof CHAMPS_PACK[number]))
    .map(k => ({ key: 'packError.unknownField', params: { field: k } }))

  const brutes = Array.isArray(brut.cards) ? brut.cards : []
  const draft: PackDraft = {
    name: chaine(brut.name),
    emoji: chaine(brut.emoji),
    description: chaine(brut.description),
    positions: Object.entries(brut.positions)
      .map(([code, label]) => ({ id: newId(), code, label: chaine(label) })),
    cards: sortDraftCards(brutes.map(lireCarte)),
  }
  return { draft, errors }
}

// --- Mutations ---------------------------------------------------------------
// Toutes rendent un nouveau brouillon (ou le même objet quand rien ne change,
// ce qui évite un rendu inutile côté React).

// Renommer un code PROPAGE aux cartes qui l'utilisent : sans ça, renommer A en
// ATT rendrait fautives d'un coup toutes les cartes de cette position.
export function renamePosition(draft: PackDraft, id: string, code: string): PackDraft {
  const avant = draft.positions.find(p => p.id === id)
  if (!avant) return draft
  return {
    ...draft,
    positions: draft.positions.map(p => (p.id === id ? { ...p, code } : p)),
    cards: draft.cards.map(c => (c.position === avant.code ? { ...c, position: code } : c)),
  }
}

export function setPositionLabel(draft: PackDraft, id: string, label: string): PackDraft {
  return { ...draft, positions: draft.positions.map(p => (p.id === id ? { ...p, label } : p)) }
}

export function addPosition(draft: PackDraft): PackDraft {
  return { ...draft, positions: [...draft.positions, { id: newId(), code: '', label: '' }] }
}

// Deux refus explicites plutôt que des dégâts silencieux. Le panneau affiche le
// nombre de cartes par position, donc le refus se comprend sans explication.
export function removePosition(draft: PackDraft, id: string):
  { draft: PackDraft; error: PackError | null } {
  const cible = draft.positions.find(p => p.id === id)
  if (!cible) return { draft, error: null }
  // La borne vient de l'autorité (checkPositionsCount), pas d'un `<= 1` réécrit
  // ici : une seule définition de « de 1 à 12 positions » dans tout le projet.
  // Le message, lui, reste spécifique au geste refusé.
  if (checkPositionsCount(draft.positions.length - 1)) {
    return { draft, error: { key: 'packError.positionLast' } }
  }
  const utilisee = draft.cards.filter(c => c.position === cible.code).length
  if (utilisee > 0) {
    return {
      draft,
      error: utilisee === 1
        ? { key: 'packError.positionInUseOne', params: { code: cible.code } }
        : { key: 'packError.positionInUse', params: { code: cible.code, count: utilisee } },
    }
  }
  return { draft: { ...draft, positions: draft.positions.filter(p => p.id !== id) }, error: null }
}

// Ajoute ou remplace selon l'id : la feuille de saisie n'a pas à savoir dans
// lequel des deux modes elle se trouve.
export function saveCard(draft: PackDraft, card: DraftCard): PackDraft {
  const existe = draft.cards.some(c => c.id === card.id)
  const cards = existe ? draft.cards.map(c => (c.id === card.id ? card : c)) : [...draft.cards, card]
  return { ...draft, cards: sortDraftCards(cards) }
}

export function removeCard(draft: PackDraft, id: string): PackDraft {
  return { ...draft, cards: draft.cards.filter(c => c.id !== id) }
}

// --- Récapitulatif -----------------------------------------------------------

// Où envoyer l'utilisateur pour corriger une erreur donnée. C'est cette
// information qui rend le bandeau du bas cliquable au lieu d'être décoratif.
export type IssueTarget =
  | { kind: 'list' }
  | { kind: 'settings' }
  | { kind: 'positions'; id?: string }
  | { kind: 'card'; id: string }

// `label` nomme l'objet fautif (nom de carte, code de position) : c'est une
// donnée saisie par l'auteur, elle ne passe pas par t().
export type FlatIssue = { error: PackError; target: IssueTarget; label: string }

// Les erreurs à plat, dans l'ordre où on les corrige : l'identité du pack, le
// compte de cartes, le vocabulaire, puis les cartes dans l'ordre où la liste les
// affiche (et non dans l'ordre du tableau, qui n'a pas de sens visuel).
export function flattenIssues(draft: PackDraft, issues: DraftIssues): FlatIssue[] {
  const plat: FlatIssue[] = []

  for (const champ of ['name', 'emoji', 'description'] as const) {
    const e = issues.pack[champ]
    if (e) plat.push({ error: e, target: { kind: 'settings' }, label: '' })
  }
  if (issues.pack.cards) {
    plat.push({ error: issues.pack.cards, target: { kind: 'list' }, label: '' })
  }
  if (issues.pack.positions) {
    plat.push({ error: issues.pack.positions, target: { kind: 'positions' }, label: '' })
  }

  for (const p of draft.positions) {
    const pi = issues.positions[p.id]
    if (!pi) continue
    for (const e of [pi.code, pi.label]) {
      if (e) plat.push({ error: e, target: { kind: 'positions', id: p.id }, label: p.code })
    }
  }

  for (const c of sortDraftCards(draft.cards)) {
    const ci = issues.cards[c.id]
    if (!ci) continue
    for (const e of [ci.name, ci.position, ci.rating]) {
      if (e) plat.push({ error: e, target: { kind: 'card', id: c.id }, label: c.name })
    }
  }

  return plat
}

// --- Export ------------------------------------------------------------------

// Le brouillon sérialisé TEL QU'IL EST, valide ou non. C'est le pendant de
// draftFromJson, et c'est ce que télécharge « Exporter .json » : on doit pouvoir
// sortir un pack en cours pour le finir ailleurs. Une note pas encore saisie sort
// en `null` — surtout pas en 0, qui serait une note inventée, donc exactement la
// réparation muette qu'on a écartée. Sur un brouillon valide, le résultat est
// identique à formatPackJson(toPackInput(draft)), ce qu'un test verrouille.
export function draftToJson(draft: PackDraft): string {
  const positions: Record<string, string> = {}
  for (const p of draft.positions) positions[p.code] = p.label.trim()
  return JSON.stringify({
    name: draft.name.trim(),
    emoji: draft.emoji,
    description: draft.description,
    positions,
    cards: sortDraftCards(draft.cards).map(c => ({
      name: c.name.trim(), position: c.position, rating: c.rating,
    })),
  }, null, 2) + '\n'
}
