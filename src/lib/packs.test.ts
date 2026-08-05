import { describe, expect, it } from 'vitest'
import {
  checkCardDuplicate, checkCardName, checkCardPosition, checkCardRating, checkCardsCount,
  checkDescription, checkEmoji, checkName, checkPositionCode, checkPositionLabel,
  checkPositionsCount,
  formatPackJson, installSql, parseOfficialPackJson, parsePackJson, seedSql,
  validateOfficialPacks, type OfficialPack, type PackError, type PackInput,
} from './packs'

const PACK: PackInput = {
  name: 'Pokémon Gen 1',
  emoji: '⚡',
  description: 'Les 151 originaux.',
  positions: { FEU: 'Feu', EAU: 'Eau' },
  cards: [
    { name: 'Dracaufeu', position: 'FEU', rating: 92 },
    { name: 'Tortank', position: 'EAU', rating: 88 },
  ],
}
const json = (o: unknown) => JSON.stringify(o)
const cles = (errors: { key: string }[]) => errors.map(e => e.key)

describe('vérificateurs', () => {
  it('checkName borne le nom du pack sur sa forme rognée', () => {
    expect(checkName('Mon pack')).toBeNull()
    expect(checkName('  ')?.key).toBe('packError.name')
    expect(checkName('x'.repeat(41))?.key).toBe('packError.name')
    expect(checkName('x'.repeat(40))).toBeNull()
  })

  it('checkEmoji et checkDescription acceptent le vide (champs facultatifs)', () => {
    expect(checkEmoji('')).toBeNull()
    expect(checkDescription('')).toBeNull()
    expect(checkEmoji('🌀🌀🌀🌀🌀')).toBeNull() // 5 caractères, pas 10 unités UTF-16
    expect(checkEmoji('x'.repeat(9))?.key).toBe('packError.emoji')
    expect(checkDescription('x'.repeat(201))?.key).toBe('packError.description')
  })

  it('checkPositionsCount exige de 1 à 12 positions', () => {
    expect(checkPositionsCount(0)?.key).toBe('packError.positions')
    expect(checkPositionsCount(1)).toBeNull()
    expect(checkPositionsCount(12)).toBeNull()
    expect(checkPositionsCount(13)?.key).toBe('packError.positions')
  })

  it('checkPositionCode et checkPositionLabel bornent le vocabulaire', () => {
    expect(checkPositionCode('ATT')).toBeNull()
    expect(checkPositionCode('')?.key).toBe('packError.positionCode')
    expect(checkPositionCode('TROPLONG')?.key).toBe('packError.positionCode')
    expect(checkPositionLabel('A', 'Attaquant')).toBeNull()
    expect(checkPositionLabel('A', '  ')?.key).toBe('packError.positionLabel')
    // le code voyage dans les params : le message le nomme
    expect(checkPositionLabel('A', '')?.params?.code).toBe('A')
  })

  it('checkCardsCount exige de 2 à 300 cartes', () => {
    expect(checkCardsCount(1)?.key).toBe('packError.cardsCount')
    expect(checkCardsCount(2)).toBeNull()
    expect(checkCardsCount(300)).toBeNull()
    expect(checkCardsCount(301)?.key).toBe('packError.cardsCount')
  })

  it('checkCardName borne le nom sur sa forme rognée', () => {
    expect(checkCardName('  Dracaufeu  ')).toBeNull()
    expect(checkCardName('   ')?.key).toBe('packError.cardName')
    expect(checkCardName('x'.repeat(41))?.key).toBe('packError.cardName')
  })

  it('checkCardDuplicate compare sur la forme rognée', () => {
    const pris = new Set(['Dracaufeu'])
    expect(checkCardDuplicate('  Dracaufeu  ', pris)?.key).toBe('packError.cardDuplicateName')
    expect(checkCardDuplicate('Tortank', pris)).toBeNull()
    expect(checkCardDuplicate('Dracaufeu', new Set())).toBeNull()
  })

  it('checkCardPosition exige un code du vocabulaire', () => {
    expect(checkCardPosition('FEU', ['FEU', 'EAU'])).toBeNull()
    expect(checkCardPosition('SAN', ['FEU'])?.key).toBe('packError.cardUnknownPosition')
    expect(checkCardPosition(undefined, ['FEU'])?.params?.position).toBe('undefined')
  })

  it('checkCardPosition refuse un nom hérité d’Object.prototype', () => {
    // L'ancienne implémentation utilisait `position in positions`, qui remonte la
    // chaîne de prototype et acceptait donc ces noms. Le serveur, lui, teste
    // l'appartenance avec l'opérateur `?` de Postgres, qui ne voit que les clés
    // réelles : c'est ce comportement-ci qui est aligné.
    for (const herite of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(checkCardPosition(herite, ['FEU'])?.key).toBe('packError.cardUnknownPosition')
    }
  })

  it('checkCardRating exige un entier de 1 à 99', () => {
    expect(checkCardRating(50)).toBeNull()
    expect(checkCardRating(1)).toBeNull()
    expect(checkCardRating(99)).toBeNull()
    for (const mauvais of [0, 100, 91.5, '91', null, undefined, NaN]) {
      expect(checkCardRating(mauvais)?.key).toBe('packError.cardRating')
    }
  })

  it('aucun vérificateur n’interpole de numéro de carte dans son message', () => {
    const erreurs = [
      checkCardName(''), checkCardRating(0), checkCardPosition('X', []),
      checkCardDuplicate('a', new Set(['a'])),
    ]
    // `?? {}` : checkCardDuplicate ne pose pas de `params` du tout, et
    // `toHaveProperty` ne s'appelle pas sur `undefined`.
    for (const e of erreurs) expect(e?.params ?? {}).not.toHaveProperty('index')
  })
})

