// Source de vérité des cartes : data/packs/<slug>.json.
// Ce module est PUR — aucun accès disque, aucun accès réseau : les I/O vivent
// dans scripts/build-cards.ts. C'est ce qui le rend testable en vitest.

export type PackCard = { id: number; name: string; position: string; rating: number }
export type Pack = { slug: string; sortOrder: number; cards: PackCard[] }

const CHAMPS_PACK: readonly string[] = ['slug', 'sortOrder', 'cards']
const CHAMPS_CARTE: readonly string[] = ['id', 'name', 'position', 'rating']

const entierPositif = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0
const texteNonVide = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// Un champ inconnu est une ERREUR, pas une donnée ignorée : une faute de frappe
// doit se voir. Les caractéristiques multiples viendront par un ajout explicite
// au schéma (cf. §8 du spec).
function champsInconnus(obj: Record<string, unknown>, connus: readonly string[], où: string): string[] {
  return Object.keys(obj)
    .filter(k => !connus.includes(k))
    .map(k => `${où} : champ inconnu "${k}"`)
}

export function parsePackJson(text: string, fileSlug: string): { pack: Pack | null; errors: string[] } {
  const où = `${fileSlug}.json`
  let brut: unknown
  try {
    brut = JSON.parse(text)
  } catch (e) {
    return { pack: null, errors: [`${où} : JSON invalide (${(e as Error).message})`] }
  }
  if (!estObjet(brut)) return { pack: null, errors: [`${où} : la racine doit être un objet`] }

  const errors = champsInconnus(brut, CHAMPS_PACK, où)
  if (brut.slug !== fileSlug) {
    errors.push(`${où} : slug "${String(brut.slug)}" ≠ nom de fichier "${fileSlug}"`)
  }
  if (!entierPositif(brut.sortOrder)) errors.push(`${où} : sortOrder doit être un entier > 0`)
  if (!Array.isArray(brut.cards) || brut.cards.length === 0) {
    errors.push(`${où} : cards doit être un tableau non vide`)
    return { pack: null, errors }
  }

  const cards: PackCard[] = []
  const vus = new Set<number>()
  brut.cards.forEach((c, i) => {
    const oùC = `${où} carte[${i}]`
    if (!estObjet(c)) { errors.push(`${oùC} : doit être un objet`); return }
    errors.push(...champsInconnus(c, CHAMPS_CARTE, oùC))

    let valide = true
    if (!entierPositif(c.id)) { errors.push(`${oùC} : id doit être un entier > 0`); valide = false }
    else if (vus.has(c.id)) { errors.push(`${oùC} : id ${c.id} en doublon dans le pack`); valide = false }
    if (!texteNonVide(c.name)) { errors.push(`${oùC} : name vide`); valide = false }
    if (!texteNonVide(c.position)) { errors.push(`${oùC} : position vide`); valide = false }
    if (!Number.isInteger(c.rating) || (c.rating as number) < 1 || (c.rating as number) > 99) {
      errors.push(`${oùC} : rating doit être un entier entre 1 et 99`); valide = false
    }
    if (!valide) return
    vus.add(c.id as number)
    cards.push({
      id: c.id as number,
      name: (c.name as string).trim(),
      position: (c.position as string).trim(),
      rating: c.rating as number,
    })
  })

  if (errors.length > 0) return { pack: null, errors }
  return { pack: { slug: fileSlug, sortOrder: brut.sortOrder as number, cards }, errors }
}

// Cohérence ENTRE fichiers : c'est ici qu'on protège la règle « un id est unique
// tous packs confondus », parce que match_cards référence cards.id.
export function validatePacks(packs: Pack[]): string[] {
  const errors: string[] = []
  const slugs = new Set<string>()
  const ordres = new Map<number, string>()
  const ids = new Map<number, string>()

  for (const p of packs) {
    if (slugs.has(p.slug)) errors.push(`pack "${p.slug}" : slug en doublon`)
    slugs.add(p.slug)

    const dejaOrdre = ordres.get(p.sortOrder)
    if (dejaOrdre) errors.push(`pack "${p.slug}" : sortOrder ${p.sortOrder} déjà pris par "${dejaOrdre}"`)
    else ordres.set(p.sortOrder, p.slug)

    for (const c of p.cards) {
      const deja = ids.get(c.id)
      if (deja) errors.push(`pack "${p.slug}" : id ${c.id} en doublon, déjà utilisé par "${deja}"`)
      else ids.set(c.id, p.slug)
    }
  }
  return errors
}

// --- Génération SQL ---------------------------------------------------------
// cards.id est `generated always as identity` : sans OVERRIDING SYSTEM VALUE,
// Postgres refuse un id imposé. Et sans le setval final, un éventuel insert sans
// id ailleurs repartirait de 1 et entrerait en collision.

const quote = (s: string) => `'${s.replaceAll("'", "''")}'`

// Ordre déterministe : sans ça, le test de synchronisation du seed deviendrait
// instable au gré de l'ordre de lecture du répertoire.
function ordonner(packs: Pack[]): Pack[] {
  return [...packs]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(p => ({ ...p, cards: [...p.cards].sort((a, b) => a.id - b.id) }))
}

export function upsertSql(packs: Pack[]): string {
  const ordonnes = ordonner(packs)

  const lignesPacks = ordonnes
    .map(p => `  (${quote(p.slug)}, ${p.sortOrder})`)
    .join(',\n')

  const lignesCartes = ordonnes
    .flatMap(p => p.cards.map(c =>
      `  (${c.id}, ${quote(c.name)}, ${quote(c.position)}, ${c.rating}, ${quote(p.slug)})`))
    .join(',\n')

  return `insert into packs (slug, sort_order) values
${lignesPacks}
on conflict (slug) do update set sort_order = excluded.sort_order;

insert into cards (id, name, position, rating, pack) overriding system value values
${lignesCartes}
on conflict (id) do update set
  name = excluded.name,
  position = excluded.position,
  rating = excluded.rating,
  pack = excluded.pack;

select setval(pg_get_serial_sequence('cards', 'id'), (select max(id) from cards));
`
}

export function seedSql(packs: Pack[]): string {
  return `-- Fichier généré par \`npm run cards:seed\` — NE PAS ÉDITER.
-- Source de vérité : data/packs/*.json. Modifier un pack puis régénérer.
-- Un test vitest vérifie que ce fichier correspond bien aux JSON.

${upsertSql(packs)}`
}
