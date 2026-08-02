# Supabase pour CardBet — comment ça marche et comment le mettre en place

Ce document explique **ce que fait Supabase dans CardBet** puis **la mise en place pas à
pas** (compte, projet local, projet cloud, migrations, realtime).

---

## 1. C'est quoi Supabase, concrètement

Supabase = une base **Postgres** managée + des services autour, avec un free tier.
CardBet en utilise quatre briques :

| Brique | Ce qu'elle fait pour CardBet |
|---|---|
| **Postgres** | Stocke l'état des parties (tables `games`, `players`, `auctions`…) et surtout **arbitre le jeu** via des fonctions SQL |
| **RPC (fonctions SQL)** | `create_game`, `join_game`, `start_game`, `place_bid`, `close_auction` — appelées depuis React avec `supabase.rpc('place_bid', {...})` |
| **Realtime** | Pousse chaque changement de ligne (`postgres_changes`) vers les navigateurs abonnés — c'est ce qui fait que tu vois la mise adverse arriver en direct |
| **Auth anonyme** | Une identité par navigateur, sans inscription. Persiste dans le localStorage (un F5 ne te fait pas perdre ta place) |

### Le flux d'une mise, de bout en bout

```
Toi (navigateur A)                    Adversaire (navigateur B)
  │ clic « +50 »
  │ supabase.rpc('place_bid', {game_id, amount: 60})
  ▼
Fonction SQL place_bid  ── vérifie : enchère ouverte ? > mise courante ?
  │                        règle de réserve respectée ? pas déjà dernier enchérisseur ?
  │ UPDATE auctions SET current_bid=60, current_bidder=A, last_bid_at=now()
  ▼
Realtime détecte l'UPDATE et le diffuse
  │                                     │
  ▼                                     ▼
Ton écran affiche 60             Son écran affiche 60, son timer 4 s repart
```

### Pourquoi ce montage est intrichable (avec un front 100 % statique)

- Le client n'a **aucun droit d'écriture** sur les tables : la RLS (Row Level Security)
  bloque tout `INSERT/UPDATE` direct. Seules les fonctions RPC (exécutées côté serveur
  avec `SECURITY DEFINER`) écrivent.
- Les cartes à venir (`game_cards`) sont **illisibles** par le client (RLS) : impossible
  de connaître le tirage en inspectant le réseau.
- Les timers font foi **côté serveur** : `close_auction` refuse de clôturer avant
  `last_bid_at + 4 s` à l'horloge de Postgres, peu importe ce que prétend le client.
- La clé `anon` embarquée dans le front est **publique par design** : elle ne donne que
  les droits définis par la RLS, c'est-à-dire quasiment rien en direct.
- La policy `cards_read` d'un pack privé ne s'ouvre qu'à son auteur **ou** aux
  joueurs d'une partie qui l'utilise (`games.pack`) : le temps d'une partie, un
  invité voit les cartes sans que le pack devienne public pour autant.
- `match_cards` (l'historique détaillé) reste fermée aux non-joueurs quand la
  partie s'est jouée sur un pack privé, via `matches.private_pack` — un
  booléen figé à l'enregistrement, pas une jointure vers `games` (qui disparaît
  à 24 h et rendrait la policy passante après la purge).

---

## 2. Mise en place

### Prérequis