describe('parsePackJson', () => {
  it('accepte un pack valide', () => {
    const { pack, errors } = parsePackJson(json(PACK))
    expect(errors).toEqual([])
    expect(pack).toEqual(PACK)
  })

  it('complète les champs facultatifs absents', () => {
    const { pack } = parsePackJson(json({ ...PACK, emoji: undefined, description: undefined }))
    expect(pack?.emoji).toBe('')
    expect(pack?.description).toBe('')
  })

  it('rejette un JSON mal formé', () => {
    const { pack, errors } = parsePackJson('{ pas du json')
    expect(pack).toBeNull()
    expect(cles(errors)).toContain('packError.json')
  })

  it("rejette une racine qui n'est pas un objet", () => {
    expect(parsePackJson('[]').pack).toBeNull()
    expect(parsePackJson('42').pack).toBeNull()
  })

  it('rejette un champ inconnu au niveau du pack', () => {
    const { errors } = parsePackJson(json({ ...PACK, auteur: 'moi' }))
    expect(cles(errors)).toContain('packError.unknownField')
    expect(errors[0].params?.field).toBe('auteur')
  })

  it('rejette un champ inconnu au niveau d’une carte', () => {
    const cards = [{ ...PACK.cards[0], stats: { pac: 97 } }, PACK.cards[1]]
    const { errors } = parsePackJson(json({ ...PACK, cards }))
    // même clé qu'au niveau du pack : c'est le localisateur qui distingue
    expect(cles(errors)).toContain('packError.unknownField')
    expect(errors[0].card).toBe(0)
  })

  it('rejette un nom de pack vide ou trop long', () => {
    expect(cles(parsePackJson(json({ ...PACK, name: '  ' })).errors)).toContain('packError.name')
    expect(cles(parsePackJson(json({ ...PACK, name: 'x'.repeat(41) })).errors)).toContain('packError.name')
  })

  it('rejette un emoji trop long', () => {
    expect(cles(parsePackJson(json({ ...PACK, emoji: 'x'.repeat(9) })).errors)).toContain('packError.emoji')
  })

  it('accepte un emoji de 5 caractères non-BMP (chaque emoji occupe 2 unités UTF-16)', () => {
    // Postgres compte des caractères (char_length) : 5 emojis = 5 caractères,
    // bien en dessous de emojiMaxLength (8) — même si `.length` en JS vaudrait 10.
    const { pack, errors } = parsePackJson(json({ ...PACK, emoji: '🌀🌀🌀🌀🌀' }))
    expect(cles(errors)).not.toContain('packError.emoji')
    expect(pack?.emoji).toBe('🌀🌀🌀🌀🌀')
  })

  it('rejette une description trop longue', () => {
    expect(cles(parsePackJson(json({ ...PACK, description: 'x'.repeat(201) })).errors))
      .toContain('packError.description')
  })

  it('rejette un vocabulaire de positions vide ou trop grand', () => {
    expect(cles(parsePackJson(json({ ...PACK, positions: {} })).errors)).toContain('packError.positions')
    const trop = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`P${i}`, 'x']))
    expect(cles(parsePackJson(json({ ...PACK, positions: trop })).errors)).toContain('packError.positions')
  })

  it('ne cascade pas un cardUnknownPosition par carte quand le vocabulaire est structurellement invalide', () => {
    const cards = Array.from({ length: 300 }, (_, i) => ({ name: `C${i}`, position: 'FEU', rating: 50 }))
    const { errors } = parsePackJson(json({ ...PACK, positions: {}, cards }))
    expect(errors).toEqual([{ key: 'packError.positions', params: { max: 12 } }])
  })

  it('rejette un code de position trop long', () => {
    const { errors } = parsePackJson(json({ ...PACK, positions: { TROPLONGCODE: 'x', EAU: 'Eau' } }))
    expect(cles(errors)).toContain('packError.positionCode')
  })

  it('rejette un libellé de position vide', () => {
    const { errors } = parsePackJson(json({ ...PACK, positions: { FEU: '  ', EAU: 'Eau' } }))
    expect(cles(errors)).toContain('packError.positionLabel')
  })

  it('canonicalise les libellés de positions et les noms de cartes (trim)', () => {
    const { pack } = parsePackJson(json({
      ...PACK,
      positions: { FEU: '  Feu  ', EAU: 'Eau' },
      cards: [{ name: '  Dracaufeu  ', position: 'FEU', rating: 92 }, PACK.cards[1]],
    }))
    expect(pack?.positions.FEU).toBe('Feu')
    expect(pack?.cards[0].name).toBe('Dracaufeu')
  })

  it('rejette une carte qui n’est pas un objet', () => {
    const { errors } = parsePackJson(json({ ...PACK, cards: ['pas un objet', PACK.cards[1]] }))
    expect(cles(errors)).toContain('packError.cardNotObject')
    expect(errors[0].card).toBe(0)
  })

  it('rejette une position de carte hors du vocabulaire', () => {
    const cards = [{ name: 'X', position: 'SAN', rating: 50 }, PACK.cards[1]]
    const { errors } = parsePackJson(json({ ...PACK, cards }))
    expect(cles(errors)).toContain('packError.cardUnknownPosition')
    expect(errors[0].card).toBe(0)
    expect(errors[0].params?.position).toBe('SAN')
  })

  it('rejette une note hors 1–99 ou non entière', () => {
    for (const rating of [0, 100, 91.5, '91']) {
      const cards = [{ ...PACK.cards[0], rating }, PACK.cards[1]]
      expect(cles(parsePackJson(json({ ...PACK, cards })).errors)).toContain('packError.cardRating')
    }
  })

  it('rejette deux cartes de même nom', () => {
    const cards = [PACK.cards[0], { ...PACK.cards[1], name: 'Dracaufeu' }]
    expect(cles(parsePackJson(json({ ...PACK, cards })).errors)).toContain('packError.cardDuplicateName')
  })

  it('rejette moins de 2 ou plus de 300 cartes', () => {
    expect(cles(parsePackJson(json({ ...PACK, cards: [PACK.cards[0]] })).errors)).toContain('packError.cardsCount')
    const trop = Array.from({ length: 301 }, (_, i) => ({ name: `C${i}`, position: 'FEU', rating: 50 }))
    expect(cles(parsePackJson(json({ ...PACK, cards: trop })).errors)).toContain('packError.cardsCount')
  })

  it("situe l'erreur sur la bonne carte", () => {
    const cards = [PACK.cards[0], { ...PACK.cards[1], rating: 200 }]
    const { errors } = parsePackJson(json({ ...PACK, cards }))
    expect(errors[0].card).toBe(1)
  })

  it('ne met jamais le numéro de carte dans les params du message', () => {
    const cards = [PACK.cards[0], { ...PACK.cards[1], rating: 200 }]
    const { errors } = parsePackJson(json({ ...PACK, cards }))
    expect(errors[0].params).not.toHaveProperty('index')
    expect(errors[0].card).toBe(1)
  })
})

