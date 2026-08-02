import { describe, expect, it } from 'vitest'
import {
  ceiling, decide, effectiveCeiling, inflationRatio, percentile, poolAfter, reactionDelayMs,
  seededUnit, selectivity, topRivalCap, type BotView,
} from './botBrain'
import { temperamentOf } from './botNames'
import config from '../config.json'

// Pool de dix notes, faciles à compter à la main.
const POOL = [70, 72, 74, 76, 78, 80, 82, 84, 86, 88]

describe('percentile', () => {
  it('rend la fraction des notes strictement inférieures', () => {
    expect(percentile(POOL, 80)).toBe(0.5)
    expect(percentile(POOL, 70)).toBe(0)
    expect(percentile(POOL, 99)).toBe(1)
  })
  it('rend 1 sur un pool vide : plus rien de mieux ne peut sortir', () => {
    expect(percentile([], 80)).toBe(1)
  })
  it('ignore les égalités : seul le strictement inférieur compte', () => {
    expect(percentile([80, 80, 80, 90], 80)).toBe(0)
  })
})

describe('poolAfter', () => {
  it('retire les notes déjà vues', () => {
    expect(poolAfter([70, 80, 90], [80])).toEqual([70, 90])
  })
  it('respecte les doublons : deux 88 sortis ne retirent que deux 88', () => {
    expect(poolAfter([88, 88, 88, 70], [88, 88])).toEqual([88, 70])
  })
  it('ignore une note vue qui n’est pas dans le pack', () => {
    expect(poolAfter([70, 80], [99])).toEqual([70, 80])
  })
  it('rend un pool vide quand tout est sorti', () => {
    expect(poolAfter([70, 80], [80, 70])).toEqual([])
  })
  it('ne modifie pas le tableau d’entrée', () => {
    const pack = [70, 80]
    poolAfter(pack, [70])
    expect(pack).toEqual([70, 80])
  })
})

describe('selectivity — mode pack (facile)', () => {
  const base = { mode: 'pack' as const, pool: POOL, packRatings: POOL, fixedThreshold: 0.5 }
  it('rend 0 sous le seuil', () => {
    expect(selectivity({ ...base, rating: 76 })).toBe(0)
  })
  it('rend 1 pour la meilleure note du pack', () => {
    expect(selectivity({ ...base, rating: 99 })).toBe(1)
  })
  it('ignore le pool restant : c’est toute sa myopie', () => {
    // le pool est réduit aux trois moins bonnes cartes, donc un 76 est devenu la
    // MEILLEURE encore disponible — le facile n'en sait rien, il juge sur le pack.
    expect(selectivity({ ...base, rating: 76, pool: [70, 72, 74] })).toBe(0)
  })
})

describe('selectivity — mode pool (moyen et difficile)', () => {
  const base = { mode: 'pool' as const, pool: POOL, packRatings: POOL, fixedThreshold: 0.5 }
  it('applique le seuil au pool restant', () => {
    // rating 86 → q = 0,8 → u = (0,8 − 0,5) / 0,5
    expect(selectivity({ ...base, rating: 86 })).toBeCloseTo(0.6)
  })
  it('voit qu’une carte modeste est devenue la meilleure disponible', () => {
    // même situation que la myopie du facile ci-dessus, mais lui la comprend
    expect(selectivity({ ...base, rating: 76, pool: [70, 72, 74] })).toBe(1)
  })
  it('rend 0 sous le seuil', () => {
    expect(selectivity({ ...base, rating: 74 })).toBe(0)
  })
})

