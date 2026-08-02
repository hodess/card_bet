# Packs de cartes officiels

Ces fichiers sont la **source de vérité des packs officiels**. Les packs créés
par les joueurs ne laissent aucun fichier ici : ils vivent uniquement en base,
écrits par la RPC `save_pack`.

Le format n'est **pas identique des deux côtés** : ces fichiers portent en plus
`slug` et `sortOrder`, propres aux packs officiels (voir plus bas). L'éditeur
de pack (`/packs/nouveau`) n'accepte ni l'un ni l'autre — tout champ inconnu
est rejeté par la validation, coller cet exemple tel quel dans l'éditeur y
produit deux erreurs.

Après toute modification :

    npm run cards:seed                       # régénère supabase/seed.sql
    npm run cards:migration -- <nom>         # produit la migration pour la prod

Un test vitest valide ces fichiers et vérifie que `supabase/seed.sql` leur
correspond. Ne jamais éditer `supabase/seed.sql` à la main.

## Format

```json
{
  "slug": "football",
  "sortOrder": 1,
  "name": "Football",
  "emoji": "⚽",
  "description": "Les stars du ballon rond.",
  "positions": { "GK": "Gardien", "ATT": "Attaquant" },
  "cards": [ { "name": "Kylian Mbappé", "position": "ATT", "rating": 91 } ]
}
```

## Règles

`validate_pack_payload` (SQL) **fait autorité** sur les bornes ci-dessous ;
`src/config.json` (section `packs`) ne fait que les refléter pour l'éditeur —
modifier une borne sans l'autre les fait diverger.

- `slug` doit être identique au nom du fichier ; `sortOrder` est unique entre
  fichiers et ne sert qu'à l'ordre d'affichage des packs officiels. Les deux
  sont propres aux packs officiels : un pack de joueur n'en porte aucun.
- `name` : 1 à 40 caractères.
- `emoji` et `description` sont facultatifs ; `emoji` ≤ 8 caractères,
  `description` ≤ 200 caractères.
- `positions` déclare le vocabulaire du pack : 1 à 12 entrées, code de 1 à 6
  caractères, libellé de 1 à 30 caractères. La `position` de chaque carte doit
  y figurer.
- `cards` : 2 à 300 cartes. Nom de carte 1 à 40 caractères, unique dans le
  pack ; `rating` un entier entre 1 et 99.
- Les longueurs se comptent en **caractères**, pas en unités UTF-16 (un emoji
  compte pour un, même s'il en occupe deux côté JavaScript).
- Un compte peut posséder jusqu'à 20 packs.
- Tout champ non listé dans le schéma est rejeté par la validation.
- **Les cartes n'ont pas d'id.** Réinstaller un pack remplace son jeu de
  cartes ; l'historique des parties n'en souffre pas, `match_cards` en garde un
  snapshot complet.
- Notes **inventées**, aucun scraping, aucun visuel — contrainte de droits
  assumée depuis la V0.
