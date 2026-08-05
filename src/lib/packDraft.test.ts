import { describe, expect, it } from 'vitest'
import config from '../config.json'
import {
  addPosition, draftFromJson, draftFromPack, draftToJson, duplicateNames, emptyDraft,
  flattenIssues, newCard, otherNames,
  positionCounts, ratingRange, removeCard, removePosition, renamePosition, saveCard,
  setPositionLabel, sortDraftCards, toPackInput, validateCard, validateDraft,
  type DraftCard, type PackDraft,
} from './packDraft'
import { formatPackJson, type PackInput } from './packs'

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

// Fabrique de test : des ids lisibles plutôt que des UUID, pour que les
// assertions se lisent.
const carte = (o: Partial<DraftCard> & { id: string }): DraftCard =>
  ({ name: 'X', position: 'FEU', rating: 50, ...o })

const brouillon = (o: Partial<PackDraft> = {}): PackDraft => ({
  name: 'Mon pack', emoji: '🃏', description: '',
  positions: [{ id: 'p1', code: 'FEU', label: 'Feu' }],
  cards: [carte({ id: 'c1', name: 'A' }), carte({ id: 'c2', name: 'B' })],
  ...o,
})

describe('emptyDraft', () => {
  it('part de rien du tout', () => {
    expect(emptyDraft()).toEqual({
      name: '', emoji: '', description: '', positions: [], cards: [],
    })
  })
})

describe('newCard', () => {
  it('reprend la position fournie et la note par défaut', () => {
    const c = newCard('EAU')
    expect(c.position).toBe('EAU')
    expect(c.rating).toBe(config.packs.cards.ratingDefault)
    expect(c.name).toBe('')
    expect(c.id).not.toBe(newCard('EAU').id)
  })
})

describe('draftFromPack', () => {
  it('déplie les positions en tableau ordonné, avec un id par entrée', () => {
    const d = draftFromPack(PACK)
    expect(d.positions.map(p => [p.code, p.label])).toEqual([['FEU', 'Feu'], ['EAU', 'Eau']])
    expect(new Set(d.positions.map(p => p.id)).size).toBe(2)
  })

  it('donne un id unique à chaque carte et trie par note décroissante', () => {
    const d = draftFromPack(PACK)
    expect(d.cards.map(c => c.name)).toEqual(['Dracaufeu', 'Tortank'])
    expect(new Set(d.cards.map(c => c.id)).size).toBe(2)
  })

  it("recopie l'identité du pack", () => {
    const d = draftFromPack(PACK)
    expect([d.name, d.emoji, d.description]).toEqual([PACK.name, PACK.emoji, PACK.description])
  })
})

describe('sortDraftCards', () => {
  it('trie par note décroissante puis par nom', () => {
    const cartes = [
      carte({ id: '1', name: 'Zeta', rating: 80 }),
      carte({ id: '2', name: 'Alpha', rating: 80 }),
      carte({ id: '3', name: 'Omega', rating: 91 }),
    ]
    expect(sortDraftCards(cartes).map(c => c.name)).toEqual(['Omega', 'Alpha', 'Zeta'])
  })

  it("range une note absente en dernier sans planter", () => {
    const cartes = [carte({ id: '1', name: 'A', rating: null }), carte({ id: '2', name: 'B', rating: 10 })]
    expect(sortDraftCards(cartes).map(c => c.name)).toEqual(['B', 'A'])
  })

  it('ne modifie pas le tableau reçu', () => {
    const cartes = [carte({ id: '1', name: 'B', rating: 10 }), carte({ id: '2', name: 'A', rating: 99 })]
    sortDraftCards(cartes)
    expect(cartes.map(c => c.name)).toEqual(['B', 'A'])
  })
})

describe('positionCounts', () => {
  it('compte les cartes par code, zéro compris', () => {
    const d = brouillon({
      positions: [
        { id: 'p1', code: 'FEU', label: 'Feu' },
        { id: 'p2', code: 'EAU', label: 'Eau' },
      ],
      cards: [
        carte({ id: 'c1', name: 'A', position: 'FEU' }),
        carte({ id: 'c2', name: 'B', position: 'FEU' }),
      ],
    })
    expect(positionCounts(d)).toEqual({ FEU: 2, EAU: 0 })
  })

  it("ignore une carte dont la position n'existe pas dans le vocabulaire", () => {
    const d = brouillon({ cards: [carte({ id: 'c1', name: 'A', position: 'INCONNU' })] })
    expect(positionCounts(d)).toEqual({ FEU: 0 })
  })
})