describe('ceiling', () => {
  const base = { bankroll: 1000, slotsMissing: 3, minBid: 10, kappa: 2, gamma: 1.5 }
  it('plafonne la meilleure carte du pool à 656 sur les réglages par défaut', () => {
    // budgetUtile = 1000 − 30 = 970 ; 970 / 3 × 2 × 1 + 10 = 656,67 → 656
    expect(ceiling({ ...base, u: 1 })).toBe(656)
  })
  it('rend un entier : les mises sont entières en base', () => {
    expect(Number.isInteger(ceiling({ ...base, u: 0.4 }))).toBe(true)
  })
  it('rend la mise minimale pour une carte sans intérêt', () => {
    expect(ceiling({ ...base, u: 0 })).toBe(10)
  })
  it('ne dépasse jamais la règle de réserve sur le dernier slot', () => {
    // Le clamp de réserve ne peut mordre que si κ ≥ S : brut − miseMin vaut
    // budgetUtile × κ/S, quand maxBid − miseMin vaut budgetUtile tout court.
    // Avec κ = 2, c'est donc au dernier slot que le plafond théorique déborde.
    // bankroll 100, 1 slot → budgetUtile 90, brut = 10 + 90 × 2 = 190, maxBid = 100
    expect(ceiling({ ...base, bankroll: 100, slotsMissing: 1, u: 1 })).toBe(100)
  })

  it('reste sous la réserve sans avoir besoin du clamp quand κ < S', () => {
    // même bankroll, mais 3 slots : brut = 10 + (70 / 3) × 2 = 56,67 < maxBid = 80.
    // La formule est naturellement prudente, le clamp n'est qu'un garde-fou.
    expect(ceiling({ ...base, bankroll: 100, u: 1 })).toBe(56)
  })
  it('monte avec l’agressivité et avec la qualité', () => {
    expect(ceiling({ ...base, u: 0.8 })).toBeGreaterThan(ceiling({ ...base, u: 0.4 }))
    expect(ceiling({ ...base, u: 0.5, kappa: 3 }))
      .toBeGreaterThan(ceiling({ ...base, u: 0.5, kappa: 2 }))
  })
})

// Un tempérament neutre : on teste le cerveau, pas les multiplicateurs du config.
const NEUTRE = { kappa: 1, gamma: 1, restraint: 1, jumpRate: 1, delayFactor: 1 }

const vue = (over: Partial<BotView> = {}): BotView => ({
  botPlayerId: 'bot',
  level: 'medium',
  temperament: NEUTRE,
  auctionId: 'auction-1',
  currentBidder: 'adversaire',
  currentBid: 100,
  bankroll: 1000,
  slotsMissing: 3,
  totalSlotsMissing: 6,
  minBid: 10,
  cardRating: 88,
  pool: POOL,
  packRatings: POOL,
  rivals: [{ bankroll: 1000, slotsMissing: 3, passed: false }],
  soldPrices: [],
  ...over,
})

// rng contrôlé : chaque appel rend la valeur suivante, puis 0.
const seq = (...vals: number[]) => { let i = 0; return () => vals[i++] ?? 0 }

// Le bruit et la faute du facile sont tirés d'un hash de (auctionId, botPlayerId) :
// on ne peut pas les prédire à la main, mais on peut CHERCHER un identifiant qui
// produit la situation qu'on veut tester. C'est déterministe, donc stable.
const trouver = (predicat: (id: string) => boolean): string => {
  const id = Array.from({ length: 2000 }, (_, i) => `a${i}`).find(predicat)
  if (!id) throw new Error('aucun identifiant ne satisfait le prédicat')
  return id
}

// Une enchère où le facile ne fait PAS d'erreur et où son bruit est franchement
// positif : les tests d'incréments doivent porter sur son comportement nominal,
// pas être masqués par une faute ou par un plafond rabaissé de 35 %.
const ID_SAIN = trouver(id =>
  seededUnit(id, 'bot', 'error') >= config.bot.levels.easy.errorRate
  && seededUnit(id, 'bot', 'noise') > 0.9)

describe('seededUnit', () => {
  it('est stable pour les mêmes entrées', () => {
    expect(seededUnit('a', 'b')).toBe(seededUnit('a', 'b'))
  })
  it('sépare deux bots sur la même enchère', () => {
    expect(seededUnit('auction-1', 'bot-a')).not.toBe(seededUnit('auction-1', 'bot-b'))
  })
  it('sépare deux enchères pour le même bot', () => {
    expect(seededUnit('auction-1', 'bot')).not.toBe(seededUnit('auction-2', 'bot'))
  })
  it('reste dans [0, 1)', () => {
    for (const s of ['a', 'bb', 'ccc', 'auction-42']) {
      expect(seededUnit(s)).toBeGreaterThanOrEqual(0)
      expect(seededUnit(s)).toBeLessThan(1)
    }
  })
})

