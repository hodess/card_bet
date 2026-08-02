import config from '../config.json'
import { maxBid } from './game'
import type { Temperament } from './botNames'

// Le pas de surenchère du bot est le plus petit bouton dont dispose un humain, et
// NON la mise minimale de la partie : le serveur n'exige que « strictement plus que
// le prix courant », et BidButtons propose +10 quelle que soit min_bid. Coupler le
// pas à min_bid ferait abandonner au bot des cartes qu'un humain reprendrait.
const PAS_SURENCHERE = config.game.ui.increments[0]

export type BotLevel = 'easy' | 'medium' | 'hard'
export type Selectivity = 'pack' | 'pool'

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
// Deux modes seulement : `pack` juge sur le pack entier (le facile, qui ne compte
// pas les cartes sorties et croit encore qu'un 84 est médiocre en fin de partie),
// `pool` juge sur ce qui reste à tirer. Apport mesuré de cette distinction : 1 à
// 2 points de taux de victoire. Faible, mais dans le bon sens, et surtout lisible
// pour le joueur — c'est une erreur humaine reconnaissable.
//
// DEUX MODES ONT ÉTÉ ESSAYÉS PUIS RETIRÉS, ne pas les réinventer sans mesure :
//
// - `hypergeometric`, l'espérance du nombre de cartes meilleures encore à sortir.
//   Router le difficile vers un mode plus simple donnait un MEILLEUR taux.
// - `table`, qui adaptait le seuil d'exigence au nombre de tirages restants
//   (`1 − S/T`), c'est-à-dire au nombre de joueurs. C'était la demande initiale du
//   chantier, et le banc l'a réfutée : le difficile tombait de 0,656 à 0,538 face
//   au moyen à 4 joueurs, et de 0,658 à 0,512 à 8 joueurs. La raison tient au jeu
//   lui-même — on ne peut pas réserver ses slots, il FAUT les remplir, donc devenir
//   plus exigeant parce que la table est grande revient à se faire souffler les
//   bonnes cartes puis à ramasser les rebuts.
//
// Ce qui adapte réellement le bot à l'état de la partie, c'est `budgetUtile / S`
// (la part par slot monte à mesure que le deck se remplit) et la composition du
// pool restant — pas un seuil indexé sur le nombre de joueurs.
export function selectivity(input: {
  mode: Selectivity
  rating: number
  pool: number[]
  packRatings: number[]
  fixedThreshold: number
}): number {
  const { mode, rating, pool, packRatings } = input

  // Facile : juge sur le pack ENTIER, sans compter les cartes déjà sorties. Après
  // dix cartes il croit encore qu'un 84 est médiocre, alors que c'est devenu la
  // meilleure carte disponible. Il laisse filer les bonnes cartes de fin de partie.
  if (mode === 'pack') return ramp(percentile(packRatings, rating), input.fixedThreshold)

  // Moyen et difficile : ils comptent les cartes, donc jugent sur le pool restant.
  // Ce qui les sépare n'est pas ce raisonnement mais sa PRÉCISION — bruit, fautes,
  // plancher de dépense, lecture des adversaires, mémoire des prix.
  return ramp(percentile(pool, rating), input.fixedThreshold)
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
    fixedThreshold: level.fixedThreshold,
  })
  // Plancher de dépense : la part du budget par slot que le bot engage même sur une
  // carte qu'il ne vise pas. Sans lui, il refuse presque tout et finit avec un deck
  // de rebuts et un portefeuille plein — or l'argent ne départage que les égalités,
  // la règle de réserve garantissant déjà qu'il complétera son deck. Le banc d'essai
  // a mesuré 0,07 contre 0,93 pour quatre bots difficiles sans plancher face à
  // quatre faciles.
  //
  // Le plancher seul ne suffit pas à faire dépenser : il faut aussi un κ élevé et
  // un γ de 1, sans quoi les cartes moyennes sont écrasées et les bots terminent
  // avec la moitié de leur bankroll. Une partie réelle à 4 joueurs a montré des
  // bots gardant 519 à 697 € sur 1000, et un humain raflant un 89 pour 230 €.
  //
  // Une variante modulait ce plancher par S / T pour le niveau difficile. Retirée :
  // à 4 joueurs elle le ramenait à 0,07, le rendait muet, et il gagnait alors par
  // l'auto-complétion — en laissant les autres remplir leur deck pour ramasser les
  // dernières cartes à la mise minimale. Gagner en se taisant n'est pas jouer.
  const plancher = level.spendFloor
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