describe('ratingRange', () => {
  it('rend les bornes des notes renseignées', () => {
    const cartes = [
      carte({ id: '1', name: 'A', rating: 62 }),
      carte({ id: '2', name: 'B', rating: 91 }),
      carte({ id: '3', name: 'C', rating: null }),
    ]
    expect(ratingRange(cartes)).toEqual({ min: 62, max: 91 })
  })

  it("rend null quand aucune note n'est renseignée", () => {
    expect(ratingRange([])).toBeNull()
    expect(ratingRange([carte({ id: '1', name: 'A', rating: null })])).toBeNull()
  })
})

describe('duplicateNames / otherNames', () => {
  it('duplicateNames rend les noms présents plus d’une fois, forme rognée', () => {
    const cartes = [
      carte({ id: '1', name: 'Marlin' }),
      carte({ id: '2', name: '  Marlin  ' }),
      carte({ id: '3', name: 'Okoye' }),
    ]
    expect([...duplicateNames(cartes)]).toEqual(['Marlin'])
  })

  it('otherNames exclut la carte par son id', () => {
    const cartes = [carte({ id: '1', name: 'Marlin' }), carte({ id: '2', name: 'Okoye' })]
    expect([...otherNames(cartes, '1')]).toEqual(['Okoye'])
  })
})

describe('validateCard', () => {
  it('ne dit rien d’une carte correcte', () => {
    const c = carte({ id: '1', name: 'Marlin', position: 'FEU', rating: 80 })
    expect(validateCard(c, ['FEU'], new Set())).toEqual({})
  })

  it('ancre une erreur par champ', () => {
    const c = carte({ id: '1', name: '', position: 'INCONNU', rating: null })
    const issues = validateCard(c, ['FEU'], new Set())
    expect(issues.name?.key).toBe('packError.cardName')
    expect(issues.position?.key).toBe('packError.cardUnknownPosition')
    expect(issues.rating?.key).toBe('packError.cardRating')
  })

  it('signale le doublon sur le champ nom', () => {
    const c = carte({ id: '1', name: 'Marlin', position: 'FEU' })
    expect(validateCard(c, ['FEU'], new Set(['Marlin'])).name?.key)
      .toBe('packError.cardDuplicateName')
  })

  it('préfère « nom manquant » à « nom en double » sur une carte vide', () => {
    // Deux cartes vides sont « en double » au sens strict ; dire d'abord que le
    // nom manque est le message utile.
    const c = carte({ id: '1', name: '', position: 'FEU' })
    expect(validateCard(c, ['FEU'], new Set([''])).name?.key).toBe('packError.cardName')
  })
})

describe('validateDraft', () => {
  it('ne dit rien d’un brouillon valide et compte 0', () => {
    const issues = validateDraft(draftFromPack(PACK))
    expect(issues).toEqual({ pack: {}, positions: {}, cards: {}, count: 0 })
  })

  it('ancre les erreurs de carte sur leur id, pas sur leur index', () => {
    const d = brouillon({
      cards: [carte({ id: 'c1', name: 'A' }), carte({ id: 'c2', name: '', rating: 300 })],
    })
    const issues = validateDraft(d)
    expect(issues.cards).not.toHaveProperty('c1')
    expect(issues.cards.c2.name?.key).toBe('packError.cardName')
    expect(issues.cards.c2.rating?.key).toBe('packError.cardRating')
  })

  it('signale les DEUX cartes d’un doublon de nom', () => {
    const d = brouillon({
      cards: [carte({ id: 'c1', name: 'Marlin' }), carte({ id: 'c2', name: 'Marlin' })],
    })
    const issues = validateDraft(d)
    expect(issues.cards.c1.name?.key).toBe('packError.cardDuplicateName')
    expect(issues.cards.c2.name?.key).toBe('packError.cardDuplicateName')
  })

  it('signale deux positions de même code — une faute impossible en JSON', () => {
    const d = brouillon({
      positions: [
        { id: 'p1', code: 'FEU', label: 'Feu' },
        { id: 'p2', code: 'FEU', label: 'Flamme' },
      ],
    })
    const issues = validateDraft(d)
    expect(issues.positions.p2.code?.key).toBe('packError.positionDuplicate')
    expect(issues.positions.p1?.code).toBeUndefined()
  })

  it('n’ancre aucune entrée pour une position sans erreur', () => {
    const d = brouillon({
      positions: [
        { id: 'p1', code: 'FEU', label: 'Feu' },
        { id: 'p2', code: 'FEU', label: 'Flamme' },
      ],
    })
    const issues = validateDraft(d)
    // p1 est la première du doublon : rien à lui reprocher, donc pas d'entrée du
    // tout — un objet vide suffirait à faire rougir sa ligne dans le panneau.
    expect(Object.keys(issues.positions)).toEqual(['p2'])
  })

  it('remonte les erreurs de niveau pack', () => {
    const issues = validateDraft(brouillon({ name: '', positions: [], cards: [] }))
    expect(issues.pack.name?.key).toBe('packError.name')
    expect(issues.pack.positions?.key).toBe('packError.positions')
    expect(issues.pack.cards?.key).toBe('packError.cardsCount')
  })

  it('compte toutes les erreurs, pack et lignes confondues', () => {
    const d = brouillon({ name: '', cards: [carte({ id: 'c1', name: '', rating: null })] })
    const issues = validateDraft(d)
    // name du pack + cardsCount (1 carte < 2) + nom et note de la carte
    expect(issues.count).toBe(4)
  })
})

