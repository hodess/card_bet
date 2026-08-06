import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import config from '../config.json'
import {
  canFly, DISCARD_MS, flyTransform, isSettled, isUrgent, MIN_JOKER_WINDOW_MS, nextPhase,
  pauseRemaining, phaseDuration, pipStates, SEQUENCE_MS, showPips, sortieDe, venteDe,
} from './auctionPhase'

const A = config.ui.auction

describe('nextPhase', () => {
  it('enchaîne une carte du reveal au landed puis reboucle', () => {
    expect(nextPhase('reveal')).toBe('pause')
    expect(nextPhase('pause')).toBe('bid')
    expect(nextPhase('bid')).toBe('sold')
    expect(nextPhase('sold')).toBe('fly')
    expect(nextPhase('fly')).toBe('landed')
    expect(nextPhase('landed')).toBe('reveal')
  })
})

describe('phaseDuration', () => {
  it('lit les durées dans la config', () => {
    expect(phaseDuration('reveal')).toBe(A.revealMs)
    expect(phaseDuration('sold')).toBe(A.soldMs)
    expect(phaseDuration('fly')).toBe(A.flyMs)
    expect(phaseDuration('landed')).toBe(A.landedMs)
  })
  it('donne 0 pour bid : la durée vient du serveur, pas d\'un timer', () => {
    expect(phaseDuration('bid')).toBe(0)
  })
})

describe('venteDe', () => {
  const owned = [
    { card_id: 7, player_id: 'p1', price_paid: 120 },
    { card_id: 9, player_id: 'p2', price_paid: 40 },
  ]
  it('rend le gagnant et le prix payés par le serveur', () => {
    expect(venteDe(owned, 9)).toEqual({ winnerId: 'p2', amount: 40 })
  })
  it('rend null tant que la carte n\'est pas adjugée', () => {
    expect(venteDe(owned, 3)).toBeNull()
    expect(venteDe([], 7)).toBeNull()
  })
})

describe('sortieDe', () => {
  const quittee = { id: 'a1', card_id: 7 }
  const vendue = [{ card_id: 7, player_id: 'p1', price_paid: 120 }]

  it('suit le statut serveur, pas la présence d’une ligne player_cards', () => {
    expect(sortieDe(quittee, { id: 'a1', status: 'sold' }, vendue)).toBe('sold')
    expect(sortieDe(quittee, { id: 'a1', status: 'discarded' }, [])).toBe('discarded')
  })
  it('dit « vendue » quand le serveur l’a vendue mais que player_cards n’est pas encore lu', () => {
    // Le cas que l'inférence ratait : lecture d'`auctions` après le commit,
    // lecture de `player_cards` avant. La carte volait vers nulle part, tamponnée
    // « Joker », sur toute clôture immédiate sans challenger.
    expect(sortieDe(quittee, { id: 'a1', status: 'sold' }, [])).toBe('sold')
  })
  it('retombe sur player_cards quand la ligne lue n’est pas celle qu’on quitte', () => {
    expect(sortieDe(quittee, { id: 'autre', status: 'discarded' }, vendue)).toBe('sold')
    expect(sortieDe(quittee, null, vendue)).toBe('sold')
    expect(sortieDe(quittee, null, [])).toBe('discarded')
  })
})

describe('isUrgent', () => {
  it('vrai juste sous le seuil, faux au-dessus', () => {
    expect(isUrgent(A.urgentMs - 1)).toBe(true)
    expect(isUrgent(A.urgentMs)).toBe(false)
    expect(isUrgent(A.urgentMs + 500)).toBe(false)
  })
  it('faux à zéro ou en négatif : l\'enchère est finie, pas urgente', () => {
    expect(isUrgent(0)).toBe(false)
    expect(isUrgent(-200)).toBe(false)
  })
})

describe('isSettled', () => {
  it('vrai pendant les trois phases d\'adjudication', () => {
    expect(isSettled('sold')).toBe(true)
    expect(isSettled('fly')).toBe(true)
    expect(isSettled('landed')).toBe(true)
  })
  it('faux avant l\'adjudication', () => {
    expect(isSettled('reveal')).toBe(false)
    expect(isSettled('bid')).toBe(false)
  })
})

describe('showPips', () => {
  it('affiche les pips jusqu\'à maxPips, plus au-delà', () => {
    expect(showPips(A.maxPips)).toBe(true)
    expect(showPips(A.maxPips + 1)).toBe(false)
  })
})

describe('pipStates', () => {
  it('marque les cartes passées, la courante et les suivantes', () => {
    // seq est 1-based : à la 2e carte sur 4, une seule est déjà gagnée
    expect(pipStates(4, 2)).toEqual(['won', 'current', 'todo', 'todo'])
  })
  it('gère la première et la dernière carte', () => {
    expect(pipStates(3, 1)).toEqual(['current', 'todo', 'todo'])
    expect(pipStates(3, 3)).toEqual(['won', 'won', 'current'])
  })
  it('borne un seq hors plage plutôt que de rendre un tableau incohérent', () => {
    expect(pipStates(3, 0)).toEqual(['current', 'todo', 'todo'])
    expect(pipStates(3, 9)).toEqual(['won', 'won', 'current'])
  })
})