describe('effectiveCeiling', () => {
  it('applique la retenue du tempérament', () => {
    const flambeur = { ...NEUTRE, restraint: 0.95 }
    const econome = { ...NEUTRE, restraint: 0.72 }
    expect(effectiveCeiling(vue({ temperament: flambeur })))
      .toBeGreaterThan(effectiveCeiling(vue({ temperament: econome })))
  })
  it('ne bouge pas entre deux ticks de la même enchère', () => {
    // le bruit est tiré du couple (auctionId, botPlayerId), pas d'un rng : sans ça
    // le bot miserait puis passerait sur la même carte au même prix
    const v = vue({ level: 'easy' })
    expect(effectiveCeiling(v)).toBe(effectiveCeiling(v))
  })
  it('change d’une enchère à l’autre pour un niveau bruité', () => {
    const a = effectiveCeiling(vue({ level: 'easy', auctionId: 'auction-1' }))
    const b = effectiveCeiling(vue({ level: 'easy', auctionId: 'auction-2' }))
    expect(a).not.toBe(b)
  })
  it('respecte la règle de réserve même après tous les multiplicateurs', () => {
    const v = vue({
      level: 'easy', bankroll: 100, slotsMissing: 3,
      temperament: { ...NEUTRE, restraint: 0.95, kappa: 3 },
    })
    expect(effectiveCeiling(v)).toBeLessThanOrEqual(80)
  })
  it('rend un entier', () => {
    expect(Number.isInteger(effectiveCeiling(vue()))).toBe(true)
  })

  it('ramasse au cran au-dessus de l’ouverture, jamais à la mise minimale pile', () => {
    // L'ouverture forcée est DÉJÀ à minBid. Un plafond égal à minBid empêcherait
    // toute surenchère, donc le bot refuserait une carte que personne ne dispute
    // au lieu de la ramasser. Le plancher doit être minBid + un cran.
    //
    // Avec le plancher de dépense relevé (kappa 3, gamma 1), la valeur exacte du
    // plafond dépend trop finement du bruit pour rester un repère stable : on
    // vérifie la propriété qui compte plutôt qu'un chiffre — le plafond dépasse
    // strictement la mise minimale, et `decide` mise effectivement au lieu de
    // refuser la carte.
    const rebut = vue({
      level: 'medium', cardRating: 70, currentBid: 10,
      bankroll: 25, slotsMissing: 1, totalSlotsMissing: 1,
    })
    expect(effectiveCeiling(rebut)).toBeGreaterThan(rebut.minBid)
    expect(decide(rebut, seq(0.99)).kind).toBe('bid')
  })
})

describe('decide — les cas où il ne fait rien', () => {
  it('attend quand son deck est plein', () => {
    expect(decide(vue({ slotsMissing: 0 }), seq()).kind).toBe('wait')
  })
  it('ne surenchérit jamais sur lui-même', () => {
    expect(decide(vue({ currentBidder: 'bot' }), seq()).kind).toBe('wait')
  })
})

describe('decide — la passe est pilotée par le plafond', () => {
  it('passe quand la prochaine mise dépasserait son plafond', () => {
    // carte la plus mauvaise du pool (70) : même avec le plancher de dépense du
    // moyen, son plafond plafonne autour de 318 — largement dépassé par un prix
    // déjà à 400, donc plus aucune surenchère ne tient.
    expect(decide(vue({ cardRating: 70, currentBid: 400 }), seq()).kind).toBe('pass')
  })
  it('mise quand le prix est encore sous son plafond', () => {
    expect(decide(vue({ cardRating: 88, currentBid: 100 }), seq()).kind).toBe('bid')
  })
  it('passe quand plus aucune surenchère ne tient dans son plafond', () => {
    // le plafond est toujours borné par la réserve, donc c'est lui qui parle en
    // premier : à 975 sur une bankroll de 1000, aucune mise ne tient
    expect(decide(vue({ cardRating: 88, currentBid: 975 }), seq()).kind).toBe('pass')
  })
})