- Node 20+, Docker (pour l'environnement local).
- CLI Supabase : `npm install -D supabase` (puis `npx supabase …`).

### a. Le projet cloud (une fois)

1. Crée un compte sur [supabase.com](https://supabase.com) → « New project » (free tier).
2. Note deux valeurs dans *Settings → API* :
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`
3. Note aussi le **project ref** (l'identifiant dans l'URL du dashboard).

### b. Le projet local (dev quotidien)

```bash
npx supabase init      # crée supabase/ (config, migrations/, seed.sql)
npx supabase start     # lance Postgres + realtime + studio en Docker
```

`supabase start` affiche les URL/clés **locales** (API sur :54321, studio sur :54323).
En dev, le front pointe dessus via `.env.local` :

```bash
# .env.local (dev, non versionné)
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<clé anon locale affichée par supabase start>
```

### c. Le schéma : migrations + seed

Tout le schéma (tables, RLS, fonctions RPC) vit dans des fichiers SQL versionnés —
jamais de modification à la main dans le dashboard :

```bash
npx supabase migration new create_game_schema   # crée supabase/migrations/<ts>_create_game_schema.sql
# … écrire le SQL dedans …
npx supabase db reset    # rejoue TOUTES les migrations + seed.sql en local (destructif, local seulement)
```

Le seed des packs officiels (Football, Naruto — 80 cartes à eux deux) va dans
`supabase/seed.sql`, sous forme d'appels
`select install_official_pack($json$ … $json$::jsonb, '<slug>', <ordre>);`
un par pack complet (nom, emoji, description, vocabulaire de positions, cartes).

Realtime s'active table par table, dans une migration :

```sql
alter publication supabase_realtime add table games, players, auctions, player_cards;
```

L'auth anonyme s'active dans `supabase/config.toml`
(`[auth] enable_anonymous_sign_ins = true`) et dans le dashboard cloud
(*Authentication → Providers → Anonymous*).

### d. Pousser vers le cloud

```bash
npx supabase link --project-ref <project-ref>   # une fois
npx supabase db push --include-seed             # applique les migrations locales (et le seed) au cloud
```

`seed.sql` est un fichier **généré** (`npm run cards:seed`, ne jamais l'éditer à la
main). Les cartes n'ont plus d'id stable : l'idempotence vient du `on conflict
(slug) do update` sur `packs` et du remplacement intégral du jeu de cartes par
`replace_pack_cards` — rejouer le seed ne duplique rien. En production, ce sont
les migrations générées par `npm run cards:migration` qui portent les packs ;
`--include-seed` ne sert donc qu'à amorcer un environnement neuf.

### e. Générer les types TypeScript

Après chaque changement de schéma :

```bash
npx supabase gen types typescript --local > src/lib/database.types.ts
```

Le client Supabase devient entièrement typé (tables, colonnes, retours de RPC).

### f. Tester la logique de jeu

Les tests pgTAP vivent dans `supabase/tests/` et tournent contre la base locale :

```bash
npx supabase test db
```

C'est là que se vérifient la règle de réserve, l'idempotence de `close_auction`, les
mises concurrentes, l'auto-complétion et le calcul du classement.

### g. Le ménage automatique (pg_cron)

Trois jobs tournent en prod, tous portés par des migrations — aucune étape
manuelle n'est requise :

| Job | Horaire | Rôle |
|---|---|---|
| `purge-old-games` | 4 h 00 | Supprime les parties de plus de 24 h |
| `purge-retired-cards` | 4 h 15 | Supprime les cartes retirées (`cards.retired`) et les packs supprimés (`packs.deleted_at`) que plus aucune partie ne référence |
| `purge-anonymous-users` | 4 h 30 | Supprime les comptes anonymes de plus de 30 jours |

Vérifier qu'ils sont bien programmés : `select * from cron.job;` (Table Editor
ou `psql` sur le pooler).

---

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
2. **Jamais éditer `seed.sql` à la main** — il est généré par `npm run cards:seed` ;
   en production, ce sont les migrations (`npm run cards:migration`) qui portent
   les cartes, le seed n'est là que pour amorcer un environnement neuf.

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

---

## 3. Pièges connus du free tier

- **Pause après ~7 jours d'inactivité** : le projet cloud s'endort, le jeu est « down »
  jusqu'à un réveil manuel dans le dashboard. Invisible en dev actif, à savoir si tu
  partages le lien.
- **`supabase db reset` est local uniquement** — ne jamais chercher d'équivalent sur le
  cloud ; le cloud n'évolue que par `db push` de nouvelles migrations.
- Les **clés locales et cloud sont différentes** : si le front affiche des erreurs 401,
  vérifie que `.env.local` pointe bien sur l'environnement que tu crois.
- **Supprimer un compte ayant créé un pack échoue.** `packs.owner_id` est
  `references profiles(id) on delete cascade`, mais la cascade bute toujours
  sur `cards_pack_fkey` (un pack a au moins deux cartes) : le `delete` remonte
  une erreur de contrainte. Non atteignable aujourd'hui (un compte anonyme ne
  peut pas posséder de pack, et `purge-anonymous-users` ne vise que les
  anonymes), mais si le besoin se présente : appeler `delete_pack` sur chacun
  de ses packs, attendre que `purge-retired-cards` les efface, puis seulement
  supprimer le compte.

---

## V1 — Configuration Auth (dashboard prod, à faire une fois)

Dans **Authentication → Settings** du projet Supabase :

1. **Allow manual linking** : ON (requis par `linkIdentity` pour l'upgrade anonyme → Google).
2. **Confirm email** : OFF (l'upgrade email + mot de passe doit être immédiat).
3. **Secure email change** : OFF (une seule confirmation, pas double).
4. **Site URL** : `https://hodess.github.io/card_bet/` ; ajouter la même URL dans
   **Redirect URLs** (le retour OAuth atterrit sur la racine, pas sur une route `#/`).

Provider **Google** (Authentication → Providers → Google) :

1. Dans Google Cloud Console : créer un projet → **OAuth consent screen** (External,
   app name CardBet) → **Credentials → OAuth Client ID** (Web application).
2. **Authorized redirect URI** : `https://ppcdvechokyzkacxszfo.supabase.co/auth/v1/callback`.
3. Copier Client ID + Secret dans le provider Google du dashboard, l'activer.

En local, Google n'est **pas** activé : tester l'upgrade avec email + mot de passe
(les emails partent dans la boîte de test http://127.0.0.1:54324). Le flux Google se
teste en prod dès le premier déploiement (spec V1, risque n° 1).
