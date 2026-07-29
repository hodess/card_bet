# CardBet — CI/CD, rythme d'enchère, config, FUT, bot : Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** CI testant chaque PR sur Supabase éphémère + migration auto de la prod ; enchère accélérée (« Je passe » + clôture immédiate sans challenger, délais configurables) ; config JSON client ; refonte visuelle FUT ; bot d'entraînement.

**Architecture :** Spec : `docs/superpowers/specs/2026-07-29-cardbet-ci-bot-design.md`. Règle d'or de verrouillage : **toute fonction qui mute une partie verrouille `games` PUIS la ligne `auctions` ouverte, dans cet ordre** — `place_bid` change pour s'y conformer (il déclenche désormais la clôture immédiate).

**Tech Stack :** GitHub Actions, Supabase CLI, PL/pgSQL + pgTAP, TypeScript/React, Vitest.

## Global Constraints

- **JAMAIS de `git commit`/`git push`/branche** — Romain committe. Fin de tâche = `git add <fichiers précis>`.
- Le job `migrate` n'utilise JAMAIS `--include-seed`.
- Le bot passe exclusivement par les RPC publiques — aucun privilège.
- Erreurs RPC : `raise exception 'CODE'` (P0001, message = code). Nouveaux codes : `LEADER_CANNOT_PASS`, `INVALID_SETTINGS`.
- Défauts serveur (dupliqués sciemment dans `src/config.json` côté client) : deck 3, bankroll 1000, mise min 10, délai 3 s, plafond 60 s.
- UI en français, mobile-first, aucune ressource externe (pas de webfont/CDN).
- Après la migration : régénérer `src/lib/database.types.ts`.

---

### Task 1 : Workflow CI/CD (remplace deploy.yml)

**Files:**
- Rewrite: `.github/workflows/deploy.yml`

**Interfaces:**
- Produces : jobs `test` (PR + main — futur check requis, ne pas renommer), `migrate`/`build`/`deploy` (main uniquement, chaînés).

- [ ] **Step 1 : Remplacer intégralement `.github/workflows/deploy.yml`**

```yaml
name: CI & Deploy

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Démarrer le Supabase éphémère (migrations + seed)
        run: supabase start
      - name: Tests pgTAP (logique de jeu)
        run: supabase test db
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build

  migrate:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Pousser les nouvelles migrations vers la prod (jamais le seed)
        run: supabase db push --db-url "$SUPABASE_DB_URL"
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}

  build:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    needs: migrate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2 : Valider** — Run : `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))" && echo OK` — Attendu : `OK`.
- [ ] **Step 3 : Stager** — `git add .github/workflows/deploy.yml`

---

### Task 2 : Migration « rythme d'enchère » + pgTAP (TDD)

**Files:**
- Create: `supabase/migrations/<ts>_auction_pace.sql`, `supabase/tests/08_pace.sql`
- Rewrite: `supabase/tests/05_place_bid.sql` (la clôture immédiate change la fin du scénario)

