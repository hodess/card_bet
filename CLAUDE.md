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

Workflow schéma : migration → `db reset` → `test db` → régénérer les types.

## Architecture des données

- **Éphémère** (purge pg_cron à 24 h) : `games`, `players`, `game_cards`,
  `auctions`, `player_cards`. Les parties sont temporaires par design.
- **Persistant** : `cards` (le pack), `profiles`, `matches`, `match_players`,
  `match_cards` (snapshot écrit par trigger en fin de partie), `friendships`.
- Realtime : `postgres_changes` filtrés par `game_id` (voir `useGame`).
- Seed des cartes : `supabase/seed.sql` (poussé une fois en prod, à la main).

## Où vit quoi (front)

- `src/pages/` : les écrans — la logique d'orchestration (fetch, états, handlers).
- `src/components/` : composants **props → rendu**, sans logique métier ni appel
  réseau (exceptions actées : `FriendButton`, `MatchHistoryList`).
- `src/hooks/` : état partagé/realtime (`useGame`, `useProfile`, `useFriendships`…).
- `src/lib/` : fonctions pures et accès Supabase (`game.ts`, `gameApi.ts`,
  `errors.ts`, `auth.ts`, `bot.ts` le runtime des bots, `botBrain.ts` leur logique
  de décision, `botNames.ts` leurs noms et tempéraments, `botSim.ts` le banc d'essai
  qui calibre les niveaux).
- `src/i18n/` : dictionnaires plats `fr.ts`/`en.ts` et le singleton `t()`,
  utilisable hors React (`errors.ts` en dépend). Le hook `useT` correspondant
  vit dans `src/hooks/`.
- `src/config.json` : tout le paramétrage (défauts de partie, bot, section `ui`
  pour les constantes d'interface). **Pas de nombre magique dans le code.**
  Ne pas réorganiser ce fichier sans demander.

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
   ni la marque, ni les données (pseudos, scores…), ni les commentaires.
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
