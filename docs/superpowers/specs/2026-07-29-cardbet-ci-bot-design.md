# CardBet — CI/CD, gestion Supabase et bot d'entraînement

Date : 2026-07-29 · Suite de la V0 (déployée : https://hodess.github.io/card_bet/)

## Objectif

Trois blocs : (A) une CI qui teste chaque PR sur un Supabase éphémère et met à jour la
prod automatiquement au merge, avec `main` protégée ; (B) la documentation du workflow
Supabase quotidien ; (C) un bot aléatoire côté client pour tester seul.

## Bloc A — CI/CD

### Workflow cible (remplace `.github/workflows/deploy.yml`)

```
PR ou push main → [test]     runner ubuntu : supabase start (stack éphémère Docker),
                             supabase db reset (migrations + seed), supabase test db
                             (pgTAP 60), npm ci, npm test (vitest), npm run build
merge sur main  → [migrate]  needs: test — npx supabase db push --db-url $SUPABASE_DB_URL
                             (nouvelles migrations uniquement ; JAMAIS --include-seed)
                → [build]    needs: migrate — build Vite avec les variables VITE_*
                → [deploy]   needs: build — GitHub Pages (inchangé)
```

Détails :

- CLI installé via l'action officielle `supabase/setup-cli@v1` (version pinée).
- Le job `test` tourne sur PR **et** sur push main ; `migrate`/`build`/`deploy`
  uniquement sur push main (`if: github.ref == 'refs/heads/main'`).
- `db push` est idempotent : il n'applique que les migrations absentes de la prod.
- Les runners GitHub n'ont pas d'IPv6 → connexion via le **pooler** eu-west-1,
  jamais l'hôte direct `db.<ref>.supabase.co`.

### Secrets et variables

| Nom | Type | Contenu |
|---|---|---|
| `SUPABASE_DB_URL` | **Secret** (nouveau) | `postgresql://postgres.ppcdvechokyzkacxszfo:<mdp-db>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres` |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Variables (existent) | inchangées |

### Protection de `main`

Branch protection rule posée via l'API GitHub :

- PR obligatoire (pas de push direct sur main) ;
- status check `test` requis et à jour avant merge ;
- `enforce_admins = false` : Romain (admin) garde un contournement d'urgence.

Conséquence assumée : les push directs sur main deviennent impossibles en temps
normal — tout passe par PR, y compris les changements générés en session.

### Notes de sécurité

- L'anon key est publique par design : elle ne donne que ce que la RLS autorise (lecture
  de sa propre partie + les 5 RPC). Le vrai secret est le mot de passe DB, uniquement
  dans `SUPABASE_DB_URL`.
- Le mot de passe DB actuel a transité par le chat : à réinitialiser à l'occasion
  (*Settings → Database → Reset database password*), puis mettre à jour le secret GitHub.

### Ordre d'exécution

La protection de `main` est posée **en dernier** : le check requis `test` doit exister
(workflow mergé et exécuté au moins une fois) avant d'être exigible. Le push du nouveau
workflow est donc le dernier push direct sur `main`.

## Bloc B — Documentation (initSupabase.md + README.md)

Trois ajouts :

1. **« Workflow quotidien »** : cycle migration (`migration new` → SQL → `db reset` →
   `test db` → commit) ; `migration up` vs `db reset` ; régénération des types
   (`gen types`) ; config via `config.toml` + `config push` ; les deux interdits —
   SQL de schéma dans le dashboard prod, et re-pousser le seed (non idempotent).
2. **« CI/CD »** : le rôle de chaque job, quels secrets/variables existent et pourquoi
   l'anon key est une variable publique alors que `SUPABASE_DB_URL` est un secret.
3. **README.md — section « Développement local » enrichie** : prérequis, `supabase start`
   (le « docker compose » géré par le CLI), `migration up` vs `db reset`, lancer les
   tests, le bot d'entraînement, et le flux de contribution (PR obligatoire, la CI
   migre la prod au merge).

## Bloc C — Bot d'entraînement aléatoire

### Principe

Un client Supabase de plus, sans aucun privilège : le bot rejoint par `join_game` et
mise par `place_bid` ; RLS et validations serveur s'appliquent à lui intégralement.
Il vit dans l'onglet de l'hôte.

### `src/lib/bot.ts`

Deux unités :

- **`decideBid(input, rng): number | null`** — fonction **pure** (testée vitest).
  Entrée : `{ currentBid, botPlayerId, currentBidder, bankroll, slotsMissing, minBid }`
  et un `rng: () => number` injecté. Règles :
  - `null` si le bot mène déjà l'enchère ou si son deck est plein ;
  - surenchérit avec probabilité **0,6**, sinon `null` (il laisse filer) ;
  - incrément tiré pondéré : +10 (50 %), +50 (30 %), +100 (20 %) ;
  - le montant est plafonné par `maxBid(bankroll, slotsMissing, minBid)` (règle de
    réserve, helper existant) ; si même +10 dépasse le plafond → `null`.
- **`startBot(gameCode: string): () => void`** — la boucle :
  - crée un client isolé (`createClient` avec `auth: { persistSession: false }` et
    une `storageKey` dédiée — la session de l'hôte n'est pas touchée) ;
  - `signInAnonymously` puis `join_game(gameCode, nom)` — nom tiré de
    `['Bot Zizou', 'Bot Bielsa', 'Bot Pep', 'Bot Arsène']` ;
  - toutes les **800 ms** (polling — pas de realtime : plus simple et suffisant),
    lit la partie et l'enchère courante ; si une décision de mise est prise, elle
    s'exécute après un délai aléatoire de **500–2 500 ms** (relance le timer 4 s
    de l'hôte, sensations d'un vrai adversaire) ;
  - une seule mise en vol à la fois ; toute erreur RPC (`BID_TOO_LOW`,
    `SELF_OVERBID`, `AUCTION_CLOSED`…) est **ignorée silencieusement** — ce sont
    des courses normales ;
  - s'arrête quand `games.status = 'finished'` ou quand la fonction de cleanup
    retournée est appelée.