describe('decide — les erreurs franches du facile', () => {
  const fautes = Array.from({ length: 2000 }, (_, i) => `a${i}`)
    .filter(id => seededUnit(id, 'bot', 'error') < config.bot.levels.easy.errorRate)

  it('fait des erreurs sur une minorité d’enchères', () => {
    // On compte les renoncements RÉELS de decide sur une carte excellente à prix
    // bas : sans faute, le bot miserait à coup sûr, donc chaque `pass` est une faute.
    const ids = Array.from({ length: 2000 }, (_, i) => `a${i}`)
    const renoncements = ids.filter(id =>
      decide(vue({ level: 'easy', auctionId: id, cardRating: 88, currentBid: 20 }), seq(0))
        .kind === 'pass')
    expect(renoncements.length).toBeGreaterThan(0)
    expect(renoncements.length / ids.length).toBeLessThan(0.2)
  })

  it('renonce parfois à une carte qu’il pouvait prendre', () => {
    const id = trouver(i =>
      seededUnit(i, 'bot', 'error') < config.bot.levels.easy.errorRate
      && seededUnit(i, 'bot', 'kind') < 0.5)
    // carte excellente et prix bas : sans la faute, il miserait à coup sûr
    expect(decide(vue({ level: 'easy', auctionId: id, cardRating: 88, currentBid: 20 }), seq(0)))
      .toEqual({ kind: 'pass' })
  })

  it('s’entête au-delà de tout plafond atteignable sans faute', () => {
    const conf = config.bot.levels.easy
    // on veut une faute d'entêtement ET un bruit assez haut pour que le
    // gonflement dépasse le plafond MAXIMAL qu'un tirage sain pourrait donner
    const id = trouver(i =>
      seededUnit(i, 'bot', 'error') < conf.errorRate
      && seededUnit(i, 'bot', 'kind') >= 0.5
      && seededUnit(i, 'bot', 'noise') > 0.4)
    const u = selectivity({
      mode: 'pack', rating: 88, pool: POOL, packRatings: POOL,
      fixedThreshold: conf.fixedThreshold,
    })
    const nominal = ceiling({
      bankroll: 1000, slotsMissing: 3, minBid: 10,
      kappa: conf.kappa, gamma: conf.gamma, u,
    })
    const plafondMaxSansFaute = Math.floor(nominal * (1 + conf.noise))
    expect(effectiveCeiling(vue({ level: 'easy', auctionId: id, cardRating: 88 })))
      .toBeGreaterThan(plafondMaxSansFaute)
  })

  it('ne fait jamais d’erreur aux niveaux moyen et difficile', () => {
    for (const level of ['medium', 'hard'] as const) {
      const passes = fautes.filter(id =>
        decide(vue({ level, auctionId: id, cardRating: 88, currentBid: 20 }), seq(0.99))
          .kind === 'pass')
      expect(passes).toEqual([])
    }
  })
})

describe('decide — les incréments', () => {
  it('le facile tire +10 / +50 / +100 au hasard', () => {
    const v = vue({ level: 'easy', auctionId: ID_SAIN, cardRating: 88, currentBid: 100 })
    expect(decide(v, seq(0.4))).toEqual({ kind: 'bid', amount: 110 })
    expect(decide(v, seq(0.6))).toEqual({ kind: 'bid', amount: 150 })
    expect(decide(v, seq(0.9))).toEqual({ kind: 'bid', amount: 200 })
  })

  it('le facile franchit son propre plafond d’un coup', () => {
    // c'est voulu : il décide de miser parce que le PRIX COURANT est sous son
    // plafond, puis le dépasse avec un incrément maladroit, sans jamais violer la
    // réserve. On place le prix juste sous le plafond pour que +100 le dépasse à
    // coup sûr. Note 86 plutôt que 88 : sur la meilleure carte du pack, le
    // plafond du facile talonne désormais la réserve (kappa 3) et +100 s'y ferait
    // couper au lieu d'être coupé par l'incrément — 86 laisse assez de marge sous
    // la réserve pour isoler l'un de l'autre.
    const v0 = vue({ level: 'easy', auctionId: ID_SAIN, cardRating: 86 })
    const plafond = effectiveCeiling(v0)
    const v = { ...v0, currentBid: plafond - 10 }
    expect(decide(v, seq(0.9))).toEqual({ kind: 'bid', amount: plafond + 90 })
  })

  it('le facile se replie sur +miseMin si l’incrément dépasse la réserve', () => {
    // un seul slot manquant → maxBid = bankroll = 1000, et le plafond atteint ce
    // maximum sur une carte au sommet du pack. Prix à 950 : +100 dépasse, +10 tient.
    const v = vue({
      level: 'easy', auctionId: ID_SAIN, cardRating: 88,
      slotsMissing: 1, totalSlotsMissing: 2, bankroll: 1000, currentBid: 950,
    })
    expect(decide(v, seq(0.9))).toEqual({ kind: 'bid', amount: 960 })
  })

  it('le moyen mise le minimum nécessaire quand il ne saute pas', () => {
    // rng(0.99) > jumpRate (0,15) → pas de saut
    const v = vue({ level: 'medium', cardRating: 88, currentBid: 100 })
    expect(decide(v, seq(0.99))).toEqual({ kind: 'bid', amount: 110 })
  })

  it('le moyen saute plus haut quand le tirage tombe sous jumpRate', () => {
    const v = vue({ level: 'medium', cardRating: 88, currentBid: 100 })
    const saut = decide(v, seq(0.01))
    expect(saut.kind).toBe('bid')
    if (saut.kind === 'bid') expect(saut.amount).toBeGreaterThan(110)
  })

  it('un tempérament à jumpRate nul ne saute jamais', () => {
    const bielsa = { ...NEUTRE, jumpRate: 0 }
    const v = vue({ level: 'medium', temperament: bielsa, cardRating: 88, currentBid: 100 })
    expect(decide(v, seq(0))).toEqual({ kind: 'bid', amount: 110 })
  })

  it('un bot à incréments malins ne dépasse jamais son plafond', () => {
    for (const level of ['medium', 'hard'] as const) {
      for (const r of [0, 0.01, 0.3, 0.6, 0.99]) {
        const v = vue({ level, cardRating: 88, currentBid: 100 })
        const d = decide(v, seq(r))
        expect(d.kind).toBe('bid')
        if (d.kind === 'bid') expect(d.amount).toBeLessThanOrEqual(effectiveCeiling(v))
      }
    }
  })

  it('aucun niveau ne dépasse jamais la règle de réserve', () => {
    // slotsMissing 1 et bankroll 950 → maxBid = 950 ; prix 900, donc +100 (facile)
    // et le saut du moyen sont tous deux ramenés sous la réserve
    for (const level of ['easy', 'medium', 'hard'] as const) {
      for (const r of [0, 0.4, 0.6, 0.9]) {
        const v = vue({
          level, auctionId: ID_SAIN, cardRating: 88,
          slotsMissing: 1, totalSlotsMissing: 2, bankroll: 950, currentBid: 900,
        })
        const d = decide(v, seq(r))
        expect(d.kind).toBe('bid')
        if (d.kind === 'bid') expect(d.amount).toBeLessThanOrEqual(950)
      }
    }
  })

  it('rend toujours un montant entier strictement supérieur au prix courant', () => {
    for (const level of ['easy', 'medium', 'hard'] as const) {
      const v = vue({ level, auctionId: ID_SAIN, cardRating: 88, currentBid: 137 })
      const d = decide(v, seq(0.5))
      expect(d.kind).toBe('bid')
      if (d.kind === 'bid') {
        expect(Number.isInteger(d.amount)).toBe(true)
        expect(d.amount).toBeGreaterThan(137)
      }
    }
  })
})

