# CardBet V0 — Design technique

Date : 2026-07-29
Référence règles : [`RULES.md`](../../../RULES.md) (sections 1 à 6 — pas de joker en V0)

## 1. Objectif et périmètre

**Critère de succès V0** : une vraie partie jouable en ligne à 2, sur l'infra définitive —
un joueur sur PC, l'autre sur téléphone, qui se rejoignent via un code de partie.

Périmètre V0 :

- 2 joueurs exactement, deck de 3 cartes, pas de joker.
- Un seul pack : ~40 vrais joueurs de football (nom, poste, note), **sans photos**
  (droits d'image) — cartes stylisées en CSS.
- Partie privée par code uniquement. Pas de compte : auth anonyme Supabase.
- Paramètres figés : bankroll 1 000, mise min 10, adjudication 4 s, plafond 60 s,
  incréments +10 / +50 / +100 / Max.

Hors périmètre V0 : joker, 3+ joueurs, deck configurable, autres packs, parties
publiques/matchmaking, comptes, historique, ranking, reconnexion sophistiquée, E2E.

## 2. Architecture

- **Frontend** : Vite + React + TypeScript, hébergé sur GitHub Pages (statique),
  `HashRouter` pour le routing SPA.
- **Backend** : Supabase cloud (free tier). Toute la logique de jeu vit dans des
  **fonctions Postgres (RPC)** ; les clients écoutent l'état via **Supabase Realtime**
  (`postgres_changes`).

Principe directeur : **le client ne construit jamais l'état, il le reflète.** Une action
utilisateur = un appel RPC ; c'est l'écho realtime qui met à jour l'écran. Aucune
écriture directe dans les tables depuis le client — c'est ce qui rend le jeu intrichable
depuis un front statique.

```
React (GitHub Pages)
  │  supabase.rpc('place_bid', {game_id, amount})
  ▼
Postgres — fonctions SQL = arbitre unique (validation + écriture atomique)
  ▼
Realtime — postgres_changes filtrés par game_id
  ▼
Les 2 clients re-rendent l'état reçu
```

## 3. Modèle de données

Toutes les écritures passent par les RPC (`SECURITY DEFINER`). RLS activée partout.

| Table | Colonnes principales | Lecture client (RLS) |
|---|---|---|
| `cards` | `id, name, position, rating` | Oui (le pack est public) |
| `games` | `id, code (6 car.), status (lobby/playing/finished), deck_size=3, start_bankroll=1000, min_bid=10, created_at` | Sa partie uniquement |
| `players` | `id, game_id, auth_uid, nickname, seat (0/1), bankroll` | Joueurs de sa partie |
| `game_cards` | `game_id, card_id, seq` — ordre de tirage mélangé au démarrage | **Non** (secret des cartes futures garanti serveur) |
| `auctions` | `id, game_id, card_id, seq, status (open/sold), opened_at, last_bid_at, current_bid, current_bidder, forced_bidder` | Sa partie uniquement |
| `player_cards` | `player_id, card_id, price_paid` | Joueurs de sa partie |

Notes :

- Les colonnes de config (`deck_size`, `start_bankroll`, `min_bid`) sont figées en V0
  mais déjà en place pour les paramètres de lobby de la V1.
- Pas de table `bids` (historique) en V0 : `auctions.current_bid/current_bidder` suffit.
- Realtime : publication activée sur `games`, `players`, `auctions`, `player_cards`.

## 4. Fonctions RPC

Cinq fonctions, plus une utilitaire :

### `create_game(nickname) → {game_id, code}`
Crée la partie en `lobby`, crée le joueur (seat 0, hôte), génère un code à 6 caractères.

### `join_game(code, nickname) → {game_id}`
Rejoint une partie en `lobby` non pleine (seat 1). Erreurs : code inconnu, partie pleine
ou déjà démarrée.

### `start_game(game_id)`
Hôte uniquement, exige 2 joueurs. Mélange le pack dans `game_cards`, passe la partie en
`playing`, ouvre la première enchère.

### `place_bid(game_id, amount)`
Validations, dans l'ordre :
1. Partie en `playing`, enchère courante `open`.
2. L'appelant est un joueur de la partie, deck non plein.
3. Pas de surenchère sur soi-même (`current_bidder ≠ appelant`).
4. `amount > current_bid`.
5. **Règle de réserve** : `amount ≤ bankroll − (slots_manquants − 1) × min_bid`.

Écrit : `current_bid`, `current_bidder`, `last_bid_at = now()`.

### `close_auction(game_id)`
Appelée par n'importe quel client dont le timer local expire. **Idempotente**, gardée
par l'horloge serveur :

1. Ne fait rien sauf si `now() ≥ last_bid_at + 4 s` **ou** `now() ≥ opened_at + 60 s`
   (sinon retour silencieux — pas une erreur).
2. Adjuge : carte au `current_bidder`, débit de sa bankroll, ligne `player_cards`.
3. Si un seul joueur a un deck incomplet → **auto-complétion** de ses slots restants à
   `min_bid` avec les cartes suivantes.
4. Si tous les decks sont pleins → `status = finished`.
5. Sinon → ouvre l'enchère suivante.

**Ouverture d'une enchère** (logique interne à `start_game`/`close_auction`) : tire la
carte `seq` suivante, désigne le `forced_bidder` (seat 0 — l'hôte — sur la première
enchère, puis alternance des sièges en sautant les decks pleins), pose automatiquement
sa mise à `min_bid`,
`opened_at = last_bid_at = now()`. Il y a donc **toujours** un dernier enchérisseur, et
le compte à rebours démarre dès l'apparition de la carte.

### `get_server_time() → timestamptz`
Pour le calcul d'offset d'horloge côté client.

**Erreurs** : chaque RPC renvoie des codes explicites (`BID_TOO_LOW`, `SELF_OVERBID`,
`RESERVE_EXCEEDED`, `AUCTION_CLOSED`, `DECK_FULL`, `GAME_NOT_FOUND`, `GAME_FULL`…) que
le front traduit en toasts.

**Concurrence** : `place_bid` et `close_auction` prennent un verrou sur la ligne
`auctions` (`SELECT … FOR UPDATE`). Deux mises simultanées, ou une mise concurrente
d'une clôture, sont sérialisées par Postgres — le timestamp serveur tranche.

## 5. Machine à états

```
games.status :   lobby ──start_game──▶ playing ──tous decks pleins──▶ finished
auctions.status: open ──close_auction──▶ sold
```

Boucle de jeu : ouverture (mise forcée auto) → surenchères (`place_bid`, chaque mise
relance les 4 s) → `close_auction` → adjudication → enchère suivante, jusqu'à decks
pleins.

**Timers** — répartition des responsabilités :

- La **logique** ne dépend que de l'horloge serveur (`last_bid_at`, `opened_at`).
- L'**affichage** utilise l'horloge client corrigée : au chargement, le client calcule
  une fois `offset = get_server_time() − Date.now()`, puis affiche
  `(last_bid_at + 4 s) − (Date.now() + offset)`.
- Chaque client appelle `close_auction` à l'expiration de son timer local. Les appels
  multiples, en retard ou concurrents d'une mise sont inoffensifs (idempotence + verrou).

## 6. Frontend

```
src/
├── lib/supabase.ts        client + types générés (supabase gen types)
├── hooks/useGame.ts       état de la partie + souscription realtime + rechargement au montage
├── hooks/useCountdown.ts  compte à rebours corrigé de l'offset serveur
├── pages/                 Home (créer/rejoindre) · Lobby · Game · Results
└── components/            CardDisplay · BidButtons · BankrollBar · PlayerPanel
```

- `useGame(gameId)` : charge l'état complet au montage, souscrit aux `postgres_changes`
  des 4 tables filtrées par `game_id`, expose `{game, players, auction, myPlayer, decks}`.
- `BidButtons` : +10 / +50 / +100 / Max. « Max » = mise max autorisée (règle de réserve),
  calculée côté client pour l'affichage, re-validée côté serveur. Boutons désactivés si
  l'incrément dépasse le plafond ou si le joueur mène l'enchère.
- État optimiste minimal : un spinner sur le bouton pendant le RPC, rien de plus.
  L'état realtime fait foi.
- **Rafraîchissement/F5** : la session anonyme persiste (localStorage) → `auth_uid`
  retrouve son joueur, `useGame` recharge tout. Un F5 en pleine enchère ne casse rien.
- **Déconnexion adverse** : la partie continue (les ouvertures forcées sont
  automatiques) ; pas de gestion de présence en V0.

## 7. Nettoyage

Job `pg_cron` quotidien : suppression des `games` (et lignes liées, `ON DELETE CASCADE`)
de plus de 24 h. Les parties sont temporaires par design.

## 8. Tests

- **Fonctions SQL (le cœur du risque)** : pgTAP via `supabase test db` sur Supabase
  local. Cas couverts : règle de réserve, mise trop basse, surenchère sur soi-même,
  idempotence de `close_auction` (double appel, appel prématuré), mise concurrente
  d'une clôture, alternance du `forced_bidder`, auto-complétion, fin de partie,
  départage (notes → argent restant → égalité).
- **Front** : Vitest sur les fonctions pures (mise max, formatage countdown).
- **Pas de E2E en V0** : le test de bout en bout, c'est la partie réelle à 2 appareils.

## 9. Déploiement

- **Supabase cloud dès le premier jour** (le local Docker sert au dev et aux tests pgTAP).
  Schéma versionné en migrations (`supabase/migrations/`), seed des cartes dans
  `supabase/seed.sql`, poussés avec `supabase db push`.
- **GitHub Actions → GitHub Pages** : build Vite à chaque push sur `main`.
  `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` en variables du workflow (la clé anon
  est publique par design ; la sécurité vient de la RLS et des RPC).
- Voir [`initSupabase.md`](../../../initSupabase.md) pour la mise en place pas à pas.

## 10. Risques identifiés

| Risque | Mitigation |
|---|---|
| Latence mobile > 1 s rend les 4 s frustrantes | Le délai d'adjudication est une colonne de config — ajustable sans redéploiement |
| Free tier Supabase en pause après ~7 j d'inactivité | Acceptable en V0 ; réveil manuel dans le dashboard |
| Realtime qui rate un événement (reconnexion réseau) | `useGame` recharge l'état complet à chaque (re)souscription |
