# CardBet — Guide pour agents et développeurs

Jeu d'enchères de cartes temps réel (React + Supabase). Lire aussi :
[`README.md`](README.md) (vue d'ensemble), [`RULES.md`](RULES.md) (règles du jeu),
[`initSupabase.md`](initSupabase.md) (mise en place et config prod).

## Principe fondateur

**Le client ne construit jamais l'état, il le reflète.** Toute la logique de jeu
vit dans des fonctions Postgres `SECURITY DEFINER` appelées en RPC ; le front
envoie des intentions et re-rend ce que le realtime lui renvoie. Aucune écriture
directe dans les tables depuis le client (RLS partout, aucune policy d'écriture).
Toute nouvelle fonctionnalité respecte ce partage : l'arbitre, c'est Postgres.

## Commandes

| Quoi | Commande |
|---|---|
| Stack locale (Docker) | `npx supabase start` |
| Rejouer migrations + seed | `npx supabase db reset` |
| Tests SQL (pgTAP) | `npx supabase test db` |
| Tests front (vitest) | `npm test` |
| Dev server | `npm run dev` |
| Build + typecheck | `npm run build` |
| Lint | `npm run lint` |
| Nouvelle migration | `npx supabase migration new <nom>` |
| Régénérer les types | `npx supabase gen types typescript --local > src/lib/database.types.ts` |
| Régénérer `seed.sql` depuis `data/packs/*.json` | `npm run cards:seed` |
| Générer la migration d'un pack officiel | `npm run cards:migration -- <nom>` |

Workflow schéma : migration → `db reset` → `test db` → régénérer les types.

**Horodatage des migrations.** Une migration doit toujours porter un horodatage
**postérieur** à la dernière migration déjà sur `main`. Sinon `supabase db push`
la refuse en production (« Found local migration files to be inserted before the
last migration on remote database ») et le déploiement casse **après** le merge :
le job `test`, qui part d'une base vide, ne voit rien. Le cas arrive dès que deux
chantiers avancent en parallèle et que celui qui fusionne en second porte des
horodatages plus anciens. Si ça se produit, renommer les fichiers concernés avec
un horodatage plus récent, en conservant leur ordre relatif. Le job `migrations`
de la CI vérifie ce point sur chaque PR (`scripts/check-migration-order.sh`) et
applique en plus les nouvelles migrations par-dessus l'état de la base, comme le
fait la prod.

**Une seule migration fait autorité sur une fonction donnée.** Deux chantiers qui
redéfinissent la même fonction Postgres se marchent dessus en silence : l'ordre
des horodatages décide du gagnant, et `create or replace` ne prévient de rien.
Un test pgTAP par comportement attendu est la seule protection — c'est ainsi que
la recopie de `bot_level` dans `match_players`, perdue par une collision de ce
type, a été rattrapée.

## Architecture des données

- **Éphémère** (purge pg_cron à 24 h) : `games`, `players`, `game_cards`,
  `auctions`, `player_cards`. Les parties sont temporaires par design.
- **Contenu utilisateur** : `packs` et `cards` ne sont plus jamais supprimés à
  chaud, seulement marqués (`packs.deleted_at`, `cards.retired`) — une partie
  en cours garde ses cartes même si l'auteur réécrit ou supprime son pack ;
  trois jobs pg_cron (`purge-old-games` 4 h 00, `purge-retired-cards` 4 h 15,
  `purge-anonymous-users` 4 h 30) nettoient ensuite ce qui n'est plus référencé.
- **Persistant** : `profiles`, `matches`, `match_players`, `match_cards`
  (snapshot écrit par trigger en fin de partie), `friendships`. `match_cards`
  est un **vrai** snapshot — nom, position et note de chaque carte y sont
  recopiés, aucune clé étrangère vers `cards` — et `matches.private_pack`
  (figé à l'enregistrement) restreint sa lecture aux joueurs du match quand la
  partie s'est jouée sur un pack privé.
- Realtime : `postgres_changes` filtrés par `game_id` (voir `useGame`).
- Packs officiels : `data/packs/*.json`, poussés en prod par les migrations
  générées par `npm run cards:migration`. `supabase/seed.sql` est un fichier
  **généré** (`npm run cards:seed`) dont un test vitest vérifie la synchronisation
  avec `data/packs/` — ne jamais l'éditer à la main.

## Où vit quoi (front)

- `src/pages/` : les écrans — la logique d'orchestration (fetch, états, handlers).
- `src/components/` : composants **props → rendu**, sans logique métier ni appel
  réseau (exceptions actées : `FriendButton`, `MatchHistoryList`).
- `src/hooks/` : état partagé/realtime (`useGame`, `useProfile`, `useFriendships`…).
- `src/lib/` : fonctions pures et accès Supabase (`game.ts`, `gameApi.ts`,
  `errors.ts`, `auth.ts`, `packs.ts` l'autorité unique du format et de la
  validation d'un pack — ses règles sont des vérificateurs purs (`checkName`,
  `checkCardRating`, `checkCardDuplicate`…) appelés par deux entrées, l'import
  JSON et `packDraft.ts`, la même garde que « Une seule migration fait
  autorité sur une fonction donnée » ci-dessus mais côté format de pack —,
  `packsApi.ts` les appels RPC associés, `packDraft.ts` l'état d'édition d'un
  pack et ses diagnostics (erreurs ancrées par carte et par champ, import
  tolérant, vocabulaire de positions), `bot.ts` le runtime des bots,
  `botBrain.ts` leur logique de décision, `botNames.ts` leurs noms et
  tempéraments, `botSim.ts` le banc d'essai qui calibre les niveaux).
  `packs.ts` est le **seul** module de `lib/` partagé avec un script Node
  (`scripts/build-cards.ts`, packs officiels) — d'où l'attribut d'import sur
  `config.json` et sa vérification sous `tsconfig.node.json` en plus de
  `tsconfig.app.json`.
- `src/i18n/` : dictionnaires plats `fr.ts`/`en.ts` et le singleton `t()`,
  utilisable hors React (`errors.ts` en dépend). Le hook `useT` correspondant
  vit dans `src/hooks/`. `src/i18n/format.ts` est un module pur d'interpolation
  des motifs `{var}`, sans singleton ni DOM — c'est lui que réutilise
  `scripts/build-cards.ts`.
- `src/config.json` : tout le paramétrage (défauts de partie, bot, section `ui`
  pour les constantes d'interface). `packs.cards.tiers` porte les seuils de
  palier or/argent/bronze, lus à la fois par `cardTier` (`src/lib/game.ts`) et
  par le curseur de note de l'éditeur de pack — même seuils partout.
  **Pas de nombre magique dans le code.** Ne pas réorganiser ce fichier sans
  demander.

## Règles de clean code

1. **Une responsabilité par fichier.** Un composant qui grossit ou accumule des
   états sans rapport se découpe (cf. `Card`, `TimerRing`, `MatchHistoryList`).
2. **DRY sans sur-abstraction.** Factoriser la 2e duplication réelle ; ne jamais
   créer de généricité spéculative (YAGNI). Pas de lib UI externe : le thème FUT
   est du CSS custom (`src/index.css`, variables en `:root`).
3. **Erreurs utilisateur** : toujours `errorMessage(e)` (`src/lib/errors.ts`) +
   `<p className="error">`. **Jamais `alert()`.** Exception : les races normales
   d'enchère restent silencieuses (`console.warn`) dans `Auction`.
4. **i18n** : tout texte visible passe par `t()` ; les clés vivent dans
   `src/i18n/{fr,en}.ts`. La parité des clés et des motifs d'interpolation
   `{var}` entre les deux dictionnaires est vérifiée par test. On ne traduit
   ni la marque, ni les données (pseudos, scores, noms/descriptions/emoji/
   positions de packs…), ni les commentaires.
5. **Erreurs SQL** : `raise exception 'CODE_EN_MAJUSCULES'` côté Postgres, code
   ajouté à la table de `errors.ts` côté front.
6. **Français partout** : UI, commentaires, messages de commit, docs.
7. **Toute migration arrive avec ses tests pgTAP** (`supabase/tests/`, pattern
   `test_signup` pour simuler des comptes). Toute fonction pure nouvelle dans
   `lib/` arrive avec son test vitest — `botSim.ts` ne fait pas exception, il a
   les siens (`botSim.test.ts`). Ce qui fait exception, c'est son rôle : c'est un
   banc d'essai qui rejoue l'enchère en tours discrets, sans réseau ni minuterie —
   il ne remplace pas le serveur et ne doit jamais servir à valider une règle du
   jeu (ça, c'est le rôle de pgTAP), seulement à comparer les niveaux de bot
   entre eux.
8. **Comportement serveur d'abord** : ne jamais faire confiance au client
   (validation, identité, montants — tout est revérifié en SQL).

## Git

Ne jamais committer, brancher ou pousser sans demande explicite de Romain.
`main` est protégée : la CI teste chaque PR sur un Supabase éphémère et applique
les migrations en prod au merge.