describe('reactionDelayMs', () => {
  it('reste dans la fourchette du niveau', () => {
    const d = reactionDelayMs(vue({ level: 'hard' }), seq(0.5))
    expect(d).toBeGreaterThanOrEqual(300)
    expect(d).toBeLessThanOrEqual(900)
  })
  it('le difficile réagit plus vite que le facile', () => {
    expect(reactionDelayMs(vue({ level: 'hard' }), seq(0.5)))
      .toBeLessThan(reactionDelayMs(vue({ level: 'easy' }), seq(0.5)))
  })
  it('le tempérament accélère ou ralentit le bot', () => {
    const rapide = { ...NEUTRE, delayFactor: 0.5 }
    expect(reactionDelayMs(vue({ temperament: rapide }), seq(0.5)))
      .toBeLessThan(reactionDelayMs(vue(), seq(0.5)))
  })
})

describe('les quatre tempéraments du config sont réellement distincts', () => {
  it('produisent quatre plafonds différents sur la même carte', () => {
    const plafonds = ['Bot Zizou', 'Bot Bielsa', 'Bot Pep', 'Bot Arsène'].map(n =>
      effectiveCeiling(vue({ level: 'hard', temperament: temperamentOf(n), cardRating: 88 })))
    expect(new Set(plafonds).size).toBe(4)
  })
})

