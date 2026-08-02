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

  // Marges franches mais sûres, en dessous des taux réellement mesurés avec le
  // calibrage en place (kappa 3, gamma 1, plancher de dépense, spendFloorAdapts
  // retiré) : difficile-facile 0,730 (2 joueurs) / 0,853 (4) / 0,907 (8) ;
  // difficile-moyen 0,668 / 0,672 / 0,675 ; moyen-facile 0,663 / 0,803 / 0,907.
  // Le cas le plus serré est difficile-moyen, autour de 0,67 quelle que soit la
  // taille de table : on exige 0,60 partout, ce qui laisse de la marge sous ce
  // plancher sans être complaisant.
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
