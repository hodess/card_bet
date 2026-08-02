import { decide, poolAfter, type BotLevel, type BotView } from './botBrain'
import { temperamentOf } from './botNames'
import { maxBid } from './game'
import config from '../config.json'

// Banc d'essai : fait jouer des bots les uns contre les autres, en TypeScript pur.
//
// LIMITE ASSUMÉE : ce simulateur réimplémente la boucle d'enchère en tours
// discrets, sans minuteries ni réseau. Ce n'est PAS une réplique du serveur et il
// ne doit JAMAIS servir à valider une règle du jeu — les règles sont testées en
// pgTAP. Il sert à comparer les niveaux entre eux, rien d'autre.

// PRNG à graine explicite : les tests doivent être déterministes.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type SimPlayer = { level: BotLevel; nickname: string }
export type SimResult = {
  scores: number[]
  moneyLeft: number[]
  winners: number[]
  deckSizes: number[]
}

type Etat = {
  bankroll: number
  cards: number[]
  passed: boolean
}

function melanger<T>(items: T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function simulateGame(input: {
  players: SimPlayer[]
  ratings: number[]
  deckSize: number
  bankroll: number
  minBid: number
  rng: () => number
}): SimResult {
  const { players, deckSize, minBid, rng } = input
  const etats: Etat[] = players.map(() => ({ bankroll: input.bankroll, cards: [], passed: false }))
  const temperaments = players.map(p => temperamentOf(p.nickname))
  const tirage = melanger(input.ratings, rng)
  // Jeton propre à cette partie, mêlé à l'identifiant d'enchère : sans lui, le bruit
  // et les fautes du cerveau (dérivés d'un hachage de l'identifiant) seraient
  // IDENTIQUES dans toutes les parties, et augmenter leur nombre n'échantillonnerait
  // jamais autre chose que l'ordre des cartes.
  const jeton = Math.floor(rng() * 1e9).toString(36)
  const vues: number[] = []            // notes déjà passées en enchère
  const vendues: { rating: number; price: number }[] = []
  let ouvreur = 0
  let seq = 0

  const actifs = () => etats.map((e, i) => (e.cards.length < deckSize ? i : -1)).filter(i => i >= 0)

  while (actifs().length > 0 && seq < tirage.length) {
    const rating = tirage[seq]
    vues.push(rating)
    const enJeu = actifs()

    // Auto-complétion : dernier joueur actif, ses slots se remplissent à la mise
    // minimale (RULES.md §5).
    if (enJeu.length === 1) {
      const i = enJeu[0]
      etats[i].cards.push(rating)
      etats[i].bankroll -= minBid
      vendues.push({ rating, price: minBid })
      seq++
      continue
    }

    // Ouverture forcée : rotation parmi les joueurs actifs.
    while (!enJeu.includes(ouvreur)) ouvreur = (ouvreur + 1) % players.length
    let meneur = ouvreur
    let prix = minBid
    etats.forEach(e => { e.passed = false })

    // Tours discrets : chacun décide à son tour, jusqu'à ce que plus personne ne
    // surenchérisse. Le garde-fou sur les tours remplace le plafond de 60 s.
    // `poolAfter` est partagé avec le runtime : il gère les notes en doublon, ce
    // qu'un simple filter ne ferait pas.
    const pool = poolAfter(input.ratings, vues)
    let tours = 0
    let encore = true
    while (encore && tours < config.bot.simMaxRounds) {
      encore = false
      tours++
      for (const i of enJeu) {
        if (i === meneur || etats[i].passed) continue
        const S = deckSize - etats[i].cards.length
        const vue: BotView = {
          botPlayerId: String(i),
          level: players[i].level,
          temperament: temperaments[i],
          auctionId: `sim-${jeton}-${seq}`,
          currentBidder: String(meneur),
          currentBid: prix,
          bankroll: etats[i].bankroll,
          slotsMissing: S,
          totalSlotsMissing: enJeu.reduce((acc, j) => acc + (deckSize - etats[j].cards.length), 0),
          minBid,
          cardRating: rating,
          pool,
          packRatings: input.ratings,
          rivals: enJeu
            .filter(j => j !== i)
            .map(j => ({
              bankroll: etats[j].bankroll,
              slotsMissing: deckSize - etats[j].cards.length,
              passed: etats[j].passed,
            })),
          soldPrices: vendues,
        }
        const d = decide(vue, rng)
        if (d.kind === 'pass') { etats[i].passed = true; continue }
        if (d.kind === 'bid' && d.amount > prix
            && d.amount <= maxBid(etats[i].bankroll, S, minBid)) {
          prix = d.amount
          meneur = i
          encore = true
        }
      }
    }

    etats[meneur].cards.push(rating)
    etats[meneur].bankroll -= prix
    vendues.push({ rating, price: prix })
    ouvreur = (ouvreur + 1) % players.length
    seq++
  }

  const scores = etats.map(e => e.cards.reduce((a, b) => a + b, 0))
  const moneyLeft = etats.map(e => e.bankroll)
  // Classement : total des notes, puis argent restant (RULES.md §6).
  const meilleur = Math.max(...scores)
  const candidats = scores.map((s, i) => (s === meilleur ? i : -1)).filter(i => i >= 0)
  const meilleurArgent = Math.max(...candidats.map(i => moneyLeft[i]))
  const winners = candidats.filter(i => moneyLeft[i] === meilleurArgent)
  const deckSizes = etats.map(e => e.cards.length)
  return { scores, moneyLeft, winners, deckSizes }
}

// Taux de victoire par siège sur `games` parties. Une victoire partagée compte
// pour une fraction, sinon une égalité gonflerait les deux camps.
export function winRates(input: {
  players: SimPlayer[]
  ratings: number[]
  deckSize: number
  bankroll: number
  minBid: number
  games: number
  seed: number
}): number[] {
  const total = new Array(input.players.length).fill(0)
  for (let g = 0; g < input.games; g++) {
    const r = simulateGame({ ...input, rng: mulberry32(input.seed + g) })
    for (const w of r.winners) total[w] += 1 / r.winners.length
  }
  return total.map(v => v / input.games)
}
