// Source de vérité du FORMAT d'un pack, partagée par deux appelants :
// l'éditeur (validation à la frappe) et scripts/build-cards.ts (packs
// officiels). Ce module est PUR — aucun accès disque, aucun accès réseau.
// Les erreurs sont structurées et non traduites : elles s'affichent dans l'UI,
// donc c'est l'appelant qui les passe à t().
// Attribut d'import requis : ce module est aussi type-vérifié sous
// tsconfig.node.json (nodenext + package.json en "type": "module"), seul des
// quinze importeurs de config.json dans ce cas — les autres ne vivent que
// sous tsconfig.app.json (bundler), qui n'en a pas besoin.
import config from '../config.json' with { type: 'json' }

const L = config.packs

export type PackCardInput = { name: string; position: string; rating: number }
export type PackInput = {
  name: string
  emoji: string
  description: string
  positions: Record<string, string>
  cards: PackCardInput[]
}
export type OfficialPack = PackInput & { slug: string; sortOrder: number }
// `card` situe une erreur sur une carte sans l'interpoler dans le message : le
// même message sert sous une ligne de l'éditeur (où la ligne est déjà visible)
// et dans un récapitulatif d'import (où il faut nommer la carte).
export type PackError = {
  key: string
  params?: Record<string, string | number>
  card?: number
}

export const CHAMPS_PACK = ['name', 'emoji', 'description', 'positions', 'cards'] as const
const CHAMPS_PACK_OFFICIEL = [...CHAMPS_PACK, 'slug', 'sortOrder'] as const
const CHAMPS_CARTE = ['name', 'position', 'rating'] as const

// Gardes de lecture exportées : `packDraft.ts` lit le même JSON tolérant que
// `parsePackJson`, il a besoin des mêmes primitives.
export const texte = (v: unknown): v is string => typeof v === 'string'
// Lecture tolérante d'un champ texte : ce qui n'est pas une chaîne devient une
// chaîne vide, que les vérificateurs signaleront. Cinq appelants dans
// packDraft.ts, d'où la factorisation.
export const chaine = (v: unknown): string => (texte(v) ? v : '')
export const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
// Postgres compte des caractères (char_length), pas des unités UTF-16 : un
// emoji en occupe deux en JS. Sans ce comptage, l'éditeur refuserait un pack
// que le serveur accepte.
const taille = (s: string) => [...s].length
const borne = (s: string, max: number) => taille(s) >= 1 && taille(s) <= max

// --- Vérificateurs -----------------------------------------------------------
// Une règle = une fonction pure rendant `PackError | null`. C'est l'autorité
// unique du format : `parsePackJson` (voie JSON) et `packDraft.ts` (voie éditeur)
// les appellent tous les deux, donc aucune règle ne peut dériver entre les deux.
// Ils ne connaissent AUCUN numéro de carte : le localisateur `card` est ajouté
// par l'appelant qui, lui, sait où il en est.

export function checkName(v: string): PackError | null {
  return borne(v.trim(), L.nameMaxLength)
    ? null : { key: 'packError.name', params: { max: L.nameMaxLength } }
}

export function checkEmoji(v: string): PackError | null {
  return taille(v) <= L.emojiMaxLength
    ? null : { key: 'packError.emoji', params: { max: L.emojiMaxLength } }
}

export function checkDescription(v: string): PackError | null {
  return taille(v) <= L.descriptionMaxLength
    ? null : { key: 'packError.description', params: { max: L.descriptionMaxLength } }
}

export function checkPositionsCount(n: number): PackError | null {
  return n >= 1 && n <= L.positions.max
    ? null : { key: 'packError.positions', params: { max: L.positions.max } }
}

export function checkPositionCode(code: string): PackError | null {
  return borne(code, L.positions.codeMaxLength)
    ? null : { key: 'packError.positionCode', params: { code, max: L.positions.codeMaxLength } }
}

export function checkPositionLabel(code: string, label: string): PackError | null {
  return borne(label.trim(), L.positions.labelMaxLength)
    ? null : { key: 'packError.positionLabel', params: { code, max: L.positions.labelMaxLength } }
}

export function checkCardsCount(n: number): PackError | null {
  return n >= L.cards.min && n <= L.cards.max
    ? null : { key: 'packError.cardsCount', params: { min: L.cards.min, max: L.cards.max } }
}

export function checkCardName(name: string): PackError | null {
  return borne(name.trim(), L.cards.nameMaxLength)
    ? null : { key: 'packError.cardName', params: { max: L.cards.nameMaxLength } }
}