describe('le routage niveau → mode de sélectivité', () => {
  it('chaque niveau est routé vers le mode attendu', () => {
    // Vérifié par sabotage : router le difficile vers le mode du facile laisse TOUTE
    // la suite verte, y compris les neuf tests de hiérarchie — l'écart de mode ne pèse
    // que 1 à 2 points de taux de victoire. Aucun test de comportement ne protège donc
    // ce câblage ; celui-ci le fait explicitement, sinon un renommage malheureux
    // priverait le facile de sa myopie sans que rien ne bronche.
    expect(config.bot.levels.easy.selectivity).toBe('pack')
    expect(config.bot.levels.medium.selectivity).toBe('pool')
    expect(config.bot.levels.hard.selectivity).toBe('pool')
  })

  // Fin de partie : le pool est réduit aux trois moins bonnes cartes, donc un 76
  // est devenu la MEILLEURE carte encore disponible. Le facile juge sur le pack
  // entier et la croit médiocre ; le moyen et le difficile voient le pool réel.
  // Sans ce bloc, un cerveau qui ignorerait level.selectivity passerait la suite.
  const finDePartie = { pool: [70, 72, 74], packRatings: POOL, cardRating: 76 }

  it('le facile reste myope et laisse filer la meilleure carte restante', () => {
    // Le plancher de dépense (0,45 du budget par slot) fait désormais payer le
    // facile une part réelle même sur une carte qu'il croit médiocre : une valeur
    // absolue basse n'est plus l'attendu. Ce qui distingue vraiment le facile,
    // c'est qu'il ne VOIT PAS que cette carte est devenue la meilleure du pool :
    // jugeant sur le pack entier, il reste sous son propre seuil (u = 0, plafond
    // porté par le seul plancher de dépense), là où le moyen et le difficile,
    // jugeant sur le pool réduit, la reconnaissent comme excellente (u = 1) et
    // montent jusqu'à la réserve. Mesuré : facile 625, moyen et difficile 980.
    const facile = effectiveCeiling(vue({ level: 'easy', auctionId: ID_SAIN, ...finDePartie }))
    const moyen = effectiveCeiling(vue({ level: 'medium', ...finDePartie }))
    const difficile = effectiveCeiling(vue({ level: 'hard', ...finDePartie }))
    expect(facile).toBeLessThan(moyen)
    expect(facile).toBeLessThan(difficile)
  })

  it('le moyen et le difficile voient qu’elle est devenue excellente', () => {
    for (const level of ['medium', 'hard'] as const) {
      expect(effectiveCeiling(vue({ level, ...finDePartie }))).toBeGreaterThan(500)
    }
  })

  it('la myopie du facile porte sur le pack entier, pas sur le pool restant', () => {
    // Propriété différente du premier test de ce bloc (qui compare facile et moyen
    // sur UN état de pool) : ici on fait varier le pool à niveau constant. Le mode
    // `fixed` du facile ne lit QUE `packRatings` (le pack entier, figé) — `pool` ne
    // devrait donc jamais influencer son plafond. Le mode `ratio` du moyen lit
    // `pool`, donc le sien doit bouger quand la table se vide des mauvaises cartes.
    // Mesuré : le facile reste identique à 625 des deux côtés (pool plein ou
    // appauvri) ; le moyen passe de 318 (pool plein) à 980 (pool réduit aux trois
    // moins bonnes cartes, où 76 devient la meilleure disponible — et où son
    // plafond, poussé par u = 1, vient buter sur la règle de réserve).
    const poolPlein = POOL
    const poolPauvre = [70, 72, 74]

    const facilePlein = effectiveCeiling(vue({
      level: 'easy', auctionId: ID_SAIN, cardRating: 76, pool: poolPlein, packRatings: POOL,
    }))
    const facilePauvre = effectiveCeiling(vue({
      level: 'easy', auctionId: ID_SAIN, cardRating: 76, pool: poolPauvre, packRatings: POOL,
    }))
    expect(facilePauvre).toBe(facilePlein)
    expect(facilePlein).toBe(625)

    const moyenPlein = effectiveCeiling(vue({
      level: 'medium', cardRating: 76, pool: poolPlein, packRatings: POOL,
    }))
    const moyenPauvre = effectiveCeiling(vue({
      level: 'medium', cardRating: 76, pool: poolPauvre, packRatings: POOL,
    }))
    expect(moyenPlein).toBe(318)
    expect(moyenPauvre).toBe(980)
    expect(moyenPauvre).not.toBe(moyenPlein)
  })
})