describe('toPackInput', () => {
  it('rend null si le brouillon est fautif', () => {
    expect(toPackInput(brouillon({ name: '' }))).toBeNull()
  })

  it('replie les positions en Record et rogne les textes', () => {
    const d = brouillon({
      name: '  Mon pack  ',
      positions: [{ id: 'p1', code: 'FEU', label: '  Feu  ' }],
      cards: [
        carte({ id: 'c1', name: '  Alpha  ', position: 'FEU', rating: 80 }),
        carte({ id: 'c2', name: 'Beta', position: 'FEU', rating: 91 }),
      ],
    })
    expect(toPackInput(d)).toEqual({
      name: 'Mon pack', emoji: '🃏', description: '',
      positions: { FEU: 'Feu' },
      cards: [
        { name: 'Beta', position: 'FEU', rating: 91 },
        { name: 'Alpha', position: 'FEU', rating: 80 },
      ],
    })
  })

  it('fait l’aller-retour avec draftFromPack sans rien perdre', () => {
    expect(toPackInput(draftFromPack(PACK))).toEqual(PACK)
  })
})

const json = (o: unknown) => JSON.stringify(o)

describe('draftFromJson', () => {
  it('charge un pack valide', () => {
    const { draft, errors } = draftFromJson(json(PACK))
    expect(errors).toEqual([])
    expect(draft?.name).toBe('Pokémon Gen 1')
    expect(draft?.cards.map(c => c.name)).toEqual(['Dracaufeu', 'Tortank'])
    expect(draft?.positions.map(p => p.code)).toEqual(['FEU', 'EAU'])
  })

  it('refuse en bloc un JSON illisible', () => {
    const { draft, errors } = draftFromJson('{ pas du json')
    expect(draft).toBeNull()
    expect(errors.map(e => e.key)).toContain('packError.json')
  })

  it('refuse en bloc une racine qui n’est pas un objet', () => {
    expect(draftFromJson('[]').draft).toBeNull()
    expect(draftFromJson('42').draft).toBeNull()
  })

  it('refuse en bloc un fichier sans vocabulaire de positions', () => {
    const { positions: _p, ...sansPositions } = PACK
    const { draft, errors } = draftFromJson(json(sansPositions))
    expect(draft).toBeNull()
    expect(errors.map(e => e.key)).toContain('packError.positions')
  })

  it('charge quand même les cartes fautives, pour qu’on les corrige dans la liste', () => {
    const cards = [
      { name: 'Dracaufeu', position: 'FEU', rating: 92 },
      { name: 'Tortank', position: 'INCONNU', rating: 300 },
    ]
    const { draft } = draftFromJson(json({ ...PACK, cards }))
    expect(draft?.cards).toHaveLength(2)
    const fautive = draft!.cards.find(c => c.name === 'Tortank')!
    expect(fautive.position).toBe('INCONNU')
    expect(fautive.rating).toBe(300)
    // et la validation les signale, chacune sur sa ligne
    const issues = validateDraft(draft!)
    expect(issues.cards[fautive.id].position?.key).toBe('packError.cardUnknownPosition')
    expect(issues.cards[fautive.id].rating?.key).toBe('packError.cardRating')
  })

  it('rend null la note illisible plutôt que d’inventer un chiffre', () => {
    const cards = [{ name: 'A', position: 'FEU', rating: 'abc' }, PACK.cards[1]]
    const { draft } = draftFromJson(json({ ...PACK, cards }))
    expect(draft!.cards.find(c => c.name === 'A')!.rating).toBeNull()
  })

  it('remplace une carte non-objet par une ligne vide à corriger', () => {
    const { draft } = draftFromJson(json({ ...PACK, cards: ['pas un objet', PACK.cards[1]] }))
    expect(draft?.cards).toHaveLength(2)
    expect(draft!.cards.some(c => c.name === '' && c.rating === null)).toBe(true)
  })

  it('signale un champ inconnu sans refuser le fichier', () => {
    const { draft, errors } = draftFromJson(json({ ...PACK, auteur: 'moi' }))
    expect(draft).not.toBeNull()
    expect(errors.map(e => e.key)).toContain('packError.unknownField')
    expect(errors[0].params?.field).toBe('auteur')
  })

  it('accepte un fichier sans cartes du tout', () => {
    const { cards: _c, ...sansCartes } = PACK
    const { draft } = draftFromJson(json(sansCartes))
    expect(draft?.cards).toEqual([])
  })
})