// `dejaPris` = les noms qui font de celui-ci un doublon. Deux appelants, deux
// façons de le remplir : `parsePackJson` y met les noms des cartes DÉJÀ lues
// (seule la seconde occurrence est fautive, comme aujourd'hui) ; `validateDraft`
// y met les noms présents plus d'une fois (toutes les cartes concernées sont
// alors signalées, ce qui est ce qu'on veut voir dans une liste).
export function checkCardDuplicate(name: string, dejaPris: ReadonlySet<string>): PackError | null {
  return dejaPris.has(name.trim()) ? { key: 'packError.cardDuplicateName' } : null
}

export function checkCardPosition(position: unknown, codes: readonly string[]): PackError | null {
  return texte(position) && codes.includes(position)
    ? null : { key: 'packError.cardUnknownPosition', params: { position: String(position) } }
}

export function checkCardRating(rating: unknown): PackError | null {
  return Number.isInteger(rating)
      && (rating as number) >= L.cards.ratingMin
      && (rating as number) <= L.cards.ratingMax
    ? null : { key: 'packError.cardRating', params: { min: L.cards.ratingMin, max: L.cards.ratingMax } }
}

function parse(text: string, champsConnus: readonly string[]):
  { brut: Record<string, unknown> | null; errors: PackError[] } {
  let brut: unknown
  try {
    brut = JSON.parse(text)
  } catch (e) {
    return { brut: null, errors: [{ key: 'packError.json', params: { message: (e as Error).message } }] }
  }
  if (!estObjet(brut)) return { brut: null, errors: [{ key: 'packError.rootNotObject' }] }
  const errors = Object.keys(brut)
    .filter(k => !champsConnus.includes(k))
    .map(k => ({ key: 'packError.unknownField', params: { field: k } }))
  return { brut, errors }
}

function corps(brut: Record<string, unknown>, errors: PackError[]): PackInput | null {
  const pousser = (e: PackError | null) => { if (e) errors.push(e) }

  const nom = texte(brut.name) ? brut.name.trim() : ''
  pousser(checkName(nom))

  // emoji et description : facultatifs, mais typés — un non-texte est une faute,
  // pas un vide, et les vérificateurs n'acceptent que des chaînes.
  const emoji = brut.emoji === undefined ? '' : texte(brut.emoji) ? brut.emoji : null
  if (emoji === null) errors.push({ key: 'packError.emoji', params: { max: L.emojiMaxLength } })
  else pousser(checkEmoji(emoji))
  const desc = brut.description === undefined ? '' : texte(brut.description) ? brut.description : null
  if (desc === null) errors.push({ key: 'packError.description', params: { max: L.descriptionMaxLength } })
  else pousser(checkDescription(desc))

  // positions
  if (!estObjet(brut.positions)) {
    errors.push({ key: 'packError.positions', params: { max: L.positions.max } })
    return null
  }
  const codes = Object.keys(brut.positions)
  const compte = checkPositionsCount(codes.length)
  if (compte) {
    errors.push(compte)
    // vocabulaire structurellement invalide : inutile d'analyser les cartes,
    // qui produiraient chacune un cardUnknownPosition — jusqu'à 300 messages
    // pour cette seule faute.
    return null
  }
  const positions: Record<string, string> = {}
  for (const code of codes) {
    const eCode = checkPositionCode(code)
    if (eCode) { errors.push(eCode); continue }
    const libelle = brut.positions[code]
    if (!texte(libelle)) {
      errors.push({ key: 'packError.positionLabel', params: { code, max: L.positions.labelMaxLength } })
      continue
    }
    const eLibelle = checkPositionLabel(code, libelle)
    if (eLibelle) { errors.push(eLibelle); continue }
    positions[code] = libelle.trim()
  }

  // cards
  if (!Array.isArray(brut.cards)) {
    errors.push({ key: 'packError.cardsCount', params: { min: L.cards.min, max: L.cards.max } })
    return null
  }
  const compteCartes = checkCardsCount(brut.cards.length)
  if (compteCartes) { errors.push(compteCartes); return null }

  const codesValides = Object.keys(positions)
  const cards: PackCardInput[] = []
  const vus = new Set<string>()
  brut.cards.forEach((c, index) => {
    // Toute erreur de carte porte son localisateur, jamais son numéro dans le
    // message : c'est ce qui rend ces messages affichables sous une ligne.
    const surCarte = (e: PackError | null) => { if (e) errors.push({ ...e, card: index }) }
    if (!estObjet(c)) { surCarte({ key: 'packError.cardNotObject' }); return }
    for (const k of Object.keys(c)) {
      if (!CHAMPS_CARTE.includes(k as typeof CHAMPS_CARTE[number])) {
        surCarte({ key: 'packError.unknownField', params: { field: k } })
      }
    }
    const nomCarte = texte(c.name) ? c.name : ''
    const eNom = checkCardName(nomCarte) ?? checkCardDuplicate(nomCarte, vus)
    surCarte(eNom)
    const ePos = checkCardPosition(c.position, codesValides)
    surCarte(ePos)
    const eNote = checkCardRating(c.rating)
    surCarte(eNote)
    if (eNom || ePos || eNote) return
    vus.add(nomCarte.trim())
    cards.push({ name: nomCarte.trim(), position: c.position as string, rating: c.rating as number })
  })

  if (errors.length > 0) return null
  return { name: nom, emoji: emoji as string, description: desc as string, positions, cards }
}

