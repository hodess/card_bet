import { describe, expect, it } from 'vitest'
import { parsePackJson, seedSql, upsertSql, validatePacks, type Pack } from './packs'

const CARTE = { id: 1, name: 'Kylian Mbappé', position: 'ATT', rating: 91 }
const PACK = { slug: 'football', sortOrder: 1, cards: [CARTE] }
const json = (o: unknown) => JSON.stringify(o)

describe('parsePackJson', () => {
  it('accepte un pack valide', () => {
    const { pack, errors } = parsePackJson(json(PACK), 'football')
    expect(errors).toEqual([])
    expect(pack).toEqual(PACK)
  })

  it('rejette un JSON mal formé en citant le fichier', () => {
    const { pack, errors } = parsePackJson('{ pas du json', 'football')
    expect(pack).toBeNull()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('football.json')
  })

  it("rejette une racine qui n'est pas un objet", () => {
    expect(parsePackJson('[]', 'football').pack).toBeNull()
    expect(parsePackJson('42', 'football').pack).toBeNull()
  })

  it('rejette un slug qui ne correspond pas au nom de fichier', () => {
    const { errors } = parsePackJson(json({ ...PACK, slug: 'foot' }), 'football')
    expect(errors.some(e => e.includes('nom de fichier'))).toBe(true)
  })

  it('rejette un champ inconnu au niveau du pack', () => {
    const { errors } = parsePackJson(json({ ...PACK, auteur: 'moi' }), 'football')
    expect(errors.some(e => e.includes('auteur'))).toBe(true)
  })

  it("rejette un champ inconnu au niveau d'une carte — le futur \"stats\" inclus", () => {
    const cards = [{ ...CARTE, stats: { pac: 97 } }]
    const { errors } = parsePackJson(json({ ...PACK, cards }), 'football')
    expect(errors.some(e => e.includes('stats'))).toBe(true)
  })

  it('rejette un sortOrder non entier', () => {
    const { errors } = parsePackJson(json({ ...PACK, sortOrder: 1.5 }), 'football')
    expect(errors.some(e => e.includes('sortOrder'))).toBe(true)
  })

  it('rejette une liste de cartes vide ou absente', () => {
    expect(parsePackJson(json({ ...PACK, cards: [] }), 'football').pack).toBeNull()
    expect(parsePackJson(json({ slug: 'football', sortOrder: 1 }), 'football').pack).toBeNull()
  })

  it('rejette une note hors 1–99 ou non entière', () => {
    for (const rating of [0, 100, 91.5, '91']) {
      const { errors } = parsePackJson(json({ ...PACK, cards: [{ ...CARTE, rating }] }), 'football')
      expect(errors.some(e => e.includes('rating'))).toBe(true)
    }
  })

  it('rejette un id non entier ou négatif', () => {
    for (const id of [0, -1, 1.5, '1']) {
      const { errors } = parsePackJson(json({ ...PACK, cards: [{ ...CARTE, id }] }), 'football')
      expect(errors.some(e => e.includes('id'))).toBe(true)
    }
  })

  it('rejette un name ou une position vide', () => {
    for (const champ of ['name', 'position']) {
      const { errors } = parsePackJson(json({ ...PACK, cards: [{ ...CARTE, [champ]: '  ' }] }), 'football')
      expect(errors.some(e => e.includes(champ))).toBe(true)
    }
  })

  it("rejette un id en doublon dans le même pack", () => {
    const cards = [CARTE, { ...CARTE, name: 'Autre' }]
    const { errors } = parsePackJson(json({ ...PACK, cards }), 'football')
    expect(errors.some(e => e.includes('doublon'))).toBe(true)
  })

  it("situe l'erreur sur la bonne carte", () => {
    const cards = [CARTE, { ...CARTE, id: 2, rating: 200 }]
    const { errors } = parsePackJson(json({ ...PACK, cards }), 'football')
    expect(errors.some(e => e.includes('carte[1]'))).toBe(true)
  })
})

describe('validatePacks', () => {
  const naruto: Pack = {
    slug: 'naruto', sortOrder: 2,
    cards: [{ id: 1000, name: 'Naruto Uzumaki', position: 'NIN', rating: 92 }],
  }

  it('accepte des packs cohérents', () => {
    expect(validatePacks([PACK, naruto])).toEqual([])
  })

  it('refuse un id réutilisé entre deux packs', () => {
    const collision = { ...naruto, cards: [{ ...naruto.cards[0], id: 1 }] }
    const errs = validatePacks([PACK, collision])
    expect(errs.some(e => e.includes('1') && e.includes('doublon'))).toBe(true)
  })

  it('refuse deux packs de même slug', () => {
    expect(validatePacks([PACK, { ...naruto, slug: 'football' }]).length).toBeGreaterThan(0)
  })

  it('refuse deux packs de même sortOrder', () => {
    expect(validatePacks([PACK, { ...naruto, sortOrder: 1 }]).length).toBeGreaterThan(0)
  })
})