**Interfaces:**
- Produces : colonnes `games.close_delay_seconds` (défaut 3), `games.max_auction_seconds` (défaut 60), `auctions.passed uuid[]` ; RPC `pass_auction(g_id)` ; `has_challenger(auction_id)` (interne) ; `create_game(nickname, p_deck_size?, p_start_bankroll?, p_min_bid?, p_close_delay_seconds?, p_max_auction_seconds?)` (l'ancienne signature `create_game(text)` est SUPPRIMÉE) ; `place_bid` et `close_auction` remplacés.

- [ ] **Step 1 : Réécrire `supabase/tests/05_place_bid.sql`** — mêmes setup/helpers qu'actuellement (create/join/start + temp tables), assertions dans ce nouvel ordre :

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create function test_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

select test_login('00000000-0000-0000-0000-000000000001');
create temp table t as select (create_game('Romain')->>'game_id')::uuid as gid;
select test_login('00000000-0000-0000-0000-000000000002');
select join_game((select code from games), 'Ami');
select test_login('00000000-0000-0000-0000-000000000001');
select start_game((select gid from t));
create temp table ids as select
  (select id from players where seat = 0) as p1,
  (select id from players where seat = 1) as p2;

select test_login('00000000-0000-0000-0000-000000000003');
select throws_ok(format($$select place_bid(%L, 60)$$, (select gid from t)),
  'P0001', 'NOT_A_PLAYER', 'tiers refusé');

select test_login('00000000-0000-0000-0000-000000000002');
select lives_ok(format($$select place_bid(%L, 60)$$, (select gid from t)), 'p2 mise 60');
select is((select current_bid from auctions where seq = 1), 60, 'mise à 60');
select is((select current_bidder from auctions where seq = 1), (select p2 from ids), 'p2 mène');

select test_login('00000000-0000-0000-0000-000000000001');
select throws_ok(format($$select place_bid(%L, 60)$$, (select gid from t)),
  'P0001', 'BID_TOO_LOW', 'mise égale refusée');
select test_login('00000000-0000-0000-0000-000000000002');
select throws_ok(format($$select place_bid(%L, 70)$$, (select gid from t)),
  'P0001', 'SELF_OVERBID', 'p2 mène déjà');
select test_login('00000000-0000-0000-0000-000000000001');
select throws_ok(format($$select place_bid(%L, 981)$$, (select gid from t)),
  'P0001', 'RESERVE_EXCEEDED', '981 > max 980');

-- deck plein : p2 reçoit 3 cartes (en tant que postgres), il ne peut plus miser
insert into player_cards (game_id, player_id, card_id, price_paid)
select (select gid from t), (select p2 from ids), id, 0 from cards limit 3;
select test_login('00000000-0000-0000-0000-000000000002');
select throws_ok(format($$select place_bid(%L, 990)$$, (select gid from t)),
  'P0001', 'DECK_FULL', 'deck plein ne mise plus');

-- p1 mise 980 : p2 (deck plein) n'est plus challenger → clôture immédiate,
-- puis p1 est seul incomplet → auto-complétion → partie terminée dans la foulée
select test_login('00000000-0000-0000-0000-000000000001');
select lives_ok(format($$select place_bid(%L, 980)$$, (select gid from t)), 'p1 mise 980');
select is((select status from games where id = (select gid from t)), 'finished',
  'clôture immédiate + auto-complétion → partie finie');
select throws_ok(format($$select place_bid(%L, 990)$$, (select gid from t)),
  'P0001', 'GAME_NOT_PLAYING', 'plus de mise après la fin');

select * from finish();
rollback;
```

- [ ] **Step 2 : Écrire `supabase/tests/08_pace.sql`** (échoue tant que la migration n'existe pas) :

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create function test_login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- setup : partie démarrée, enchère 1 forcée p1 à 10
select test_login('00000000-0000-0000-0000-000000000001');
create temp table t as select (create_game('Romain')->>'game_id')::uuid as gid;
select test_login('00000000-0000-0000-0000-000000000002');
select join_game((select code from games), 'Ami');
select test_login('00000000-0000-0000-0000-000000000001');
select start_game((select gid from t));
create temp table ids as select
  (select id from players where seat = 0) as p1,
  (select id from players where seat = 1) as p2;

-- 1. p2 passe → plus de challenger → adjugé immédiatement à p1
select test_login('00000000-0000-0000-0000-000000000002');
select lives_ok(format($$select pass_auction(%L)$$, (select gid from t)), 'p2 passe');
select is((select status from auctions where seq = 1), 'sold', 'adjugé immédiatement');
select is((select bankroll from players where id = (select p1 from ids)), 990, 'p1 débité de 10');
select is((select count(*)::int from auctions where seq = 2 and status = 'open'), 1, 'enchère 2 ouverte');

-- 2. le meneur (ouverture forcée p2 sur seq 2) ne peut pas passer
select is((select current_bidder from auctions where seq = 2), (select p2 from ids), 'seq 2 forcée p2');
select throws_ok(format($$select pass_auction(%L)$$, (select gid from t)),
  'P0001', 'LEADER_CANNOT_PASS', 'le meneur ne passe pas');

-- 3. mise qui assèche la réserve adverse → clôture immédiate
--    p1 : bankroll 990, deck 1/3 → max = 990 − 10 = 980 ; p2 : max 980, pas > 980
select test_login('00000000-0000-0000-0000-000000000001');
select lives_ok(format($$select place_bid(%L, 980)$$, (select gid from t)), 'p1 all-in 980');
select is((select status from auctions where seq = 2), 'sold', 'clôture immédiate sans challenger');
select is((select bankroll from players where id = (select p1 from ids)), 10, 'p1 à 10');

-- 4. le chemin temporel marche toujours (seq 3 forcée p1, p2 challenger → reste ouverte)
select is((select count(*)::int from auctions where seq = 3 and status = 'open'), 1, 'enchère 3 ouverte');
update auctions set last_bid_at = now() - interval '4 seconds',
                    opened_at  = now() - interval '5 seconds' where seq = 3;
select lives_ok(format($$select close_auction(%L)$$, (select gid from t)), 'clôture au timer (3 s)');
select is((select status from games where id = (select gid from t)), 'finished',
  'p1 plein → auto-complétion p2 → partie finie');
select is((select bankroll from players where id = (select p2 from ids)), 970,
  'p2 : 1000 − 3 × 10 (auto-complétion)');

-- 5. create_game paramétrable + bornes
select test_login('00000000-0000-0000-0000-000000000004');
create temp table t2 as select
  (create_game('Solo', p_deck_size => 2, p_close_delay_seconds => 2)->>'game_id')::uuid as gid;
select is((select deck_size from games where id = (select gid from t2)), 2, 'deck_size custom');
select is((select close_delay_seconds from games where id = (select gid from t2)), 2, 'délai custom');
select throws_ok($$select create_game('X', p_deck_size => 0)$$,
  'P0001', 'INVALID_SETTINGS', 'bornes refusées');

select * from finish();
rollback;
```

- [ ] **Step 3 : Vérifier l'échec** — Run : `npx supabase db reset && npx supabase test db` — Attendu : 05 et 08 FAIL (`pass_auction` absent, clôture immédiate absente).

- [ ] **Step 4 : Migration** — `npx supabase migration new auction_pace` :

```sql
-- Délais configurables par partie
alter table games
  add column close_delay_seconds int not null default 3
    check (close_delay_seconds between 1 and 60),
  add column max_auction_seconds int not null default 60
    check (max_auction_seconds between 5 and 300);

-- Joueurs ayant passé sur l'enchère courante
alter table auctions add column passed uuid[] not null default '{}';

-- Un challenger : non-meneur, deck incomplet, n'a pas passé, réserve permettant de surenchérir
create function has_challenger(p_auction_id uuid) returns boolean
language sql stable as $$
  select exists (
    select 1
    from auctions a
    join games g on g.id = a.game_id
    join players p on p.game_id = g.id
    where a.id = p_auction_id
      and p.id <> a.current_bidder
      and not (p.id = any (a.passed))
      and deck_count(p.id) < g.deck_size
      and p.bankroll - (g.deck_size - deck_count(p.id) - 1) * g.min_bid > a.current_bid
  );
$$;
revoke execute on function has_challenger(uuid) from public, anon, authenticated;

-- close_auction : délais lus dans games + clôture immédiate sans challenger
create or replace function close_auction(g_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  g games%rowtype;
  a auctions%rowtype;
  lone players%rowtype;
  incomplete int;
  next_seq int;
  next_card int;
begin
  select * into g from games where id = g_id for update;
  if not found or g.status <> 'playing' then return; end if;

  select * into a from auctions
  where game_id = g_id and status = 'open'
  order by seq desc limit 1
  for update;
  if not found then return; end if;

  -- on n'attend le délai QUE s'il reste un challenger
  if has_challenger(a.id)
     and now() < a.last_bid_at + make_interval(secs => g.close_delay_seconds)
     and now() < a.opened_at + make_interval(secs => g.max_auction_seconds) then
    return;
  end if;

  update auctions set status = 'sold' where id = a.id;
  update players set bankroll = bankroll - a.current_bid where id = a.current_bidder;
  insert into player_cards (game_id, player_id, card_id, price_paid)
  values (g_id, a.current_bidder, a.card_id, a.current_bid);

  select count(*) into incomplete from players p
  where p.game_id = g_id and deck_count(p.id) < g.deck_size;

  if incomplete = 1 then
    select p.* into lone from players p
    where p.game_id = g_id and deck_count(p.id) < g.deck_size;
    while deck_count(lone.id) < g.deck_size loop
      select coalesce(max(seq), 0) + 1 into next_seq from auctions where game_id = g_id;
      select card_id into next_card from game_cards where game_id = g_id and seq = next_seq;
      insert into auctions (game_id, card_id, seq, status, current_bid, current_bidder, forced_bidder)
      values (g_id, next_card, next_seq, 'sold', g.min_bid, lone.id, lone.id);
      insert into player_cards (game_id, player_id, card_id, price_paid)
      values (g_id, lone.id, next_card, g.min_bid);
      update players set bankroll = bankroll - g.min_bid where id = lone.id;
    end loop;
    incomplete := 0;
  end if;

  if incomplete = 0 then
    update games set status = 'finished' where id = g_id;
  else
    perform open_next_auction(g_id);
  end if;
end $$;

-- place_bid : verrouille désormais games PUIS auctions (même ordre que close_auction,
-- sinon deadlock), et déclenche la clôture immédiate après la mise
create or replace function place_bid(g_id uuid, amount int) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
  a auctions%rowtype;
  me players%rowtype;
  missing int;
begin
  select * into g from games where id = g_id for update;
  if not found or g.status <> 'playing' then raise exception 'GAME_NOT_PLAYING'; end if;

  select * into a from auctions
  where game_id = g_id and status = 'open'
  order by seq desc limit 1
  for update;
  if not found then raise exception 'AUCTION_CLOSED'; end if;

  select * into me from players where game_id = g_id and auth_uid = uid;
  if not found then raise exception 'NOT_A_PLAYER'; end if;

  missing := g.deck_size - deck_count(me.id);
  if missing <= 0 then raise exception 'DECK_FULL'; end if;
  if a.current_bidder = me.id then raise exception 'SELF_OVERBID'; end if;
  if amount <= a.current_bid then raise exception 'BID_TOO_LOW'; end if;
  if amount > me.bankroll - (missing - 1) * g.min_bid then
    raise exception 'RESERVE_EXCEEDED';
  end if;

  update auctions
  set current_bid = amount, current_bidder = me.id, last_bid_at = now()
  where id = a.id;

  -- clôture immédiate si plus personne ne peut suivre (no-op sinon)
  perform close_auction(g_id);
end $$;

-- pass_auction : se retirer définitivement de l'enchère courante
create function pass_auction(g_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
  a auctions%rowtype;
  me players%rowtype;
begin
  select * into g from games where id = g_id for update;
  if not found or g.status <> 'playing' then raise exception 'GAME_NOT_PLAYING'; end if;

  select * into a from auctions
  where game_id = g_id and status = 'open'
  order by seq desc limit 1
  for update;
  if not found then raise exception 'AUCTION_CLOSED'; end if;

  select * into me from players where game_id = g_id and auth_uid = uid;
  if not found then raise exception 'NOT_A_PLAYER'; end if;
  if a.current_bidder = me.id then raise exception 'LEADER_CANNOT_PASS'; end if;

  if not (me.id = any (a.passed)) then
    update auctions set passed = array_append(passed, me.id) where id = a.id;
  end if;

  perform close_auction(g_id);
end $$;

-- create_game paramétrable ; l'ancienne signature disparaît (pas d'overload ambigu)
drop function create_game(text);

create function create_game(
  nickname text,
  p_deck_size int default null,
  p_start_bankroll int default null,
  p_min_bid int default null,
  p_close_delay_seconds int default null,
  p_max_auction_seconds int default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g games%rowtype;
  new_code text;
  v_deck int := coalesce(p_deck_size, 3);
  v_bank int := coalesce(p_start_bankroll, 1000);
  v_min int := coalesce(p_min_bid, 10);
  v_delay int := coalesce(p_close_delay_seconds, 3);
  v_cap int := coalesce(p_max_auction_seconds, 60);
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if coalesce(trim(nickname), '') = '' then raise exception 'NICKNAME_REQUIRED'; end if;
  if v_deck not between 1 and 10
     or v_bank not between 100 and 100000
     or v_min not between 1 and v_bank
     or v_delay not between 1 and 60
     or v_cap not between 5 and 300 then
    raise exception 'INVALID_SETTINGS';
  end if;
  loop
    new_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    begin
      insert into games (code, deck_size, start_bankroll, min_bid, close_delay_seconds, max_auction_seconds)
      values (new_code, v_deck, v_bank, v_min, v_delay, v_cap) returning * into g;
      exit;
    exception when unique_violation then
    end;
  end loop;
  insert into players (game_id, auth_uid, nickname, seat, bankroll)
  values (g.id, uid, trim(nickname), 0, g.start_bankroll);
  return json_build_object('game_id', g.id, 'code', g.code);
end $$;
```

- [ ] **Step 5 : Vérifier** — Run : `npx supabase db reset && npx supabase test db` — Attendu : TOUS les fichiers verts (01–08 ; 05 = 11 assertions, 08 = 16).
- [ ] **Step 6 : Régénérer les types** — `npx supabase gen types typescript --local > src/lib/database.types.ts` puis `npm run build` (le build casse : `Home`/`Auction` pas encore adaptés → si c'est le cas, le noter comme attendu, la Task 3/5 les adapte ; ne PAS bricoler).
- [ ] **Step 7 : Stager** — `git add supabase/migrations/*_auction_pace.sql supabase/tests/08_pace.sql supabase/tests/05_place_bid.sql src/lib/database.types.ts`

---

### Task 3 : Config JSON + Home paramétrée

**Files:**
- Create: `src/config.json`
- Modify: `src/pages/HomePage.tsx` (appel `create_game` avec les settings), `tsconfig.app.json` (si `resolveJsonModule` absent)

**Interfaces:**
- Produces : `import config from '../config.json'` utilisable partout (game/ui/bot).

- [ ] **Step 1 : `src/config.json`**

```json
{
  "game": {
    "deckSize": 3,
    "startBankroll": 1000,
    "minBid": 10,
    "closeDelaySeconds": 3,
    "maxAuctionSeconds": 60
  },
  "ui": {
    "increments": [10, 50, 100]
  },
  "bot": {
    "bidProbability": 0.6,
    "passProbability": 0.3,
    "pollMs": 800,
    "delayMinMs": 500,
    "delayMaxMs": 2500,
    "names": ["Bot Zizou", "Bot Bielsa", "Bot Pep", "Bot Arsène"]
  }
}
```

- [ ] **Step 2 : `HomePage.tsx`** — remplacer le corps de `createGame` :

```ts
import config from '../config.json'
// …
async function createGame() {
  const { data, error } = await supabase.rpc('create_game', {
    nickname,
    p_deck_size: config.game.deckSize,
    p_start_bankroll: config.game.startBankroll,
    p_min_bid: config.game.minBid,
    p_close_delay_seconds: config.game.closeDelaySeconds,
    p_max_auction_seconds: config.game.maxAuctionSeconds,
  })
  if (error) return setError(error.message)
  nav(`/game/${(data as { game_id: string }).game_id}`)
}
```

- [ ] **Step 3 : Vérifier** — `npm run build` (si erreur `resolveJsonModule`, ajouter `"resolveJsonModule": true` au `compilerOptions` de `tsconfig.app.json`). Attendu : build vert (Auction sera adaptée en Task 5 — si le build casse sur Auction à cause des types régénérés, le noter, ne pas corriger ici).
- [ ] **Step 4 : Stager** — `git add src/config.json src/pages/HomePage.tsx` (+ tsconfig.app.json si modifié)

---

### Task 4 : Bot — logique pure + boucle (TDD sur `decideBid`)

**Files:**
- Create: `src/lib/bot.ts`, `src/lib/bot.test.ts`

**Interfaces:**
- Consumes : `maxBid`, `config` (Task 3), types `Database` (Task 2).
- Produces : `decideBid(view: BotView, rng): number | null` ; `startBot(gameCode): () => void`.

- [ ] **Step 1 : Test qui échoue** — `src/lib/bot.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { decideBid, type BotView } from './bot'

const base: BotView = {
  botPlayerId: 'bot',
  currentBidder: 'adversaire',
  currentBid: 100,
  bankroll: 1000,
  slotsMissing: 3,
  minBid: 10,
}
const seq = (...vals: number[]) => { let i = 0; return () => vals[i++] ?? 0 }

describe('decideBid', () => {
  it('ne surenchérit jamais sur lui-même', () => {
    expect(decideBid({ ...base, currentBidder: 'bot' }, seq(0, 0))).toBeNull()
  })
  it('ne mise plus quand son deck est plein', () => {
    expect(decideBid({ ...base, slotsMissing: 0 }, seq(0, 0))).toBeNull()
  })
  it('laisse filer quand le tirage dépasse bidProbability (0,6)', () => {
    expect(decideBid(base, seq(0.9))).toBeNull()
  })
  it('mise +10 si rng < 0,5, +50 entre 0,5 et 0,8, +100 au-delà', () => {
    expect(decideBid(base, seq(0, 0.4))).toBe(110)
    expect(decideBid(base, seq(0, 0.6))).toBe(150)
    expect(decideBid(base, seq(0, 0.9))).toBe(200)
  })
  it('respecte la règle de réserve : replie sur +10, sinon null', () => {
    expect(decideBid({ ...base, currentBid: 950 }, seq(0, 0.9))).toBe(960)
    expect(decideBid({ ...base, currentBid: 975 }, seq(0, 0.4))).toBeNull()
  })
})
```

- [ ] **Step 2 : Vérifier l'échec** — `npm test` — FAIL (`./bot` introuvable).

- [ ] **Step 3 : Implémenter** — `src/lib/bot.ts`

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { maxBid } from './game'
import config from '../config.json'

export type BotView = {
  botPlayerId: string
  currentBidder: string
  currentBid: number
  bankroll: number
  slotsMissing: number
  minBid: number
}

export function decideBid(view: BotView, rng: () => number): number | null {
  if (view.slotsMissing <= 0) return null
  if (view.currentBidder === view.botPlayerId) return null
  if (rng() >= config.bot.bidProbability) return null
  const r = rng()
  const increment = r < 0.5 ? 10 : r < 0.8 ? 50 : 100
  const cap = maxBid(view.bankroll, view.slotsMissing, view.minBid)
  const amount = view.currentBid + increment
  if (amount <= cap) return amount
  const fallback = view.currentBid + 10
  return fallback <= cap ? fallback : null
}

export function startBot(gameCode: string): () => void {
  let stopped = false
  let bidInFlight = false
  let timer: ReturnType<typeof setInterval> | undefined
  const passRolled = new Set<string>() // une seule décision de passe par enchère

  const bot = createClient<Database>(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, storageKey: 'cardbet-bot' } },
  )

  const stop = () => {
    stopped = true
    if (timer) clearInterval(timer)
  }

  const run = async () => {
    const { error: authError } = await bot.auth.signInAnonymously()
    if (authError || stopped) return
    const nickname = config.bot.names[Math.floor(Math.random() * config.bot.names.length)]
    const { data, error } = await bot.rpc('join_game', { game_code: gameCode, nickname })
    if (error || stopped) return
    const gameId = (data as { game_id: string }).game_id
    const { data: auth } = await bot.auth.getUser()
    const botUid = auth.user?.id

    const tick = async () => {
      if (stopped || bidInFlight) return
      const [gameRes, auctionRes, playersRes, cardsRes] = await Promise.all([
        bot.from('games').select('status, deck_size, min_bid').eq('id', gameId).maybeSingle(),
        bot.from('auctions').select('*').eq('game_id', gameId).order('seq', { ascending: false }).limit(1),
        bot.from('players').select('*').eq('game_id', gameId),
        bot.from('player_cards').select('player_id').eq('game_id', gameId),
      ])
      const game = gameRes.data
      if (!game || game.status === 'finished') { stop(); return }
      const auction = auctionRes.data?.[0]
      const me = playersRes.data?.find(p => p.auth_uid === botUid)
      if (game.status !== 'playing' || !auction || auction.status !== 'open' || !me) return
      if (auction.passed.includes(me.id)) return

      const myCards = (cardsRes.data ?? []).filter(c => c.player_id === me.id).length
      const view: BotView = {
        botPlayerId: me.id,
        currentBidder: auction.current_bidder,
        currentBid: auction.current_bid,
        bankroll: me.bankroll,
        slotsMissing: game.deck_size - myCards,
        minBid: game.min_bid,
      }
      const amount = decideBid(view, Math.random)

      if (amount === null) {
        // pas meneur, et soit bloqué soit pas envie : envisager de passer (une fois par enchère)
        const isLeader = auction.current_bidder === me.id
        if (!isLeader && !passRolled.has(auction.id)) {
          passRolled.add(auction.id)
          const cap = maxBid(view.bankroll, view.slotsMissing, view.minBid)
          const cannotBid = view.slotsMissing <= 0 || auction.current_bid + 10 > cap
          if (cannotBid || Math.random() < config.bot.passProbability) {
            await bot.rpc('pass_auction', { g_id: gameId }) // erreurs ignorées (courses normales)
          }
        }
        return
      }

      bidInFlight = true
      const delay = config.bot.delayMinMs + Math.random() * (config.bot.delayMaxMs - config.bot.delayMinMs)
      setTimeout(async () => {
        if (!stopped) {
          await bot.rpc('place_bid', { g_id: gameId, amount }) // erreurs ignorées
        }
        bidInFlight = false
      }, delay)
    }

    timer = setInterval(tick, config.bot.pollMs)
  }

  run()
  return stop
}
```

- [ ] **Step 4 : Vérifier** — `npm test` — Attendu : 9 tests verts (4 game + 5 bot).
- [ ] **Step 5 : Stager** — `git add src/lib/bot.ts src/lib/bot.test.ts`

---

### Task 5 : UI — bouton bot, « Je passe », délais serveur, design FUT

**Files:**
- Modify: `src/pages/GamePage.tsx`, `src/components/Lobby.tsx`, `src/components/Auction.tsx`, `src/components/Results.tsx`
- Rewrite: `src/index.css`

Le cycle de vie du bot vit dans **GamePage** (monté du salon aux résultats) — pas dans
Lobby (démonté au start : le bot y mourrait).

- [ ] **Step 1 : `src/pages/GamePage.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useGame } from '../hooks/useGame'
import { startBot } from '../lib/bot'
import Lobby from '../components/Lobby'
import Auction from '../components/Auction'
import Results from '../components/Results'