export function parsePackJson(text: string): { pack: PackInput | null; errors: PackError[] } {
  const { brut, errors } = parse(text, CHAMPS_PACK)
  if (!brut) return { pack: null, errors }
  const pack = corps(brut, errors)
  return { pack: errors.length > 0 ? null : pack, errors }
}

export function parseOfficialPackJson(text: string, fileSlug: string):
  { pack: OfficialPack | null; errors: PackError[] } {
  const { brut, errors } = parse(text, CHAMPS_PACK_OFFICIEL)
  if (!brut) return { pack: null, errors }
  if (brut.slug !== fileSlug) {
    if (brut.slug === undefined) {
      errors.push({ key: 'packError.slugMissing', params: { file: fileSlug } })
    } else {
      errors.push({ key: 'packError.slugMismatch', params: { slug: String(brut.slug), file: fileSlug } })
    }
  }
  if (!Number.isInteger(brut.sortOrder) || (brut.sortOrder as number) < 1) {
    errors.push({ key: 'packError.sortOrder' })
  }
  const pack = corps(brut, errors)
  if (errors.length > 0 || !pack) return { pack: null, errors }
  return { pack: { ...pack, slug: fileSlug, sortOrder: brut.sortOrder as number }, errors }
}

// Cohérence ENTRE fichiers officiels. L'unicité des ids de cartes a disparu
// avec les ids eux-mêmes : c'est match_cards qui protège l'historique.
export function validateOfficialPacks(packs: OfficialPack[]): PackError[] {
  const errors: PackError[] = []
  const slugs = new Set<string>()
  const ordres = new Map<number, string>()
  for (const p of packs) {
    if (slugs.has(p.slug)) errors.push({ key: 'packError.duplicateSlug', params: { slug: p.slug } })
    slugs.add(p.slug)
    const deja = ordres.get(p.sortOrder)
    if (deja) errors.push({ key: 'packError.duplicateSortOrder', params: { slug: p.slug, other: deja } })
    else ordres.set(p.sortOrder, p.slug)
  }
  return errors
}

// Sérialisation canonique : ce que l'éditeur affiche à l'ouverture d'un pack
// existant, et ce que le bouton Exporter télécharge.
export function formatPackJson(pack: PackInput): string {
  return JSON.stringify(pack, null, 2) + '\n'
}

// --- Génération SQL ---------------------------------------------------------
// Le JSON part tel quel vers install_official_pack : même validateur que pour
// les packs de joueurs, donc il est exercé à chaque `db reset`.
// $json$ comme délimiteur : très improbable dans un pack, mais on le vérifie
// quand même — sans ça, un pack qui le contiendrait tronquerait silencieusement
// le SQL généré. Le slug, lui, sort du bloc JSON : c'est un littéral SQL
// classique, donc on l'échappe comme n'importe quelle chaîne SQL.
const quote = (s: string) => `'${s.replaceAll("'", "''")}'`

export function installSql(packs: OfficialPack[]): string {
  return [...packs]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(p => {
      // payload reconstruit champ par champ : slug et sortOrder sont des
      // arguments de la fonction, pas du contenu de pack
      const payload: PackInput = {
        name: p.name, emoji: p.emoji, description: p.description,
        positions: p.positions, cards: p.cards,
      }
      const json = JSON.stringify(payload, null, 2)
      if (json.includes('$json$')) {
        throw new Error(`pack "${p.slug}" : contient le jeton $json$, réservé au dollar-quoting SQL`)
      }
      return `select install_official_pack($json$\n${json}\n$json$::jsonb, ${quote(p.slug)}, ${p.sortOrder});`
    })
    .join('\n\n') + '\n'
}

export function seedSql(packs: OfficialPack[]): string {
  return `-- Fichier généré par \`npm run cards:seed\` — NE PAS ÉDITER.
-- Source de vérité : data/packs/*.json. Modifier un pack puis régénérer.
-- Un test vitest vérifie que ce fichier correspond bien aux JSON.

${installSql(packs)}`
}