describe('flyTransform', () => {
  it('translate du centre de la carte vers le centre de la cible', () => {
    const card = { left: 100, top: 200, width: 210, height: 280 }   // centre 205 / 340
    const target = { left: 300, top: 600, width: 40, height: 14 }   // centre 320 / 607
    expect(flyTransform(card, target)).toBe('translate(115px, 267px) scale(.09) rotate(8deg)')
  })
  it('arrondit à l\'entier : pas de sous-pixel dans un transform', () => {
    const card = { left: 0, top: 0, width: 211, height: 281 }
    const target = { left: 0, top: 0, width: 40, height: 14 }
    expect(flyTransform(card, target)).toBe('translate(-85px, -133px) scale(.09) rotate(8deg)')
  })
})

describe('canFly', () => {
  it('refuse une cible absente ou non mesurée', () => {
    expect(canFly(null, 800)).toBe(false)
    expect(canFly({ left: 0, top: 10, width: 0, height: 0 }, 800)).toBe(false)
  })
  it('refuse une cible hors viewport (ligne scrollée)', () => {
    expect(canFly({ left: 0, top: -40, width: 40, height: 14 }, 800)).toBe(false)
    expect(canFly({ left: 0, top: 900, width: 40, height: 14 }, 800)).toBe(false)
  })
  it('accepte une cible visible', () => {
    expect(canFly({ left: 0, top: 640, width: 40, height: 14 }, 800)).toBe(true)
  })
})

describe('pauseRemaining', () => {
  it('rend le temps restant avant que l’enchère devienne vivante', () => {
    expect(pauseRemaining(10_000, 2_000)) .toBe(8_000)
  })
  it('ne descend pas sous zéro une fois l’enchère démarrée', () => {
    expect(pauseRemaining(1_000, 5_000)).toBe(0)
  })
})

describe('enchaînement des phases', () => {
  it('révèle la carte, puis attend l’ouverture avant de laisser miser', () => {
    expect(nextPhase('reveal')).toBe('pause')
    expect(nextPhase('pause')).toBe('bid')
  })
  it('enchaîne sur la carte suivante après une défausse', () => {
    expect(nextPhase('discarded')).toBe('reveal')
  })
})

describe('isSettled', () => {
  it('tient une défausse pour une enchère terminée', () => {
    expect(isSettled('discarded')).toBe(true)
  })
  it('ne tient pas la pause pour une enchère terminée', () => {
    expect(isSettled('pause')).toBe(false)
  })
})

// La temporisation serveur porte DEUX choses à la fois : la séquence d'adjudication
// animée côté client, puis la décision de l'ouvreur sur son joker. « L'animation
// tient » ne suffit donc pas — c'est ce que vérifiait la version précédente de ce
// test, avec zéro marge, et un ouvreur humain n'avait alors rien pour vetoer quand
// les bots, qui n'animent rien, gardaient leur fenêtre entière.
describe('temporisation et animation', () => {
  const plancherMs = config.game.limits.closeDelaySeconds.min * 1000
  it('laisse une fenêtre de décision après la séquence d’adjudication', () => {
    expect(SEQUENCE_MS + MIN_JOKER_WINDOW_MS).toBeLessThanOrEqual(plancherMs)
  })
  it('laisse la même fenêtre après une défausse', () => {
    // La machine à états enchaîne discarded PUIS reveal avant la pause
    // (useAuctionPhase.ts) : le terme à comparer doit donc inclure la durée de
    // révélation, exactement comme SEQUENCE_MS l'inclut déjà côté vente.
    expect(DISCARD_MS + A.revealMs + MIN_JOKER_WINDOW_MS).toBeLessThanOrEqual(plancherMs)
  })
})

// Le test ci-dessus ne vaut que si le plancher lu dans config.json est bien celui
// que le serveur applique — sinon le curseur du salon proposerait des réglages que
// Postgres refuse, ou l'inverse. Les deux valeurs vivaient côte à côte par entretien
// manuel : on ferme la boucle en lisant la migration sur disque, comme
// `packs.test.ts` lit `seed.sql`.
const MIGRATIONS = join(fileURLToPath(new URL('../..', import.meta.url)), 'supabase/migrations')

// La dernière migration qui parle du motif fait autorité : en prod comme en local,
// c'est l'ordre des horodatages qui tranche (cf. CLAUDE.md).
function derniereMigrationAvec(motif: RegExp): string {
  const fichiers = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort().reverse()
  for (const f of fichiers) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8')
    if (motif.test(sql)) return sql
  }
  throw new Error(`aucune migration ne correspond à ${motif}`)
}

describe('bornes du délai d’adjudication : config.json contre le SQL', () => {
  const limites = config.game.limits.closeDelaySeconds

  it('borne la colonne games exactement comme le curseur du salon', () => {
    const borne = /check \(close_delay_seconds between (\d+) and (\d+)\)/
      .exec(derniereMigrationAvec(/games_close_delay_seconds_check/))
    expect(borne, 'contrainte games_close_delay_seconds_check introuvable').not.toBeNull()
    expect(Number(borne![1])).toBe(limites.min)
    expect(Number(borne![2])).toBe(limites.max)
  })

  it('donne à create_game le même défaut que le front, et au-dessus du plancher', () => {
    const motif = /coalesce\(p_close_delay_seconds, (\d+)\)/
    const defaut = Number(motif.exec(derniereMigrationAvec(motif))![1])
    // Un défaut sous le plancher rendrait INVALID_SETTINGS systématique pour tout
    // appelant qui ne précise rien — presque tous les tests pgTAP.
    expect(defaut).toBe(config.game.closeDelaySeconds)
    expect(defaut).toBeGreaterThanOrEqual(limites.min)
  })
})
