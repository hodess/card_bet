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

Le seed des ~40 cartes Football va dans `supabase/seed.sql`.

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

⚠️ `seed.sql` n'est pas idempotent : le rejouer duplique les 40 cartes. N'inclus le seed que sur le premier push, ou exécute-le une seule fois via l'éditeur SQL.

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

---

## 3. Pièges connus du free tier

- **Pause après ~7 jours d'inactivité** : le projet cloud s'endort, le jeu est « down »
  jusqu'à un réveil manuel dans le dashboard. Invisible en dev actif, à savoir si tu
  partages le lien.
- **`supabase db reset` est local uniquement** — ne jamais chercher d'équivalent sur le
  cloud ; le cloud n'évolue que par `db push` de nouvelles migrations.
- Les **clés locales et cloud sont différentes** : si le front affiche des erreurs 401,
  vérifie que `.env.local` pointe bien sur l'environnement que tu crois.