describe('renamePosition', () => {
  it('propage le nouveau code aux cartes qui l’utilisent', () => {
    const d = brouillon({
      positions: [{ id: 'p1', code: 'FEU', label: 'Feu' }],
      cards: [carte({ id: 'c1', name: 'A', position: 'FEU' }),
              carte({ id: 'c2', name: 'B', position: 'AUTRE' })],
    })
    const apres = renamePosition(d, 'p1', 'ATT')
    expect(apres.positions[0].code).toBe('ATT')
    expect(apres.cards.find(c => c.id === 'c1')!.position).toBe('ATT')
    expect(apres.cards.find(c => c.id === 'c2')!.position).toBe('AUTRE')
  })

  it('ne touche à rien pour un id inconnu', () => {
    const d = brouillon()
    expect(renamePosition(d, 'inexistant', 'X')).toBe(d)
  })
})

describe('addPosition / setPositionLabel', () => {
  it('ajoute une position vide en fin de liste', () => {
    const apres = addPosition(brouillon())
    expect(apres.positions).toHaveLength(2)
    expect(apres.positions[1]).toMatchObject({ code: '', label: '' })
  })

  it('change un libellé sans toucher au code ni aux cartes', () => {
    const apres = setPositionLabel(brouillon(), 'p1', 'Attaquant')
    expect(apres.positions[0]).toMatchObject({ code: 'FEU', label: 'Attaquant' })
  })
})

describe('removePosition', () => {
  it('refuse de supprimer une position utilisée, en nommant le code et le compte', () => {
    const d = brouillon({
      positions: [{ id: 'p1', code: 'FEU', label: 'Feu' }, { id: 'p2', code: 'EAU', label: 'Eau' }],
      cards: [carte({ id: 'c1', name: 'A', position: 'FEU' }),
              carte({ id: 'c2', name: 'B', position: 'FEU' })],
    })
    const { draft, error } = removePosition(d, 'p1')
    expect(error?.key).toBe('packError.positionInUse')
    expect(error?.params?.code).toBe('FEU')
    expect(error?.params?.count).toBe(2)
    expect(draft).toBe(d)
  })

  it('refuse de supprimer une position utilisée par une seule carte, au singulier', () => {
    const d = brouillon({
      positions: [{ id: 'p1', code: 'FEU', label: 'Feu' }, { id: 'p2', code: 'EAU', label: 'Eau' }],
      cards: [carte({ id: 'c1', name: 'A', position: 'FEU' })],
    })
    const { draft, error } = removePosition(d, 'p1')
    expect(error?.key).toBe('packError.positionInUseOne')
    expect(error?.params?.code).toBe('FEU')
    expect(draft).toBe(d)
  })

  it('refuse de supprimer la dernière position', () => {
    const d = brouillon()
    const { draft, error } = removePosition(d, 'p1')
    expect(error?.key).toBe('packError.positionLast')
    expect(draft).toBe(d)
  })

  it('supprime une position inutilisée', () => {
    const d = brouillon({
      positions: [{ id: 'p1', code: 'FEU', label: 'Feu' }, { id: 'p2', code: 'EAU', label: 'Eau' }],
      cards: [carte({ id: 'c1', name: 'A', position: 'FEU' })],
    })
    const { draft, error } = removePosition(d, 'p2')
    expect(error).toBeNull()
    expect(draft.positions.map(p => p.code)).toEqual(['FEU'])
  })
})