export default function GamePage() {
  const { gameId } = useParams<'gameId'>()
  const state = useGame(gameId!)
  const botStop = useRef<(() => void) | null>(null)

  useEffect(() => () => { botStop.current?.() }, [])

  function addBot(code: string) {
    if (!botStop.current) botStop.current = startBot(code)
  }

  if (state.loading) return <p className="center">Chargement…</p>
  if (!state.game) return <p className="center">Partie introuvable.</p>
  if (state.game.status === 'lobby') return <Lobby state={state} onAddBot={addBot} />
  if (state.game.status === 'playing') return <Auction state={state} />
  return <Results state={state} />
}
```

- [ ] **Step 2 : `src/components/Lobby.tsx`**

```tsx
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { GameState } from '../hooks/useGame'

export default function Lobby({ state, onAddBot }: { state: GameState; onAddBot: (code: string) => void }) {
  const { game, players, myPlayerId } = state
  const isHost = players.find(p => p.id === myPlayerId)?.seat === 0
  const [botRequested, setBotRequested] = useState(false)

  async function start() {
    const { error } = await supabase.rpc('start_game', { g_id: game!.id })
    if (error) alert(error.message)
  }

  function addBot() {
    setBotRequested(true)
    onAddBot(game!.code)
  }

  return (
    <main className="page">
      <h1>Salon</h1>
      <p>Code de la partie : <strong className="code">{game!.code}</strong></p>
      <ul className="player-list">
        {players.map(p => <li key={p.id}>{p.nickname}{p.seat === 0 && ' (hôte)'}</li>)}
      </ul>
      {isHost && players.length < 2 && (
        <button className="secondary" onClick={addBot} disabled={botRequested}>
          {botRequested ? 'Bot en route…' : '+ Ajouter un bot'}
        </button>
      )}
      {isHost
        ? <button className="primary" onClick={start} disabled={players.length < 2}>Démarrer</button>
        : <p>En attente de l'hôte…</p>}
    </main>
  )
}
```

- [ ] **Step 3 : `src/components/Auction.tsx`** — remplacer par (délais lus dans `games`, bouton « Je passe », carte FUT, anneau de timer) :

```tsx
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { GameState } from '../hooks/useGame'
import { useServerOffset } from '../hooks/useServerOffset'
import { useCountdown } from '../hooks/useCountdown'
import { maxBid, formatMs } from '../lib/game'
import config from '../config.json'

function cardTier(rating: number): string {
  return rating >= 88 ? 'gold' : rating >= 85 ? 'silver' : 'bronze'
}

export default function Auction({ state }: { state: GameState }) {
  const { game, players, auction, ownedCards, myPlayerId } = state
  const gameId = game!.id
  const closeMs = game!.close_delay_seconds * 1000
  const capMs = game!.max_auction_seconds * 1000
  const offset = useServerOffset()
  const deadline = auction
    ? Math.min(
        new Date(auction.last_bid_at).getTime() + closeMs,
        new Date(auction.opened_at).getTime() + capMs,
      )
    : null
  const remaining = useCountdown(deadline, offset)
  const expired = remaining <= 0

  const me = players.find(p => p.id === myPlayerId)
  const myCards = ownedCards.filter(c => c.player_id === myPlayerId)
  const missing = game!.deck_size - myCards.length
  const iLead = auction?.current_bidder === myPlayerId
  const iPassed = !!(myPlayerId && auction?.passed.includes(myPlayerId))
  const myMax = me ? maxBid(me.bankroll, missing, game!.min_bid) : 0
  const cantAct = iLead || iPassed || missing <= 0 || expired

  useEffect(() => {
    if (!auction || !expired) return
    const tryClose = () => { void supabase.rpc('close_auction', { g_id: gameId }).then(null, () => {}) }
    tryClose()
    const id = setInterval(tryClose, 1000)
    return () => clearInterval(id)
  }, [auction?.id, expired, gameId])

  async function bid(amount: number) {
    const { error } = await supabase.rpc('place_bid', { g_id: gameId, amount })
    if (error) console.warn(error.message)
  }

  async function pass() {
    const { error } = await supabase.rpc('pass_auction', { g_id: gameId })
    if (error) console.warn(error.message)
  }

  if (!auction) return <p className="center">Préparation de l'enchère…</p>
  const leader = players.find(p => p.id === auction.current_bidder)
  const ringFraction = Math.max(0, Math.min(1, remaining / closeMs))

  return (
    <main className="page arena">
      <div className={`fut-card ${cardTier(auction.card.rating)}`}>
        <div className="fut-rating">{auction.card.rating}</div>
        <div className="fut-position">{auction.card.position}</div>
        <div className="fut-name">{auction.card.name}</div>
      </div>

      <div className="timer-ring" role="timer">
        <svg viewBox="0 0 80 80">
          <circle className="ring-bg" cx="40" cy="40" r="34" />
          <circle
            className="ring-fg"
            cx="40" cy="40" r="34"
            strokeDasharray={2 * Math.PI * 34}
            strokeDashoffset={2 * Math.PI * 34 * (1 - ringFraction)}
          />
        </svg>
        <span className="ring-label">{formatMs(remaining)}</span>
      </div>

      <p className="current-bid">
        <strong>{auction.current_bid} €</strong> — {leader?.nickname}{iLead && ' (toi)'}
      </p>

      <div className="bid-buttons">
        {config.ui.increments.map(inc => {
          const amount = auction.current_bid + inc
          return (
            <button key={inc} className="chip" onClick={() => bid(amount)}
              disabled={cantAct || amount > myMax}>
              +{inc}
            </button>
          )
        })}
        <button className="chip max" onClick={() => bid(myMax)}
          disabled={cantAct || myMax <= auction.current_bid}>
          Max {myMax}
        </button>
      </div>
      <button className="pass" onClick={pass} disabled={cantAct}>
        {iPassed ? 'Tu as passé' : 'Je passe'}
      </button>

      <footer className="players-strip">
        {players.map(p => {
          const count = ownedCards.filter(c => c.player_id === p.id).length
          const passed = auction.passed.includes(p.id)
          return (
            <div key={p.id} className={`player-chip${p.id === auction.current_bidder ? ' leading' : ''}${passed ? ' passed' : ''}`}>
              <span className="chip-name">{p.nickname}</span>
              <span className="chip-bank">{p.bankroll} €</span>
              <span className="chip-deck">{'●'.repeat(count)}{'○'.repeat(Math.max(0, game!.deck_size - count))}</span>
              {passed && <span className="chip-state">a passé</span>}
              {p.id === auction.current_bidder && <span className="chip-state">mène</span>}
            </div>
          )
        })}
      </footer>
    </main>
  )
}
```

- [ ] **Step 4 : `src/components/Results.tsx`** — même logique qu'avant, cartes en mini-FUT :

```tsx
import { Link } from 'react-router-dom'
import type { GameState } from '../hooks/useGame'

function cardTier(rating: number): string {
  return rating >= 88 ? 'gold' : rating >= 85 ? 'silver' : 'bronze'
}

export default function Results({ state }: { state: GameState }) {
  const { players, ownedCards } = state
  const rows = players.map(p => {
    const cards = ownedCards.filter(c => c.player_id === p.id)
    return { player: p, cards, total: cards.reduce((s, c) => s + c.card.rating, 0) }
  }).sort((a, b) => b.total - a.total || b.player.bankroll - a.player.bankroll)

  const tie = rows.length === 2
    && rows[0].total === rows[1].total
    && rows[0].player.bankroll === rows[1].player.bankroll

  return (
    <main className="page">
      <h1 className="podium-title">{tie ? 'Égalité !' : `🏆 ${rows[0].player.nickname} gagne !`}</h1>
      {rows.map(({ player, cards, total }, i) => (
        <section key={player.id} className={`result-row${i === 0 && !tie ? ' winner' : ''}`}>
          <h2>{player.nickname} — {total} pts <small>(reste {player.bankroll} €)</small></h2>
          <div className="mini-cards">
            {cards.map(c => (
              <div key={c.card_id} className={`fut-card mini ${cardTier(c.card.rating)}`}>
                <div className="fut-rating">{c.card.rating}</div>
                <div className="fut-name">{c.card.name}</div>
                <div className="fut-price">{c.price_paid} €</div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <Link className="home-link" to="/">Nouvelle partie</Link>
    </main>
  )
}
```

- [ ] **Step 5 : Réécrire `src/index.css`** (thème stade sombre + FUT) :

```css
:root {
  font-family: system-ui, sans-serif;
  color-scheme: dark;
  --bg: #0d1321;
  --bg2: #1a2238;
  --text: #eef1f8;
  --muted: #8a93ad;
  --accent: #e8c34a;
  --danger: #d05252;
  --gold1: #f5d76e; --gold2: #b8860b;
  --silver1: #dfe3ea; --silver2: #7d8494;
  --bronze1: #d29a68; --bronze2: #7a4a24;
}
* { box-sizing: border-box; }
body {
  margin: 0; display: flex; justify-content: center; color: var(--text);
  background: radial-gradient(ellipse at 50% -20%, var(--bg2), var(--bg) 70%);
  min-height: 100vh;
}
#root { width: 100%; max-width: 480px; padding: 1rem; }
.page { display: flex; flex-direction: column; gap: 1rem; align-items: stretch; }
.center { text-align: center; margin-top: 4rem; color: var(--muted); }
.error { color: var(--danger); }
h1 { text-align: center; letter-spacing: 0.05em; }

input {
  background: var(--bg2); color: var(--text); border: 1px solid #2c3654;
  border-radius: 10px; padding: 0.8rem 1rem; font-size: 1rem;
}
button {
  cursor: pointer; border: none; border-radius: 12px; font-size: 1rem;
  padding: 0.9rem 1rem; color: var(--bg); background: var(--accent); font-weight: 700;
}
button:disabled { cursor: not-allowed; opacity: 0.35; }
button.secondary { background: var(--bg2); color: var(--text); border: 1px solid #2c3654; }
.code { font-size: 1.6rem; letter-spacing: 0.35rem; color: var(--accent); }
.player-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
.player-list li { background: var(--bg2); border-radius: 10px; padding: 0.7rem 1rem; }

/* ----- Carte FUT ----- */
.fut-card {
  position: relative; margin: 0 auto; width: 210px; aspect-ratio: 3 / 4;
  border-radius: 16px; padding: 1rem; text-align: center;
  display: flex; flex-direction: column; justify-content: flex-end;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
  color: #201703;
}
.fut-card.gold   { background: linear-gradient(160deg, var(--gold1), var(--gold2)); }
.fut-card.silver { background: linear-gradient(160deg, var(--silver1), var(--silver2)); }
.fut-card.bronze { background: linear-gradient(160deg, var(--bronze1), var(--bronze2)); }
.fut-rating {
  position: absolute; top: 0.7rem; left: 0.9rem;
  font-size: 2.4rem; font-weight: 900; line-height: 1;
}
.fut-position {
  position: absolute; top: 3.2rem; left: 0.9rem;
  font-size: 0.95rem; font-weight: 700; opacity: 0.75;
}
.fut-name { font-size: 1.15rem; font-weight: 800; padding-bottom: 0.4rem; }
.fut-card.mini { width: 92px; border-radius: 10px; padding: 0.5rem; }
.fut-card.mini .fut-rating { font-size: 1.3rem; top: 0.35rem; left: 0.5rem; }
.fut-card.mini .fut-name { font-size: 0.62rem; }
.fut-price { font-size: 0.6rem; opacity: 0.8; }

/* ----- Timer ----- */
.timer-ring { position: relative; width: 84px; height: 84px; margin: -0.4rem auto 0; }
.timer-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.ring-bg { fill: none; stroke: #2c3654; stroke-width: 7; }
.ring-fg {
  fill: none; stroke: var(--accent); stroke-width: 7; stroke-linecap: round;
  transition: stroke-dashoffset 0.1s linear;
}
.ring-label {
  position: absolute; inset: 0; display: grid; place-items: center;
  font-size: 1.25rem; font-variant-numeric: tabular-nums; font-weight: 700;
}
.current-bid { text-align: center; margin: 0; font-size: 1.1rem; }
.current-bid strong { color: var(--accent); font-size: 1.4rem; }

/* ----- Boutons de mise ----- */
.bid-buttons { display: flex; gap: 0.5rem; }
.chip { flex: 1; padding: 1.1rem 0; border-radius: 999px; font-size: 1.05rem; }
.chip.max { background: linear-gradient(160deg, var(--gold1), var(--gold2)); }
.pass { background: transparent; color: var(--danger); border: 1px solid var(--danger); }

/* ----- Bandeau joueurs ----- */
.players-strip { display: grid; gap: 0.5rem; margin-top: 0.5rem; }
.player-chip {
  display: flex; gap: 0.7rem; align-items: baseline;
  background: var(--bg2); border-radius: 10px; padding: 0.55rem 0.9rem;
  border: 1px solid transparent; font-size: 0.9rem;
}
.player-chip.leading { border-color: var(--accent); }
.player-chip.passed { opacity: 0.55; }
.chip-name { font-weight: 700; }
.chip-bank { color: var(--muted); }
.chip-deck { letter-spacing: 0.15em; color: var(--accent); }
.chip-state { margin-left: auto; font-size: 0.75rem; color: var(--muted); }

/* ----- Résultats ----- */
.podium-title { font-size: 1.5rem; }
.result-row { background: var(--bg2); border-radius: 14px; padding: 0.9rem 1rem; }
.result-row.winner { border: 1px solid var(--accent); }
.result-row h2 { margin: 0 0 0.6rem; font-size: 1.05rem; }
.result-row small { color: var(--muted); font-weight: 400; }
.mini-cards { display: flex; gap: 0.6rem; flex-wrap: wrap; }
.home-link { text-align: center; color: var(--accent); }
```

- [ ] **Step 6 : Vérifier** — `npm test && npm run build` — Attendu : 9 tests verts, build vert (plus aucune erreur de types résiduelle des Tasks 2–3).
- [ ] **Step 7 : Test manuel local** (`npm run dev`, Supabase local) : partie contre le bot — carte FUT dorée/argentée selon la note, anneau de timer fluide, « Je passe » adjuge immédiatement à 2 joueurs, le bot mise ET passe, la partie se boucle vite.
- [ ] **Step 8 : Stager** — `git add src/pages/GamePage.tsx src/components/Lobby.tsx src/components/Auction.tsx src/components/Results.tsx src/index.css`

---

### Task 6 : Documentation (initSupabase.md + README.md + RULES.md)

**Files:**
- Modify: `initSupabase.md`, `README.md`, `RULES.md`

- [ ] **Step 1 : `initSupabase.md`** — ajouter avant `## 3. Pièges connus du free tier` :

```markdown
## Workflow quotidien

**La vérité vit dans `supabase/migrations/` (git), jamais dans le dashboard.**

| Tu veux… | Tu fais… |
|---|---|
| Changer le schéma / une fonction de jeu | `npx supabase migration new ma_modif` → écrire le SQL → `npx supabase db reset` → `npx supabase test db` → commit → PR |
| Appliquer les nouvelles migrations sans perdre les données locales | `npx supabase migration up` |
| Repartir d'un état propre (avant les tests) | `npx supabase db reset` (rejoue migrations + seed) |
| Mettre à jour les types front | `npx supabase gen types typescript --local > src/lib/database.types.ts` |
| Changer un réglage (auth, etc.) | éditer `supabase/config.toml` → `npx supabase config push` |
| Consulter les données prod | Dashboard → Table Editor (lecture seulement) |

Les deux interdits :

1. **Jamais de SQL de schéma dans le dashboard prod** — il divergerait de git et la
   migration suivante casserait.
2. **Jamais re-pousser le seed** (`--include-seed`) — non idempotent, les 40 cartes
   seraient dupliquées.

## CI/CD

À chaque PR, le job `test` monte un Supabase **éphémère** dans le runner (Docker),
rejoue migrations + seed, lance pgTAP puis vitest et le build. Au merge sur `main` :
`migrate` applique les nouvelles migrations à la prod, puis `build` + `deploy`
publient le front sur GitHub Pages. `main` est protégée : PR obligatoire, check `test`
vert requis.

| Credential | Type | Pourquoi |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Variables (publiques) | Embarquées dans le bundle ; la sécurité vient de la RLS |
| `SUPABASE_DB_URL` | **Secret** | Connexion Postgres (pooler) avec le mot de passe DB — seul le job `migrate` y accède |
```

- [ ] **Step 2 : `README.md`** — remplacer la section `## Développement` par :

```markdown
## Développement local

Prérequis : Node 22+, Docker. Le CLI Supabase est un devDependency (`npx supabase …`) —
c'est lui qui pilote les conteneurs Docker (Postgres, realtime, auth), pas de
docker-compose à écrire.

```bash
npm install
npx supabase start      # stack local (première fois : télécharge les images)
npx supabase db reset   # rejoue migrations + seed (état propre)
cp .env.example .env.local   # puis coller l'anon key locale affichée par supabase start
npm run dev             # front sur http://localhost:5173
```

Tests : `npx supabase test db` (pgTAP — la logique de jeu) et `npm test` (vitest).

Modifier le schéma : `npx supabase migration new <nom>` → SQL → `db reset` → `test db`
→ régénérer les types. Détails : [`initSupabase.md`](initSupabase.md).

Les valeurs par défaut d'une partie (bankroll, deck, délais…) et les paramètres du bot
vivent dans [`src/config.json`](src/config.json).

Tester seul : crée une partie puis « + Ajouter un bot » dans le salon.

## Contribuer / déployer

`main` est protégée : branche + PR obligatoires. La CI teste chaque PR sur un Supabase
éphémère ; au merge, elle applique les migrations à la prod puis déploie le front sur
GitHub Pages. Personne ne pousse de schéma en prod à la main.
```

- [ ] **Step 3 : `RULES.md`** — mettre à jour :
  - §2 tableau : « Délai d'adjudication » **4 s → 3 s (configurable par partie)** ; ajouter la ligne « Passer | À tout moment sauf en tête | Se retirer définitivement de l'enchère en cours ».
  - §3 : ajouter après l'étape 5 : « À tout moment, un joueur qui ne mène pas peut **passer** : il se retire définitivement de cette enchère. Dès qu'il ne reste **aucun joueur capable ou désireux de surenchérir** (tous ont passé, ou leur réserve ne permet plus de suivre), la carte est **adjugée immédiatement**, sans attendre le délai. »
  - §6 : inchangé.
  - En bas de la section Versions V0, ajouter : « **V0.5** — enchère accélérée : bouton "Je passe", clôture immédiate sans challenger, délais configurables par partie, bot d'entraînement, thème FUT. »

- [ ] **Step 4 : Stager** — `git add initSupabase.md README.md RULES.md`

---

### Task 7 : Mise en service (contrôleur + Romain)

- [ ] **Step 1 (contrôleur)** : poser le secret CI `SUPABASE_DB_URL` (URL pooler complète avec mot de passe).
- [ ] **Step 2 (Romain)** : commit + push sur `main` — le **dernier** push direct.
- [ ] **Step 3 (contrôleur)** : vérifier le run CI complet (test → migrate applique `auction_pace` en prod → build → deploy).
- [ ] **Step 4 (contrôleur)** : protéger `main` :

```bash
gh api -X PUT repos/hodess/card_bet/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "checks": [{ "context": "test" }] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null
}
JSON
```

- [ ] **Step 5 (Romain)** : une partie contre le bot sur le site déployé (vérifier : rythme, « Je passe », design FUT sur mobile).
