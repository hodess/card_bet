import config from '../config.json'
import { maxBid } from './game'
import type { Temperament } from './botNames'

// Le pas de surenchère du bot est le plus petit bouton dont dispose un humain, et
// NON la mise minimale de la partie : le serveur n'exige que « strictement plus que
// le prix courant », et BidButtons propose +10 quelle que soit min_bid. Coupler le
// pas à min_bid ferait abandonner au bot des cartes qu'un humain reprendrait.
const PAS_SURENCHERE = config.game.ui.increments[0]

export type BotLevel = 'easy' | 'medium' | 'hard'
export type Selectivity = 'fixed' | 'ratio'

// Fraction des notes strictement inférieures. Un pool vide rend 1 : s'il ne reste
// rien à tirer, la carte devant nous est par définition la meilleure disponible.
export function percentile(ratings: number[], rating: number): number {
  if (ratings.length === 0) return 1
  return ratings.filter(r => r < rating).length / ratings.length
}

// Retire du pack les notes déjà passées en enchère, en respectant les doublons :
// deux cartes à 88 sorties ne doivent retirer que deux 88 du pool. Partagé par le
// runtime (bot.ts) et le banc d'essai (botSim.ts).
export function poolAfter(pack: number[], seen: number[]): number[] {
  const restant = [...pack]
  for (const v of seen) {
    const i = restant.indexOf(v)
    if (i >= 0) restant.splice(i, 1)
  }
  return restant
}

// Rampe linéaire au-dessus d'un seuil : 0 en dessous, 1 tout en haut du pool.
function ramp(q: number, seuil: number): number {
  if (seuil >= 1) return q >= 1 ? 1 : 0
  return Math.max(0, (q - seuil) / (1 - seuil))
}

// u ∈ [0, 1] : à quel point la carte mérite qu'on ouvre le portefeuille.
//
// Propriété du jeu à garder en tête : les bankrolls sont égales et il se vend
// exactement T = N × S cartes, donc le budget par carte vendue vaut bankroll / S
// QUEL QUE SOIT le nombre de joueurs. Le niveau de prix d'équilibre ne dépend
// donc presque pas de N. `ratio` sur-réagit au nombre de joueurs, ce qui est la
// faiblesse voulue du niveau moyen.
//
// Un troisième mode a existé ici : `hypergeometric`, l'espérance hypergéométrique
// du nombre de cartes meilleures qui allaient encore sortir, censé donner au
// difficile une lecture plus juste de l'état de la partie que `ratio`. Mesuré par
// mutation, il n'apportait rien : router le difficile vers `ratio` (ce fichier)
// donne un meilleur taux de victoire face au moyen (0,740 contre 0,717), et même
// le router vers `fixed` laissait les 232 tests verts. La force du difficile vient
// de son plancher de dépense adaptatif, de sa mémoire des prix et de son faible
// bruit — pas de cette formule. Retiré faute d'apport démontré ; ne pas le
// réinventer sans nouvelle mesure qui le justifie.
export function selectivity(input: {
  mode: Selectivity
  rating: number
  pool: number[]
  packRatings: number[]
  slotsMissing: number        // S
  totalSlotsMissing: number   // T — aussi le nombre de cartes encore à tirer
  fixedThreshold: number
}): number {
  const { mode, rating, pool, packRatings, slotsMissing: S, totalSlotsMissing: T } = input

  // Facile : il juge sur le pack ENTIER, sans compter les cartes déjà sorties. Bêtise
  // réaliste — en fin de partie il croit encore qu'un 84 est médiocre alors que c'est
  // devenu la meilleure carte disponible, et il la laisse filer.
  if (mode === 'fixed') return ramp(percentile(packRatings, rating), input.fixedThreshold)

  // Moyen (et difficile) : seuil adaptatif, fiable mais faux quand la table se remplit.
  return ramp(percentile(pool, rating), T > 0 ? 1 - S / T : 0)
}