describe("les invariants que les corrections de revue ont installés", () => {
  it("surenchérit du plus petit bouton humain, pas de la mise minimale", () => {
    // Partie à mise minimale 100 : le bot doit pouvoir reprendre la carte à 410,
    // exactement comme un humain avec le bouton +10. Recoupler le pas à min_bid
    // lui ferait exiger 500 et abandonner une carte qu’il valorise 467.
    const v = vue({
      level: "medium", auctionId: ID_SAIN, cardRating: 88,
      minBid: 100, currentBid: 400,
    })
    expect(effectiveCeiling(v)).toBeGreaterThan(410)
    expect(decide(v, seq(0.99))).toEqual({ kind: "bid", amount: 410 })
  })

  it("rend la mise minimale quand le deck est plein, sans diviser par zéro", () => {
    // effectiveCeiling est exportée : elle doit tenir seule, sans compter sur la
    // garde de decide. Sans sa propre garde, budgetUtile / 0 donne Infinity, et
    // Infinity × 0 (carte médiocre, u = 0) donne NaN qui se propage en silence.
    for (const rating of [88, 70]) {
      const plafond = effectiveCeiling(vue({ slotsMissing: 0, cardRating: rating }))
      expect(Number.isNaN(plafond)).toBe(false)
      expect(plafond).toBe(10)
    }
  })

  it("ne rend jamais un plafond au-dessus de la réserve, même intenable", () => {
    // bankroll 100, 3 slots, mise minimale 50 → maxBid = 0 : le bot ne peut rien
    // miser du tout. Borner par le bas avant de borner par le haut rendrait 50,
    // soit un plafond au-dessus de la réserve.
    const v = vue({ bankroll: 100, slotsMissing: 3, minBid: 50 })
    expect(effectiveCeiling(v)).toBe(0)
    expect(decide(v, seq(0.99)).kind).toBe("pass")
  })
})

describe('topRivalCap', () => {
  it('rend la mise maximale du rival le plus riche encore en course', () => {
    const rivals = [
      { bankroll: 1000, slotsMissing: 3, passed: false },  // maxBid 980
      { bankroll: 500, slotsMissing: 1, passed: false },   // maxBid 500
    ]
    expect(topRivalCap(rivals, 10)).toBe(980)
  })
  it('ignore ceux qui ont passé', () => {
    const rivals = [
      { bankroll: 1000, slotsMissing: 3, passed: true },
      { bankroll: 500, slotsMissing: 1, passed: false },
    ]
    expect(topRivalCap(rivals, 10)).toBe(500)
  })
  it('ignore ceux qui ont fini leur deck', () => {
    const rivals = [
      { bankroll: 1000, slotsMissing: 0, passed: false },
      { bankroll: 300, slotsMissing: 2, passed: false },   // maxBid 290
    ]
    expect(topRivalCap(rivals, 10)).toBe(290)
  })
  it('rend 0 quand plus personne n’est en course', () => {
    expect(topRivalCap([{ bankroll: 1000, slotsMissing: 0, passed: true }], 10)).toBe(0)
  })
})

describe('inflationRatio', () => {
  const bornes = { min: 0.6, max: 1.6 }
  it('rend 1 sans historique : rien à corriger', () => {
    expect(inflationRatio([], bornes)).toBe(1)
  })
  it('mesure une table qui surpaye', () => {
    expect(inflationRatio([
      { theoretical: 100, price: 140 },
      { theoretical: 200, price: 280 },
    ], bornes)).toBeCloseTo(1.4)
  })
  it('mesure une table timide', () => {
    expect(inflationRatio([{ theoretical: 100, price: 70 }], bornes)).toBeCloseTo(0.7)
  })
  it('borne une folie isolée', () => {
    expect(inflationRatio([{ theoretical: 10, price: 900 }], bornes)).toBe(1.6)
  })
  it('borne une carte bradée', () => {
    expect(inflationRatio([{ theoretical: 500, price: 10 }], bornes)).toBe(0.6)
  })
  it('ignore les théoriques nulles plutôt que de diviser par zéro', () => {
    expect(inflationRatio([
      { theoretical: 0, price: 50 },
      { theoretical: 100, price: 120 },
    ], bornes)).toBeCloseTo(1.2)
  })
})