describe('parseOfficialPackJson', () => {
  const OFFICIEL = { ...PACK, slug: 'pokemon', sortOrder: 3 }

  it('accepte un pack officiel valide', () => {
    const { pack, errors } = parseOfficialPackJson(json(OFFICIEL), 'pokemon')
    expect(errors).toEqual([])
    expect(pack).toEqual(OFFICIEL)
  })

  it('rejette un slug différent du nom de fichier', () => {
    const { errors } = parseOfficialPackJson(json(OFFICIEL), 'autre')
    expect(cles(errors)).toContain('packError.slugMismatch')
  })

  it('distingue un slug manquant d’un slug différent', () => {
    const { slug: _slug, ...sansSlug } = OFFICIEL
    const { errors } = parseOfficialPackJson(json(sansSlug), 'pokemon')
    expect(cles(errors)).toContain('packError.slugMissing')
    expect(cles(errors)).not.toContain('packError.slugMismatch')
  })

  it('rejette un sortOrder non entier', () => {
    const { errors } = parseOfficialPackJson(json({ ...OFFICIEL, sortOrder: 1.5 }), 'pokemon')
    expect(cles(errors)).toContain('packError.sortOrder')
  })
})

describe('validateOfficialPacks', () => {
  const a: OfficialPack = { ...PACK, slug: 'a', sortOrder: 1 }
  const b: OfficialPack = { ...PACK, slug: 'b', sortOrder: 2 }

  it('accepte des packs cohérents', () => {
    expect(validateOfficialPacks([a, b])).toEqual([])
  })

  it('refuse deux packs de même sortOrder', () => {
    expect(cles(validateOfficialPacks([a, { ...b, sortOrder: 1 }]))).toContain('packError.duplicateSortOrder')
  })

  it('refuse deux packs de même slug', () => {
    expect(cles(validateOfficialPacks([a, { ...b, slug: 'a' }]))).toContain('packError.duplicateSlug')
  })
})