// Le plafond théorique, en euros. `budgetUtile / S` est la part d'argent
// discrétionnaire par slot restant ; κ autorise à la dépasser sur une carte
// exceptionnelle, γ règle la vitesse à laquelle le plafond monte avec la qualité.
// La règle de réserve borne toujours le résultat (elle est de toute façon
// revalidée par place_bid, mais autant ne pas se faire refuser).
export function ceiling(input: {
  bankroll: number
  slotsMissing: number
  minBid: number
  kappa: number
  gamma: number
  u: number
}): number {
  const { bankroll, slotsMissing: S, minBid, kappa, gamma, u } = input
  const budgetUtile = Math.max(0, bankroll - S * minBid)
  const brut = minBid + (budgetUtile / S) * kappa * Math.pow(u, gamma)
  return Math.floor(Math.min(brut, maxBid(bankroll, S, minBid)))
}

export type BotView = {
  botPlayerId: string
  level: BotLevel
  temperament: Temperament
  auctionId: string           // clé du bruit et de la faute : une fois par enchère
  currentBidder: string
  currentBid: number
  bankroll: number
  slotsMissing: number        // S
  totalSlotsMissing: number   // T — joueurs ACTIFS (deck incomplet), moi inclus
  minBid: number
  cardRating: number
  pool: number[]              // notes n'ayant fait l'objet d'aucune enchère
  packRatings: number[]       // notes du pack entier (facile)
  // rivaux EN COURSE = actifs et n'ayant pas passé sur l'enchère en cours
  rivals: { bankroll: number; slotsMissing: number; passed: boolean }[]
  soldPrices: { rating: number; price: number }[]
}

export type BotDecision =
  | { kind: 'bid'; amount: number }
  | { kind: 'pass' }
  | { kind: 'wait' }

type Faute = 'renoncement' | 'entetement' | null

// Hash déterministe (FNV-1a 32 bits) → [0, 1). Le bruit et la faute doivent être
// tirés UNE FOIS PAR ENCHÈRE : avec un rng appelé à chaque tick, le plafond
// vacillerait et le bot miserait puis passerait sur la même carte au même prix.
// Un hash du couple (enchère, bot) donne cette stabilité sans rien mémoriser.
export function seededUnit(...parts: string[]): number {
  let h = 0x811c9dc5
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h ^= part.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
  }
  return (h >>> 0) / 0x100000000
}

function drawnFault(view: BotView): Faute {
  const level = config.bot.levels[view.level]
  if (seededUnit(view.auctionId, view.botPlayerId, 'error') >= level.errorRate) return null
  return seededUnit(view.auctionId, view.botPlayerId, 'kind') < config.bot.faultRenunciationShare
    ? 'renoncement'
    : 'entetement'
}

// Le plafond théorique pour une note donnée, sans retenue ni bruit. Sert au
// plafond effectif et, en Task 5, à mesurer l'inflation de la table.
function theoreticalFor(view: BotView, rating: number): number {
  const level = config.bot.levels[view.level]
  const t = view.temperament
  const u = selectivity({
    mode: level.selectivity as Selectivity,
    rating,
    pool: view.pool,
    packRatings: view.packRatings,
    slotsMissing: view.slotsMissing,
    totalSlotsMissing: view.totalSlotsMissing,
    fixedThreshold: level.fixedThreshold,
  })
  // Plancher de dépense : la part du budget par slot que le bot engage même sur une
  // carte qu'il ne vise pas. Sans lui, il refuse presque tout et finit avec un deck
  // de rebuts et un portefeuille plein — or l'argent ne départage que les égalités,
  // la règle de réserve garantissant déjà qu'il complétera son deck. Le banc d'essai
  // a mesuré 0,07 contre 0,93 pour quatre bots difficiles sans plancher face à
  // quatre faciles.
  // Le difficile module ce plancher par S / T : plus la table est grande, moins il
  // gaspille sur les cartes qu'il ne vise pas, et plus il garde pour celles qu'il a
  // identifiées. Le banc d'essai a validé ce sens et réfuté l'inverse.
  const echelle = level.spendFloorAdapts && view.totalSlotsMissing > 0
    ? view.slotsMissing / view.totalSlotsMissing
    : 1
  const plancher = level.spendFloor * echelle
  const uPlancher = plancher + (1 - plancher) * u
  return ceiling({
    bankroll: view.bankroll,
    slotsMissing: view.slotsMissing,
    minBid: view.minBid,
    kappa: level.kappa * t.kappa,
    gamma: level.gamma * t.gamma,
    u: uPlancher,
  })
}

