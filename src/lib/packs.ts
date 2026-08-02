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
export type PackError = { key: string; params?: Record<string, string | number> }

const CHAMPS_PACK = ['name', 'emoji', 'description', 'positions', 'cards'] as const
const CHAMPS_PACK_OFFICIEL = [...CHAMPS_PACK, 'slug', 'sortOrder'] as const
const CHAMPS_CARTE = ['name', 'position', 'rating'] as const

const texte = (v: unknown): v is string => typeof v === 'string'
const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
// Postgres compte des caractères (char_length), pas des unités UTF-16 : un
// emoji en occupe deux en JS. Sans ce comptage, l'éditeur refuserait un pack
// que le serveur accepte.
const taille = (s: string) => [...s].length
const borne = (s: string, max: number) => taille(s) >= 1 && taille(s) <= max

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
  // name
  const nom = texte(brut.name) ? brut.name.trim() : ''
  if (!borne(nom, L.nameMaxLength)) {
    errors.push({ key: 'packError.name', params: { max: L.nameMaxLength } })
  }

  // emoji et description : facultatifs
  const emoji = brut.emoji === undefined ? '' : texte(brut.emoji) ? brut.emoji : null
  if (emoji === null || taille(emoji) > L.emojiMaxLength) {
    errors.push({ key: 'packError.emoji', params: { max: L.emojiMaxLength } })
  }
  const desc = brut.description === undefined ? '' : texte(brut.description) ? brut.description : null
  if (desc === null || taille(desc) > L.descriptionMaxLength) {
    errors.push({ key: 'packError.description', params: { max: L.descriptionMaxLength } })
  }

  // positions
  const codes = estObjet(brut.positions) ? Object.keys(brut.positions) : []
  if (!estObjet(brut.positions) || codes.length < 1 || codes.length > L.positions.max) {
    errors.push({ key: 'packError.positions', params: { max: L.positions.max } })
    // vocabulaire structurellement invalide : inutile d'analyser les cartes,
    // qui produiraient chacune un cardUnknownPosition — jusqu'à 300 messages
    // pour cette seule faute.
    return null
  }
  const positions: Record<string, string> = {}
  for (const code of codes) {
    if (!borne(code, L.positions.codeMaxLength)) {
      errors.push({ key: 'packError.positionCode', params: { code, max: L.positions.codeMaxLength } })
      continue
    }
    const libelle = (brut.positions as Record<string, unknown>)[code]
    if (!texte(libelle) || !borne(libelle.trim(), L.positions.labelMaxLength)) {
      errors.push({ key: 'packError.positionLabel', params: { code, max: L.positions.labelMaxLength } })
      continue
    }
    positions[code] = libelle.trim()
  }

  // cards
  if (!Array.isArray(brut.cards) || brut.cards.length < L.cards.min || brut.cards.length > L.cards.max) {
    errors.push({ key: 'packError.cardsCount', params: { min: L.cards.min, max: L.cards.max } })
    return null
  }

  const cards: PackCardInput[] = []
  const vus = new Set<string>()
  brut.cards.forEach((c, index) => {
    if (!estObjet(c)) { errors.push({ key: 'packError.cardNotObject', params: { index } }); return }
    for (const k of Object.keys(c)) {
      if (!CHAMPS_CARTE.includes(k as typeof CHAMPS_CARTE[number])) {
        errors.push({ key: 'packError.cardUnknownField', params: { index, field: k } })
      }
    }
    let valide = true
    const n = texte(c.name) ? c.name.trim() : ''
    if (!borne(n, L.cards.nameMaxLength)) {
      errors.push({ key: 'packError.cardName', params: { index, max: L.cards.nameMaxLength } }); valide = false
    } else if (vus.has(n)) {
      errors.push({ key: 'packError.cardDuplicateName', params: { index, name: n } }); valide = false
    }
    if (!texte(c.position) || !(c.position in positions)) {
      errors.push({ key: 'packError.cardUnknownPosition', params: { index, position: String(c.position) } })
      valide = false
    }
    if (!Number.isInteger(c.rating)
        || (c.rating as number) < L.cards.ratingMin || (c.rating as number) > L.cards.ratingMax) {
      errors.push({ key: 'packError.cardRating', params: { index } }); valide = false
    }
    if (!valide) return
    vus.add(n)
    cards.push({ name: n, position: c.position as string, rating: c.rating as number })
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