describe('formatPackJson', () => {
  it('produit un JSON relisible et reparsable', () => {
    const texte = formatPackJson(PACK)
    expect(texte).toContain('\n  "name"')
    expect(parsePackJson(texte).pack).toEqual(PACK)
  })
})

describe('installSql', () => {
  const PACKS: OfficialPack[] = [
    { ...PACK, slug: 'b', sortOrder: 2 },
    { ...PACK, slug: 'a', sortOrder: 1 },
  ]
  const sql = installSql(PACKS)

  it('appelle install_official_pack une fois par pack', () => {
    expect(sql.match(/install_official_pack/g)).toHaveLength(2)
  })

  it('trie les packs par sortOrder', () => {
    // Position de l'argument slug de chaque appel, pas une recherche de "'a'"
    // en texte libre : celle-ci ne tiendrait que parce que le JSON embarqué
    // utilise des guillemets doubles et ne contient donc jamais "'a'".
    const posA = sql.indexOf("$json$::jsonb, 'a',")
    const posB = sql.indexOf("$json$::jsonb, 'b',")
    expect(posA).toBeGreaterThan(-1)
    expect(posB).toBeGreaterThan(-1)
    expect(posA).toBeLessThan(posB)
  })

  it("n'impose plus aucun id de carte", () => {
    expect(sql).not.toContain('overriding system value')
    expect(sql).not.toContain('setval')
  })

  it('embarque un JSON reparsable', () => {
    const bloc = sql.slice(sql.indexOf('$json$') + 6, sql.indexOf('$json$::jsonb'))
    expect(JSON.parse(bloc).name).toBe('Pokémon Gen 1')
  })

  it('échappe une apostrophe dans le slug', () => {
    const pack: OfficialPack = { ...PACK, slug: "l'a", sortOrder: 1 }
    expect(installSql([pack])).toContain("'l''a'")
  })

  it('refuse un pack dont le contenu contient le jeton $json$ réservé au dollar-quoting', () => {
    const pack: OfficialPack = { ...PACK, description: 'Voir $json$ dans la doc.', slug: 'a', sortOrder: 1 }
    expect(() => installSql([pack])).toThrow()
  })
})

describe('seedSql', () => {
  const PACKS: OfficialPack[] = [{ ...PACK, slug: 'a', sortOrder: 1 }]

  it("préfixe un en-tête qui interdit l'édition manuelle", () => {
    const s = seedSql(PACKS)
    expect(s.startsWith('--')).toBe(true)
    expect(s).toContain('cards:seed')
    expect(s).toContain('data/packs')
  })

  it('contient exactement le SQL de installSql', () => {
    expect(seedSql(PACKS)).toContain(installSql(PACKS))
  })

  it('se termine par un saut de ligne', () => {
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

function chargerVraisPacks(): { packs: OfficialPack[]; errors: PackError[] } {
  const fichiers = readdirSync(DOSSIER_PACKS).filter(f => f.endsWith('.json')).sort()
  const packs: OfficialPack[] = []
  const errors: PackError[] = []
  for (const f of fichiers) {
    const { pack, errors: errs } = parseOfficialPackJson(
      readFileSync(join(DOSSIER_PACKS, f), 'utf8'), basename(f, '.json'))
    errors.push(...errs)
    if (pack) packs.push(pack)
  }
  errors.push(...validateOfficialPacks(packs))
  return { packs, errors }
}

describe('data/packs/*.json', () => {
  const { packs, errors } = chargerVraisPacks()

  it('sont tous valides', () => {
    expect(errors).toEqual([])
  })

  it('contiennent football et naruto, 40 cartes chacun', () => {
    expect(packs.map(p => p.slug).sort()).toEqual(['football', 'naruto'])
    for (const p of packs) expect(p.cards).toHaveLength(40)
  })

  it('déclarent la position de chacune de leurs cartes', () => {
    for (const p of packs) {
      for (const c of p.cards) expect(Object.keys(p.positions)).toContain(c.position)
    }
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