// La mise maximale que peut atteindre le rival le plus riche ENCORE EN COURSE :
// actif (deck incomplet) et n'ayant pas passé sur l'enchère en cours.
export function topRivalCap(
  rivals: { bankroll: number; slotsMissing: number; passed: boolean }[],
  minBid: number,
): number {
  const enCourse = rivals.filter(r => !r.passed && r.slotsMissing > 0)
  if (enCourse.length === 0) return 0
  return Math.max(...enCourse.map(r => maxBid(r.bankroll, r.slotsMissing, minBid)))
}

// Le niveau de prix réel de la table, rapporté à la théorie du bot. Table
// agressive → il relève, sinon il ne gagne jamais rien ; table timide → il baisse
// et empoche le départage à l'argent restant. Borné pour qu'une carte bradée ou
// une folie isolée ne l'affole pas.
export function inflationRatio(
  sold: { theoretical: number; price: number }[],
  bounds: { min: number; max: number },
): number {
  const utilisables = sold.filter(s => s.theoretical > 0)
  if (utilisables.length === 0) return 1
  const moyenne = utilisables.reduce((acc, s) => acc + s.price / s.theoretical, 0)
    / utilisables.length
  return Math.min(bounds.max, Math.max(bounds.min, moyenne))
}

// Le plafond réellement utilisé. La retenue est le point important : la valeur
// d'une carte est COMMUNE (tout le monde voit la même note et le même pool), donc
// un bot qui monte jusqu'à sa valeur calculée paie exactement ce que la carte vaut
// et ne gagne rien à l'avoir — la malédiction du vainqueur. Miser en dessous est
// la bonne stratégie, et c'est aussi ce qui fait décrocher les bots à des prix
// différents plutôt qu'au même centime.
export function effectiveCeiling(view: BotView): number {
  // Contrat : un bot au deck plein n'a plus rien à valoriser, et `ceiling`
  // diviserait par zéro (budgetUtile / S). `decide` garde déjà ce cas, mais cette
  // fonction est exportée : elle doit tenir seule.
  if (view.slotsMissing <= 0) return view.minBid

  const level = config.bot.levels[view.level]
  let plafond = theoreticalFor(view, view.cardRating) * view.temperament.restraint
  const bruit = seededUnit(view.auctionId, view.botPlayerId, 'noise') * 2 - 1
  plafond *= 1 + level.noise * bruit

  // La théorie de référence est celle du bot À SON ÉTAT ACTUEL : on ne rejoue pas
  // l'historique. La question posée est bien « la table paye-t-elle plus que ce que
  // JE paierais », et c'est le signal utile.
  if (level.priceMemory) {
    plafond *= inflationRatio(
      view.soldPrices.map(s => ({ theoretical: theoreticalFor(view, s.rating), price: s.price })),
      config.bot.priceMemory,
    )
  }

  if (drawnFault(view) === 'entetement') plafond *= level.errorOverbid

  // Inutile de dépasser ce que le meilleur rival encore en course peut atteindre :
  // un cran au-dessus suffit à emporter la carte. Le cran est PAS_SURENCHERE et non
  // la mise minimale de la partie, pour la même raison qu'ailleurs dans ce fichier.
  // Et un plafond rival NUL veut dire « plus personne ne peut suivre », donc aucune
  // contrainte : borner à ce moment-là ferait passer le bot sur une carte libre.
  if (level.readsRivals) {
    const rival = topRivalCap(view.rivals, view.minBid)
    if (rival > 0) plafond = Math.min(plafond, rival + PAS_SURENCHERE)
  }

  const cap = maxBid(view.bankroll, view.slotsMissing, view.minBid)
  // Plancher = mise minimale PLUS un cran. C'est ce qui rend réel le « ramasser le
  // reste à la mise minimale » : l'ouverture forcée est déjà à minBid, donc un
  // plafond égal à minBid empêche le bot de surenchérir ne serait-ce qu'une fois, et
  // il refuse la carte au lieu de la prendre pour rien. Avec ce cran, il prend les
  // cartes que personne ne dispute et ne se bat que sur celles qu'il valorise.
  // La réserve borne toujours EN DERNIER : borner par le bas avant de borner par le
  // haut rendrait un plafond au-dessus de maxBid quand la réserve est intenable.
  return Math.floor(Math.min(Math.max(view.minBid + PAS_SURENCHERE, plafond), cap))
}