### UI (`src/components/Lobby.tsx`)

Bouton **« + Ajouter un bot »**, visible par l'hôte uniquement quand la partie n'est
pas pleine. Au clic : `startBot(code)`, bouton désactivé avec « Bot en route… » ;
la ligne joueur du bot apparaît via le realtime existant comme pour un humain.

### Tests

- `decideBid` : vitest — jamais de surenchère sur soi-même, jamais au-delà de la
  réserve, `null` deck plein, distribution des incréments contrôlée par `rng` injecté.
- La boucle `startBot` reste fine (non testée unitairement) ; validation de bout en
  bout = une partie contre le bot en local.

### Limites assumées

- F5 sur l'onglet hôte → le bot devient passif (session en mémoire perdue). La partie
  se termine quand même proprement (ouvertures forcées + auto-complétion serveur).
- Le bot joue des parties « réelles » (purgées à 24 h comme les autres).

## Bloc D — Rythme d'enchère : passer + clôture immédiate

Problème constaté en jeu : à 2 joueurs, l'interdiction de surenchérir sur soi-même
rend l'enchère structurellement alternée, et on attend les 4 s même quand l'issue est
connue. Changements (RULES.md mis à jour en conséquence) :

1. **Délais configurables par partie** : colonnes `games.close_delay_seconds`
   (défaut **3**) et `games.max_auction_seconds` (défaut 60). `close_auction` et le
   countdown client lisent ces colonnes — une seule source de vérité.
2. **« Je passe »** : nouvelle RPC `pass_auction(g_id)` — un joueur (jamais le meneur :
   `LEADER_CANNOT_PASS`) se retire définitivement de l'enchère courante
   (`auctions.passed uuid[]`).
3. **Clôture immédiate sans challenger** : un *challenger* est un joueur non-meneur,
   deck incomplet, n'ayant pas passé, et dont la réserve permet de dépasser la mise
   courante. Dès qu'il n'y en a plus — après un passe OU après une mise —
   l'adjudication est immédiate, sans attendre le délai. `place_bid` et `pass_auction`
   déclenchent ce contrôle ; la garde temporelle de `close_auction` ne s'applique que
   s'il reste un challenger.
4. **`create_game` paramétrable** : `create_game(nickname, p_deck_size?, p_start_bankroll?,
   p_min_bid?, p_close_delay_seconds?, p_max_auction_seconds?)` avec bornes de validation
   serveur (deck 1–10, bankroll 100–100 000, mise min 1–bankroll, délai 1–60 s, plafond
   5–300 s) et défauts si null. L'ancienne signature est supprimée (pas d'overload).
   Prépare les paramètres de lobby de la V1.

Tests pgTAP : passe → adjudication immédiate ; LEADER_CANNOT_PASS ; mise qui assèche la
réserve adverse → adjudication immédiate ; le chemin temporel reste fonctionnel ;
create_game avec settings custom + bornes refusées.

## Bloc E — Fichier de config JSON (`src/config.json`)

Source unique des valeurs côté client, importé statiquement (typé par TS) :

```json
{
  "game": { "deckSize": 3, "startBankroll": 1000, "minBid": 10,
            "closeDelaySeconds": 3, "maxAuctionSeconds": 60 },
  "ui":   { "increments": [10, 50, 100] },
  "bot":  { "bidProbability": 0.6, "passProbability": 0.3, "pollMs": 800,
            "delayMinMs": 500, "delayMaxMs": 2500,
            "names": ["Bot Zizou", "Bot Bielsa", "Bot Pep", "Bot Arsène"] }
}
```

- `Home` envoie `config.game` à `create_game` → les valeurs par défaut d'une partie
  se changent en éditant ce fichier, sans toucher au SQL.
- `Auction`/`useGame` lisent les délais **depuis la ligne `games`** (pas depuis le
  JSON) : le serveur reste l'autorité pendant une partie.
- Le bot lit tous ses paramètres dans `config.bot` ; les incréments de mise dans
  `config.ui`.

## Bloc F — Direction artistique « carte FUT »

Refonte de `src/index.css` + retouches de markup (aucune logique) :

- **Thème sombre stade** : fond dégradé nuit, accents dorés.
- **La carte joueur en star** : gabarit façon FUT — badge **or** (note ≥ 88),
  **argent** (85–87), **bronze** (< 85) ; grande note, poste, nom mis en scène.
- **Timer en anneau** SVG animé autour du compte à rebours (remplace le texte sec).
- **Boutons de mise massifs** façon jetons de casino + bouton « Je passe » distinct
  (rouge sobre).
- **Footer joueurs** en puces : pseudo, bankroll, avancement du deck (●●○), état
  (mène / a passé).
- Résultats : podium, cartes du deck affichées en mini-format FUT.
- Contrainte : lisible sur mobile (le jeu se joue sur téléphone), pas de dépendance
  externe (pas de lib UI, pas de webfont distante — GitHub Pages statique).

## Hors périmètre

Staging cloud persistant · bot côté serveur (Edge Functions) · niveaux de difficulté ·
bot dans les parties publiques (n'existent pas encore) · cache Docker du job `test`.
