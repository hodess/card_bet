import { describe, expect, it } from 'vitest'
import { mulberry32, simulateGame, winRates, type SimPlayer } from './botSim'
import type { BotLevel } from './botBrain'

// Un pack synthétique de 40 notes étalées, comme les packs réels.
const RATINGS = Array.from({ length: 40 }, (_, i) => 91 - i)
const REGLAGES = { ratings: RATINGS, deckSize: 3, bankroll: 1000, minBid: 10 }

describe('mulberry32', () => {
  it('est déterministe pour une graine donnée', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
  it('rend des valeurs dans [0, 1)', () => {
    const r = mulberry32(7)
    for (let i = 0; i < 100; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
  it('diverge d’une graine à l’autre', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })
})

describe('simulateGame', () => {
  const joueurs: SimPlayer[] = [
    { level: 'hard', nickname: 'Bot Zizou' },
    { level: 'easy', nickname: 'Bot Arsène' },
  ]

  it('remplit tous les decks', () => {
    const r = simulateGame({ ...REGLAGES, players: joueurs, rng: mulberry32(1) })
    // La partie ne s'arrête que quand TOUS les decks sont pleins (RULES.md §1) :
    // on vérifie la taille des decks eux-mêmes, pas un score qu'un deck incomplet
    // pourrait aussi atteindre.
    expect(r.deckSizes).toEqual(joueurs.map(() => REGLAGES.deckSize))
  })

  it('ne laisse jamais un joueur à découvert', () => {
    const r = simulateGame({ ...REGLAGES, players: joueurs, rng: mulberry32(2) })
    expect(r.moneyLeft.every(m => m >= 0)).toBe(true)
  })

  it('désigne le vainqueur par le score, puis l’argent restant pour départager', () => {
    const r = simulateGame({ ...REGLAGES, players: joueurs, rng: mulberry32(3) })
    const meilleurScore = Math.max(...r.scores)
    for (const w of r.winners) expect(r.scores[w]).toBe(meilleurScore)
    // Départage (RULES.md §6) : parmi les joueurs au score maximal, seuls ceux
    // à l'argent restant maximal sont désignés vainqueurs.
    const argentDesMeilleurs = r.scores
      .map((s, i) => (s === meilleurScore ? r.moneyLeft[i] : -Infinity))
    const meilleurArgent = Math.max(...argentDesMeilleurs)
    for (const w of r.winners) expect(r.moneyLeft[w]).toBe(meilleurArgent)
  })

  it('est déterministe à graine égale', () => {
    const a = simulateGame({ ...REGLAGES, players: joueurs, rng: mulberry32(9) })
    const b = simulateGame({ ...REGLAGES, players: joueurs, rng: mulberry32(9) })
    expect(a).toEqual(b)
  })

  it('l’ouvreur défausse une carte sans intérêt, et personne ne l’achète', () => {
    // Toutes les notes égales : `percentile()` vaut 0 pour chacune — aucune note du
    // pool n'est inférieure — donc les deux ouvreurs successifs passent sous
    // `jokerFloor` et brûlent leur joker. Le résultat ne dépend pas du tirage, donc
    // pas de la graine : 2 défausses, puis 4 cartes achetées.
    //
    // Des bots MOYENS, et non difficiles : le difficile n'a plus de `jokerFloor`
    // (`null`, comme le facile) et ne vetoe que par déni, lequel exige
    // `percentile > jokerDenyTop` — impossible ici puisque le percentile est nul.
    // Le moyen garde un plancher, strictement supérieur à 0, donc il défausse. C'est
    // ce qui préserve la propriété qui rend ce test déterministe : 0 est en dessous
    // du plancher quelle que soit la graine.
    const res = simulateGame({
      players: [
        { level: 'medium', nickname: 'Bot Pep' },
        { level: 'medium', nickname: 'Bot Bielsa' },
      ],
      ratings: [80, 80, 80, 80, 80, 80],
      deckSize: 2,
      bankroll: 1000,
      minBid: 10,
      rng: mulberry32(3),
    })
    expect(res.discarded).toBe(2)                              // un joker par joueur
    expect(res.deckSizes).toEqual([2, 2])
    expect(res.scores.reduce((a, b) => a + b, 0)).toBe(4 * 80) // aucune défausse achetée
  })

  it('tient une table de huit', () => {
    const huit: SimPlayer[] = Array.from({ length: 8 }, (_, i) => ({
      level: 'medium' as const, nickname: `Bot Pep ${i + 1}`,
    }))
    const r = simulateGame({ ...REGLAGES, players: huit, rng: mulberry32(4) })
    expect(r.scores).toHaveLength(8)
    expect(r.moneyLeft.every(m => m >= 0)).toBe(true)
  })
})

describe('la hiérarchie des niveaux', () => {
  // Ces six tests sont le VRAI critère de réussite du chantier. S'ils échouent,
  // l'histoire de ce chantier dit que ce sont des corrections de FORMULE dans
  // botBrain.ts qu'il faut chercher, pas des constantes à ajuster dans
  // config.json : les corrections décisives ont été le plancher de ramassage et le
  // plancher de dépense (voir ci-dessous), et config.json n'a presque rien
  // apporté à lui seul.
  //
  // HISTORIQUE DE CALIBRAGE : le banc d'essai a servi à calibrer les trois niveaux,
  // et a réfuté plusieurs hypothèses de conception initiales — notamment qu'économiser
  // son argent était une bonne stratégie, alors que la règle de réserve garantit déjà
  // de compléter son deck et que l'argent ne sert qu'au départage (RULES.md §6). Par
  // exemple, le retrait du facteur S/T dans `selectivity` (mode hypergeometric, depuis retiré —
  // voir botBrain.ts) a corrigé les duels mais fait régresser la table à huit
  // joueurs — le difficile, sélectif à raison, refusait quasi tout pendant que
  // facile et moyen vidaient le pool des bonnes cartes, et finissait par miser ses
  // derniers tirages sur des rebuts. Cause racine : `effectiveCeiling` bornait son
  // plancher à `minBid` pile, alors que l'ouverture forcée démarre déjà à `minBid`
  // — un bot sélectif (u = 0) ne pouvait donc JAMAIS ramasser une carte jugée
  // médiocre, y compris quand personne ne la disputait. Deux corrections l'ont
  // résolu : le plancher de ramassage (`minBid + PAS_SURENCHERE` dans
  // `effectiveCeiling`) puis le plancher de dépense (`spendFloor` dans
  // `theoreticalFor`, voir botBrain.ts) — sans ce dernier, l'argent non dépensé ne
  // valant presque rien dans ce jeu, un bot sélectif finissait avec un deck de
  // rebuts et un portefeuille plein.
  //
  // Ces tests étaient en outre BIAISÉS par le placement des sièges : `duel(a, b)`
  // plaçait toujours `a` sur « Bot Zizou » (flambeur, retenue 0,95) et `b` sur
  // « Bot Arsène » (économe, retenue 0,72). Or ces deux tempéraments pèsent plus
  // que le niveau, et le biais change de signe selon le niveau : mesuré avec
  // l'ancien helper biaisé, deux bots de niveau IDENTIQUE ainsi assis donnent
  // difficile/difficile 0,630 contre 0,370, moyen/moyen 0,410 contre 0,590, et
  // facile/facile 0,500 contre 0,500. `affrontement` ci-dessous moyenne les deux
  // ordres de sièges pour annuler ce biais ; tous les chiffres mesurés avant cette
  // symétrisation (ci-dessus dans l'historique de calibrage) sont donc à lire
  // comme qualitatifs, pas comme des mesures fiables.
  const NOMS = ['Bot Zizou', 'Bot Bielsa', 'Bot Pep', 'Bot Arsène',
                'Bot Zizou 2', 'Bot Bielsa 2', 'Bot Pep 2', 'Bot Arsène 2']

  function affrontement(a: BotLevel, b: BotLevel, parCamp: number, seed: number): [number, number] {
    let totalA = 0
    let totalB = 0
    for (const inverse of [false, true]) {
      const players: SimPlayer[] = NOMS.slice(0, 2 * parCamp).map((nickname, i) => ({
        level: (i < parCamp) !== inverse ? a : b,
        nickname,
      }))
      const taux = winRates({ ...REGLAGES, players, games: 300, seed })
      const camp1 = taux.slice(0, parCamp).reduce((x, y) => x + y, 0)
      const camp2 = taux.slice(parCamp).reduce((x, y) => x + y, 0)
      if (inverse) { totalA += camp2; totalB += camp1 } else { totalA += camp1; totalB += camp2 }
    }
    return [totalA / 2, totalB / 2]
  }

  // RÉFÉRENCE DE CALIBRAGE. Taux mesurés avec le calibrage en place (kappa 3,
  // gamma 1, plancher de dépense, `hard.jokerFloor` null, `hard.jokerDenyTop` 0,75,
  // `medium.jokerFloor` 0,10), sur **24 000 parties par cellule** — 8 blocs de
  // graines disjointes x 1 500 parties x 2 ordres de sièges — et non sur les 300
  // parties d'un `affrontement` ci-dessous. Entre parenthèses l'erreur-type
  // empirique de la moyenne des blocs, mesurée et non déduite d'une loi :
  //
  //                      2 joueurs      4 joueurs      8 joueurs
  //   difficile-facile   0,757 (0,002)  0,854 (0,003)  0,908 (0,002)
  //   difficile-moyen    0,676 (0,002)  0,627 (0,003)  0,688 (0,003)
  //   moyen-facile       0,694 (0,005)  0,801 (0,003)  0,884 (0,001)
  //
  // ATTENTION, ces trois chiffres ne se lisent pas comme la grille précédente le
  // laissait croire : le cas le plus serré n'est PAS constant avec la taille de
  // table. C'est difficile-moyen à quatre joueurs, à 0,627, soit 8 erreurs-types
  // au-dessus du plancher exigé de 0,60 — les autres cellules en sont à 17 et plus.
  // Une régression de calibrage se manifestera donc d'abord là.
  //
  // NE PAS calibrer sur les 300 parties d'un `affrontement` : l'erreur-type d'un
  // tirage unique y est de l'ordre de 0,02, soit dix fois celle ci-dessus. Tous les
  // écarts de la grille de calibrage antérieure au joker tenaient dans ce bruit, et
  // `hard.jokerFloor` avait été poussé à 0,02 pour faire passer la table de 4 alors
  // que 24 000 parties montrent ce seuil sans effet mesurable (0,610 avec, 0,606
  // sans). Il est repassé à `null` pour cette raison.
  //
  // CE QUE LE JOKER A FAIT À CETTE SÉPARATION. Contrefactuel à 24 000 parties par
  // cellule, joker désactivé aux deux niveaux contre les seuils ci-dessus, lu en
  // ÉCART (les niveaux absolus bougent de ±0,008 d'une famille de graines à l'autre,
  // soit plus que l'erreur-type intra-famille — ne comparer que des cellules tirées
  // du même bloc) : −0,003 à deux joueurs, +0,003 à quatre, +0,017 à huit, pour une
  // erreur-type de l'écart de 0,003 à 0,005. Le joker est donc neutre en duel et à
  // quatre, et rapporte 1,7 point au difficile à huit joueurs.
  //
  // C'est un choix de réglage, pas une fatalité : le motif défensif (`jokerFloor`)
  // profite MÉCANIQUEMENT plus au niveau faible qu'au fort, parce que refuser un
  // mauvais slot vaut plus cher à qui joue mal le reste du temps. Réglé à 0,25 pour
  // le moyen, il coûtait 2,5 points au difficile en duel. D'où le partage retenu :
  // plancher défensif modeste pour le moyen, déni seul pour le difficile.
  //
  // La taille 4 (parCamp 2) est celle à laquelle on joue le plus : sans elle, les
  // niveaux pouvaient devenir quasi indiscernables à cette taille précise sans
  // qu'aucun test ne le signale.

  it('le difficile bat le facile à deux joueurs', () => {
    const [dur] = affrontement('hard', 'easy', 1, 1234)
    expect(dur).toBeGreaterThan(0.6)
  })

  it('le difficile bat le facile à quatre joueurs', () => {
    const [dur] = affrontement('hard', 'easy', 2, 1234)
    expect(dur).toBeGreaterThan(0.6)
  })

  it('le difficile bat le facile à huit joueurs', () => {
    const [dur] = affrontement('hard', 'easy', 4, 4321)
    expect(dur).toBeGreaterThan(0.6)
  })

  it('le difficile bat le moyen à deux joueurs', () => {
    const [dur] = affrontement('hard', 'medium', 1, 1234)
    expect(dur).toBeGreaterThan(0.6)
  })

  it('le difficile bat le moyen à quatre joueurs', () => {
    const [dur] = affrontement('hard', 'medium', 2, 1234)
    expect(dur).toBeGreaterThan(0.6)
  })

  it('le difficile bat le moyen à huit joueurs', () => {
    const [dur] = affrontement('hard', 'medium', 4, 4321)
    expect(dur).toBeGreaterThan(0.6)
  })

  it('le moyen bat le facile à deux joueurs', () => {
    const [moyen] = affrontement('medium', 'easy', 1, 1234)
    expect(moyen).toBeGreaterThan(0.6)
  })

  it('le moyen bat le facile à quatre joueurs', () => {
    const [moyen] = affrontement('medium', 'easy', 2, 1234)
    expect(moyen).toBeGreaterThan(0.6)
  })

  it('le moyen bat le facile à huit joueurs', () => {
    const [moyen] = affrontement('medium', 'easy', 4, 4321)
    expect(moyen).toBeGreaterThan(0.6)
  })
})
