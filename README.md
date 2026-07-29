# CardBet

Jeu multijoueur en ligne de parties rapides : les cartes apparaissent une par une, les
joueurs **enchérissent en temps réel** pour remplir leur deck, et le meilleur total de
notes l'emporte. Monnaie 100 % virtuelle, parties de quelques minutes.

## Comment on joue

1. Chaque joueur démarre avec la même bankroll (1 000).
2. Une carte apparaît — un joueur désigné (rotation façon blinds au poker) ouvre
   automatiquement à la mise minimale.
3. Les autres surenchérissent avec des boutons rapides (+10 / +50 / +100 / Max).
   **4 secondes sans surenchère = adjugé** au dernier enchérisseur.
4. Les cartes suivantes sont cachées : payer cher maintenant ou économiser pour la
   suite, c'est tout le dilemme.
5. La partie s'arrête quand tous les decks sont pleins. Meilleur total de notes gagne ;
   départage à l'argent restant.

Règles complètes et versionnées : [`RULES.md`](RULES.md).

## Stack

| Brique | Rôle |
|---|---|
| Vite + React + TypeScript | Frontend, hébergé sur **GitHub Pages** (statique) |
| **Supabase** (Postgres + Realtime + Auth anonyme) | État des parties, arbitre du jeu (fonctions SQL), synchro temps réel |

Toute la logique de jeu vit dans des fonctions Postgres appelées en RPC : le client ne
fait qu'afficher l'état et envoyer des intentions — impossible de tricher depuis le
navigateur. Mise en place de Supabase : [`initSupabase.md`](initSupabase.md).

## Roadmap

- **V0 (en cours)** — la boucle d'enchère qui marche : 2 joueurs, deck de 3 cartes, un
  pack Football (~40 joueurs réels, sans photos), partie privée par code, auth anonyme.
  Design technique : [`docs/superpowers/specs/2026-07-29-cardbet-v0-design.md`](docs/superpowers/specs/2026-07-29-cardbet-v0-design.md)
- **V1** — joker (refuser une ouverture forcée), 2 à 8 joueurs, taille de deck
  configurable, plusieurs packs (Football, Basket, Animés…), parties publiques.
- **V2** — comptes, historique, statistiques, amis, ranking ELO. Les parties restent
  temporaires ; seuls comptes/stats/classements sont persistés.

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