const PACKS: Pack[] = [
  { slug: 'football', sortOrder: 1, cards: [
    { id: 1, name: 'Kylian Mbappé', position: 'ATT', rating: 91 },
    { id: 2, name: "N'Golo Kanté", position: 'MID', rating: 85 },
  ] },
  { slug: 'naruto', sortOrder: 2, cards: [
    { id: 1000, name: 'Naruto Uzumaki', position: 'NIN', rating: 92 },
  ] },
]

describe('upsertSql', () => {
  const sql = upsertSql(PACKS)

  it("insère les packs avant les cartes (contrainte de clé étrangère)", () => {
    expect(sql.indexOf('insert into packs')).toBeLessThan(sql.indexOf('insert into cards'))
  })

  it("impose les ids malgré l'identity de cards.id", () => {
    expect(sql).toContain('overriding system value')
  })

  it("est additif : on conflict do update, jamais de delete", () => {
    expect(sql).toContain('on conflict (slug) do update')
    expect(sql).toContain('on conflict (id) do update')
    expect(sql.toLowerCase()).not.toContain('delete')
    expect(sql.toLowerCase()).not.toContain('truncate')
  })

  it("échappe les apostrophes des noms", () => {
    expect(sql).toContain("'N''Golo Kanté'")
  })

  it("rattache chaque carte à son pack", () => {
    expect(sql).toContain("(1, 'Kylian Mbappé', 'ATT', 91, 'football')")
    expect(sql).toContain("(1000, 'Naruto Uzumaki', 'NIN', 92, 'naruto')")
  })

  it("resynchronise la séquence de cards.id", () => {
    expect(sql).toContain("setval(pg_get_serial_sequence('cards', 'id')")
  })

  it("trie les packs par sortOrder et les cartes par id", () => {
    const desordre = [PACKS[1], PACKS[0]]
    expect(upsertSql(desordre)).toBe(sql)
  })
})

describe('seedSql', () => {
  it("préfixe un en-tête qui interdit l'édition manuelle", () => {
    const s = seedSql(PACKS)
    expect(s.startsWith('--')).toBe(true)
    expect(s).toContain('cards:seed')
    expect(s).toContain('data/packs')
  })

  it("contient exactement le SQL de upsertSql", () => {
    expect(seedSql(PACKS)).toContain(upsertSql(PACKS))
  })

  it("se termine par un saut de ligne", () => {
    expect(seedSql(PACKS).endsWith('\n')).toBe(true)
  })
})

import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Chemins ancrés sur le fichier de test, pas sur le cwd : le test reste juste
// quel que soit l'endroit d'où vitest est lancé.
const RACINE = fileURLToPath(new URL('../..', import.meta.url))
const DOSSIER_PACKS = join(RACINE, 'data/packs')

// Chargé une fois, réutilisé par le test de synchronisation de la tâche 5.
function chargerVraisPacks(): { packs: Pack[]; errors: string[] } {
  const fichiers = readdirSync(DOSSIER_PACKS).filter(f => f.endsWith('.json')).sort()
  const packs: Pack[] = []
  const errors: string[] = []
  for (const f of fichiers) {
    const { pack, errors: errs } = parsePackJson(readFileSync(join(DOSSIER_PACKS, f), 'utf8'), basename(f, '.json'))
    errors.push(...errs)
    if (pack) packs.push(pack)
  }
  errors.push(...validatePacks(packs))
  return { packs, errors }
}

describe('data/packs/*.json', () => {
  const { packs, errors } = chargerVraisPacks()

  it('sont tous valides', () => {
    expect(errors).toEqual([])
  })

  it('contiennent au moins le pack football', () => {
    expect(packs.map(p => p.slug)).toContain('football')
  })

  it('football a bien ses 40 cartes historiques, ids 1 à 40', () => {
    const football = packs.find(p => p.slug === 'football')
    expect(football?.cards).toHaveLength(40)
    expect(football?.cards.map(c => c.id)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1))
  })

  it('respectent les plages d’ids par pack (football 1–999)', () => {
    const football = packs.find(p => p.slug === 'football')
    expect(football?.cards.every(c => c.id >= 1 && c.id <= 999)).toBe(true)
  })
})

describe('supabase/seed.sql', () => {
  it('correspond exactement aux data/packs/*.json', () => {
    const { packs } = chargerVraisPacks()
    const attendu = seedSql(packs)
    const actuel = readFileSync(join(RACINE, 'supabase/seed.sql'), 'utf8')
    // Message explicite : sans lui, un diff de 40 lignes est illisible.
    expect(actuel, 'seed.sql désynchronisé — lancer `npm run cards:seed`').toBe(attendu)
  })
})