describe('saveCard / removeCard', () => {
  it('ajoute une carte inconnue et retrie', () => {
    const d = brouillon({ cards: [carte({ id: 'c1', name: 'A', rating: 50 })] })
    const apres = saveCard(d, carte({ id: 'c9', name: 'Z', rating: 99 }))
    expect(apres.cards.map(c => c.name)).toEqual(['Z', 'A'])
  })

  it('remplace une carte existante par son id', () => {
    const d = brouillon({ cards: [carte({ id: 'c1', name: 'A', rating: 50 })] })
    const apres = saveCard(d, carte({ id: 'c1', name: 'A bis', rating: 60 }))
    expect(apres.cards).toHaveLength(1)
    expect(apres.cards[0]).toMatchObject({ id: 'c1', name: 'A bis', rating: 60 })
  })

  it('supprime une carte par son id', () => {
    const apres = removeCard(brouillon(), 'c1')
    expect(apres.cards.map(c => c.id)).toEqual(['c2'])
  })
})

describe('flattenIssues', () => {
  it('ne rend rien pour un brouillon valide', () => {
    const d = draftFromPack(PACK)
    expect(flattenIssues(d, validateDraft(d))).toEqual([])
  })

  it('ordonne : identité du pack, puis vocabulaire, puis cartes', () => {
    const d = brouillon({
      name: '',
      positions: [{ id: 'p1', code: '', label: 'Feu' }],
      // position alignée sur le seul code du brouillon ('') : on isole la faute
      // qu'on teste (le nom manquant), sans en ajouter une seconde sur la
      // position qui serait accidentelle et fausserait le compte d'entrées.
      cards: [carte({ id: 'c1', name: '', rating: 50, position: '' })],
    })
    const plat = flattenIssues(d, validateDraft(d))
    expect(plat.map(f => f.target.kind)).toEqual(['settings', 'list', 'positions', 'card'])
    expect(plat[0].error.key).toBe('packError.name')
    expect(plat[1].error.key).toBe('packError.cardsCount')
    expect(plat[3].error.key).toBe('packError.cardName')
  })

  it('renvoie chaque erreur de carte vers sa carte, par id', () => {
    const d = brouillon({
      cards: [carte({ id: 'c1', name: 'A' }), carte({ id: 'c2', name: 'B', rating: 300 })],
    })
    const plat = flattenIssues(d, validateDraft(d))
    expect(plat).toHaveLength(1)
    expect(plat[0].target).toEqual({ kind: 'card', id: 'c2' })
    expect(plat[0].label).toBe('B')
  })

  it('renvoie une erreur de ligne de position vers cette ligne', () => {
    const d = brouillon({ positions: [{ id: 'p1', code: 'FEU', label: '' }] })
    const plat = flattenIssues(d, validateDraft(d))
    expect(plat[0].target).toEqual({ kind: 'positions', id: 'p1' })
    expect(plat[0].label).toBe('FEU')
  })

  it('renvoie le compte de positions vers le panneau, sans ligne particulière', () => {
    const d = brouillon({ positions: [] })
    const plat = flattenIssues(d, validateDraft(d))
    const cible = plat.find(f => f.error.key === 'packError.positions')!.target
    expect(cible).toEqual({ kind: 'positions' })
  })

  it('liste les cartes dans l’ordre de la liste, pas dans l’ordre du tableau', () => {
    const d = brouillon({
      cards: [
        carte({ id: 'c1', name: 'Petit', rating: 10, position: 'INCONNU' }),
        carte({ id: 'c2', name: 'Grand', rating: 90, position: 'INCONNU' }),
      ],
    })
    const plat = flattenIssues(d, validateDraft(d))
    expect(plat.map(f => f.label)).toEqual(['Grand', 'Petit'])
  })
})

describe('draftToJson', () => {
  it('produit exactement formatPackJson quand le brouillon est valide', () => {
    const d = draftFromPack(PACK)
    expect(draftToJson(d)).toBe(formatPackJson(PACK))
  })

  it('exporte un brouillon fautif tel quel, sans inventer de note', () => {
    const d = brouillon({ cards: [carte({ id: 'c1', name: 'A', rating: null })] })
    const objet = JSON.parse(draftToJson(d))
    expect(objet.cards[0].rating).toBeNull()
  })

  it('fait l’aller-retour avec draftFromJson même fautif', () => {
    const d = brouillon({ cards: [carte({ id: 'c1', name: 'A', rating: null })] })
    const relu = draftFromJson(draftToJson(d)).draft!
    expect(relu.cards[0]).toMatchObject({ name: 'A', rating: null })
  })
})
