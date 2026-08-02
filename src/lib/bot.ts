import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { decide, poolAfter, reactionDelayMs, type BotLevel, type BotView } from './botBrain'
import { temperamentOf } from './botNames'
import config from '../config.json'

// Le runtime d'un bot : un client Supabase anonyme qui collecte l'état, appelle le
// cerveau (src/lib/botBrain.ts) et exécute sa décision. Aucune logique de jeu ici.
export function startBot(gameCode: string, nickname: string, level: BotLevel): () => void {
  let stopped = false
  let bidInFlight = false
  let seated = false
  let timer: ReturnType<typeof setInterval> | undefined
  const temperament = temperamentOf(nickname)
  // Une seule décision de passe par enchère : `decide` rend `pass` à CHAQUE tick tant
  // que la situation ne change pas (le currentBid ne bouge pas, le bruit est figé par
  // enchère). Sans ce garde-fou le bot rappellerait `pass_auction` toutes les 800 ms
  // sur la même enchère, en pure perte : `auction.passed.includes(me.id)` (vérifié
  // plus bas) finit par filtrer une fois la réplication faite, mais le délai entre
  // l'appel RPC et sa réplication laisserait passer plusieurs appels en double
  // (erreurs `ALREADY_PASSED`). Ce `Set` est la ceinture, ce filtre est les bretelles.
  const passRolled = new Set<string>()
  // Le pack ne change jamais : une seule lecture pour toute la partie, indexée par
  // id de carte pour servir aussi bien la note de la carte en cours que celles des
  // cartes déjà passées en enchère.
  //
  // On garde le pack ENTIER, cartes retirées incluses, mais le pool ne retient que
  // les non retirées : `start_game` ne verse que celles-là dans la partie, donc un
  // pool qui les compterait serait faussé. En revanche la recherche de note doit
  // rester robuste — un auteur peut retirer une carte pendant qu'une partie tourne,
  // et cette carte est déjà en jeu.
  let pack: Map<number, { rating: number; retired: boolean }> | null = null

  const bot = createClient<Database>(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, storageKey: `cardbet-bot-${nickname}` } },
  )

  const stop = () => {
    stopped = true
    if (timer) clearInterval(timer)
    bot.auth.stopAutoRefresh()
  }

  const run = async () => {
    const { error: authError } = await bot.auth.signInAnonymously()
    if (authError || stopped) return
    const { data, error } = await bot.rpc('join_game', {
      game_code: gameCode, nickname, p_is_bot: true, p_bot_level: level,
    })
    if (error || stopped) return
    const gameId = (data as { game_id: string }).game_id
    const { data: auth } = await bot.auth.getUser()
    if (stopped) return
    const botUid = auth.user?.id

    const tick = async () => {
      if (stopped || bidInFlight) return
      const [gameRes, auctionRes, playersRes, cardsRes] = await Promise.all([
        bot.from('games').select('status, deck_size, min_bid, pack').eq('id', gameId).maybeSingle(),
        // liste entière et non limit(1) : les cartes déjà passées en enchère servent
        // au comptage du pool restant (≤ 40 lignes, coût négligeable)
        bot.from('auctions').select('*').eq('game_id', gameId).order('seq', { ascending: false }),
        bot.from('players').select('*').eq('game_id', gameId),
        bot.from('player_cards').select('player_id, card_id, price_paid').eq('game_id', gameId),
      ])
      const game = gameRes.data
      // absence réelle (partie introuvable ou finie) arrête le bot ; une lecture en
      // erreur (coupure, 401, rate limit) ne fait qu'attendre le tick suivant
      if (!game) { if (!gameRes.error) stop(); return }
      if (game.status === 'finished') { stop(); return }
      const auctions = auctionRes.data ?? []
      const auction = auctions[0]
      const me = playersRes.data?.find(p => p.auth_uid === botUid)
      if (me) seated = true
      // exclu par l'hôte : sa ligne a disparu après être apparue — mais seulement si
      // la lecture a réussi, sinon une requête en erreur (coupure, 401, rate limit)
      // ferait croire à une exclusion et tuerait le bot à tort
      else if (seated && !playersRes.error) { stop(); return }
      if (game.status !== 'playing' || !auction || auction.status !== 'open' || !me) return
      // sursis de révélation : le serveur refuse mises et passes avant l'ouverture
      if (new Date(auction.opened_at).getTime() > Date.now()) return
      if (auction.passed.includes(me.id)) return

      // Le pack entier, une seule fois pour toute la partie. C'est CE cache qui
      // garantit le coût réseau constant : la note de la carte en cours comme celles
      // des cartes déjà passées se lisent dedans, sans requête supplémentaire par
      // tick. Toutes les cartes d'une partie viennent du pack de la partie.
      if (pack === null) {
        const { data: rows, error: packError } = await bot
          .from('cards').select('id, rating, retired').eq('pack', game.pack)
        if (packError || !rows) return   // on retentera au tick suivant
        pack = new Map(rows.map(c => [c.id, { rating: c.rating, retired: c.retired }]))
      }
      const noteDe = (cardId: number) => pack!.get(cardId)?.rating
      const packRatings = [...pack.values()].filter(c => !c.retired).map(c => c.rating)

      const cardRating = noteDe(auction.card_id)
      if (cardRating === undefined) return   // pack incomplet : on attend le tick suivant

      const owned = cardsRes.data ?? []
      const compte = (playerId: string) => owned.filter(c => c.player_id === playerId).length
      const joueurs = playersRes.data ?? []
      const actifs = joueurs.filter(p => game.deck_size - compte(p.id) > 0)
      const vues = auctions
        .map(a => noteDe(a.card_id))
        .filter((r): r is number => r !== undefined)

      const view: BotView = {
        botPlayerId: me.id,
        level,
        temperament,
        auctionId: auction.id,
        currentBidder: auction.current_bidder,
        currentBid: auction.current_bid,
        bankroll: me.bankroll,
        slotsMissing: game.deck_size - compte(me.id),
        totalSlotsMissing: actifs.reduce((acc, p) => acc + (game.deck_size - compte(p.id)), 0),
        minBid: game.min_bid,
        cardRating,
        pool: poolAfter(packRatings, vues),
        packRatings,
        rivals: actifs
          .filter(p => p.id !== me.id)
          .map(p => ({
            bankroll: p.bankroll,
            slotsMissing: game.deck_size - compte(p.id),
            passed: auction.passed.includes(p.id),
          })),
        soldPrices: owned
          .map(c => ({ rating: noteDe(c.card_id), price: c.price_paid }))
          .filter((s): s is { rating: number; price: number } => s.rating !== undefined),
      }

      const decision = decide(view, Math.random)
      if (decision.kind === 'wait') return
      if (decision.kind === 'pass') {
        if (!passRolled.has(auction.id)) {
          passRolled.add(auction.id)
          await bot.rpc('pass_auction', { g_id: gameId })  // erreurs ignorées (races normales)
        }
        return
      }

      bidInFlight = true
      setTimeout(async () => {
        if (!stopped) {
          await bot.rpc('place_bid', { g_id: gameId, amount: decision.amount })  // erreurs ignorées
        }
        bidInFlight = false
      }, reactionDelayMs(view, Math.random))
    }

    timer = setInterval(tick, config.bot.pollMs)
  }

  run()
  return stop
}