function bidAmount(view: BotView, limite: number, cap: number, rng: () => number): number {
  const level = config.bot.levels[view.level]
  const minimum = view.currentBid + PAS_SURENCHERE

  // Facile : incréments maladroits, bornés par la règle de réserve SEULEMENT et
  // jamais par son plafond. C'est ainsi qu'il perd de l'argent bêtement.
  if (!level.smartIncrements) {
    // Poids cumulés lus du config : sans ça, ajouter un bouton d'incrément au jeu
    // rendrait le dernier inatteignable pour le bot, silencieusement.
    const incs = config.game.ui.increments
    // Un poids par incrément, dans le même ordre que config.game.ui.increments :
    // ajouter un bouton sans ajouter son poids le rendrait inatteignable au bot.
    const poids = config.bot.easyIncrementWeights
    const r = rng()
    let cumul = 0
    let inc = incs[incs.length - 1]
    for (let i = 0; i < incs.length; i++) {
      cumul += poids[i] ?? 0
      if (r < cumul) { inc = incs[i]; break }
    }
    const brut = view.currentBid + inc
    return brut <= cap ? brut : minimum
  }

  // Malins : le minimum nécessaire pour reprendre la tête, plus un gros saut
  // occasionnel pour décourager les indécis. Jamais au-delà du plafond.
  const saute = rng() < level.jumpRate * view.temperament.jumpRate
  const cible = saute
    ? view.currentBid + (limite - view.currentBid) * config.bot.jumpFraction
    : minimum
  return Math.max(minimum, Math.min(Math.floor(cible), limite))
}

// Surenchérir tant que le prix reste sous le plafond, passer dès qu'il le dépasse.
export function decide(view: BotView, rng: () => number): BotDecision {
  if (view.slotsMissing <= 0) return { kind: 'wait' }
  if (view.currentBidder === view.botPlayerId) return { kind: 'wait' }
  if (drawnFault(view) === 'renoncement') return { kind: 'pass' }

  const cap = maxBid(view.bankroll, view.slotsMissing, view.minBid)
  const limite = Math.min(effectiveCeiling(view), cap)
  if (view.currentBid + PAS_SURENCHERE > limite) return { kind: 'pass' }
  return { kind: 'bid', amount: bidAmount(view, limite, cap, rng) }
}

// Le temps que le bot laisse passer avant d'envoyer sa mise.
export function reactionDelayMs(view: BotView, rng: () => number): number {
  const level = config.bot.levels[view.level]
  const brut = level.delayMinMs + rng() * (level.delayMaxMs - level.delayMinMs)
  return Math.round(brut * view.temperament.delayFactor)
}