describe('effectiveCeiling — extras du difficile', () => {
  it('le difficile ne monte pas au-delà de ce que le meilleur rival peut atteindre', () => {
    const pauvre = [{ bankroll: 150, slotsMissing: 3, passed: false }]  // maxBid 130
    const v = vue({ level: 'hard', cardRating: 88, rivals: pauvre })
    expect(effectiveCeiling(v)).toBeLessThanOrEqual(140)  // 130 + miseMin
  })

  it('le moyen ignore la richesse des rivaux', () => {
    const pauvre = [{ bankroll: 150, slotsMissing: 3, passed: false }]
    const riche = [{ bankroll: 1000, slotsMissing: 3, passed: false }]
    expect(effectiveCeiling(vue({ level: 'medium', cardRating: 88, rivals: pauvre })))
      .toBe(effectiveCeiling(vue({ level: 'medium', cardRating: 88, rivals: riche })))
  })

  it('la lecture des rivaux ne force jamais une passe imméritée', () => {
    // un rival qui mène à 100 a forcément un maxBid ≥ 100, donc la borne
    // topRivalCap + miseMin laisse toujours place à une surenchère minimale
    const v = vue({
      level: 'hard', cardRating: 88, currentBid: 100,
      rivals: [{ bankroll: 110, slotsMissing: 1, passed: false }],
    })
    expect(decide(v, seq(0.99)).kind).toBe('bid')
  })

  it('le difficile relève ses plafonds face à une table qui surpaye', () => {
    const sec = vue({ level: 'hard', cardRating: 88, soldPrices: [] })
    const inflation = vue({
      level: 'hard', cardRating: 88,
      soldPrices: [{ rating: 88, price: 900 }, { rating: 86, price: 800 }],
    })
    expect(effectiveCeiling(inflation)).toBeGreaterThan(effectiveCeiling(sec))
  })

  it('la mémoire des prix ne baisse jamais un plafond, seulement le relève', () => {
    // La borne basse de `priceMemory` est 1,0 (config.json), pas 0,6 : dans ce jeu,
    // économiser est une faute, puisque la règle de réserve garantit déjà que le
    // bot complète son deck et que l'argent non dépensé ne sert qu'au départage des
    // égalités. Le mécanisme ne doit donc plus jamais faire mieux que RELEVER un
    // plafond face à une table qui surpaye ; face à une table timide, il doit
    // rendre EXACTEMENT le plafond sec, pas moins. `toBe` et non
    // `toBeLessThanOrEqual` : une égalité qui passerait aussi avec une borne basse
    // remise à 0,6 ne verrouillerait rien — vérifié par mutation, `toBe` la fait
    // échouer, la version affaiblie ne l'aurait pas fait.
    const sec = vue({ level: 'hard', cardRating: 88, soldPrices: [] })
    const timide = vue({
      level: 'hard', cardRating: 88,
      soldPrices: [{ rating: 88, price: 20 }, { rating: 86, price: 15 }],
    })
    expect(effectiveCeiling(timide)).toBe(effectiveCeiling(sec))
  })

  it('le moyen ignore les prix déjà payés', () => {
    const sec = vue({ level: 'medium', cardRating: 88, soldPrices: [] })
    const inflation = vue({
      level: 'medium', cardRating: 88,
      soldPrices: [{ rating: 88, price: 900 }],
    })
    expect(effectiveCeiling(inflation)).toBe(effectiveCeiling(sec))
  })

  it('la mémoire des prix ne fait jamais violer la règle de réserve', () => {
    const v = vue({
      level: 'hard', cardRating: 88, bankroll: 100, slotsMissing: 3,
      soldPrices: [{ rating: 88, price: 5000 }],
      rivals: [{ bankroll: 1000, slotsMissing: 3, passed: false }],
    })
    expect(effectiveCeiling(v)).toBeLessThanOrEqual(80)
  })
})

describe('la lecture des rivaux ne doit jamais brider le bot à tort', () => {
  it('ne se bride pas quand plus aucun rival ne peut suivre', () => {
    // topRivalCap rend 0, ce qui veut dire « personne ne peut me contrer », et non
    // « mon plafond vaut zéro ». Borner ici ferait passer le difficile sur une carte
    // que rien ne l'empêche de prendre.
    const seul = vue({ level: 'hard', cardRating: 88, currentBid: 50, rivals: [] })
    expect(effectiveCeiling(seul)).toBeGreaterThan(400)
    expect(decide(seul, seq(0.99)).kind).toBe('bid')
  })

  it('ne se bride pas non plus quand tous les rivaux ont passé ou fini leur deck', () => {
    const horsJeu = vue({
      level: 'hard', cardRating: 88, currentBid: 50,
      rivals: [
        { bankroll: 1000, slotsMissing: 0, passed: false },  // deck plein
        { bankroll: 1000, slotsMissing: 3, passed: true },   // a passé
      ],
    })
    expect(decide(horsJeu, seq(0.99)).kind).toBe('bid')
  })

  it('le cran au-dessus du rival est le pas de surenchère, pas la mise minimale', () => {
    // Partie à mise minimale 100. Le rival plafonne à 300 : le bot doit s'arrêter à
    // 310, ce qui suffit à le battre, et non à 400 comme si le cran valait min_bid.
    const v = vue({
      level: 'hard', auctionId: ID_SAIN, cardRating: 88, minBid: 100, currentBid: 200,
      rivals: [{ bankroll: 300, slotsMissing: 1, passed: false }],
    })
    expect(effectiveCeiling(v)).toBe(310)
  })
})
