# Packs de cartes officiels

Ces fichiers sont la **source de vérité des packs officiels**. Les packs créés
par les joueurs ne laissent aucun fichier ici : ils vivent uniquement en base,
écrits par la RPC `save_pack`. Le format est le même des deux côtés.

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

- `slug` doit être identique au nom du fichier ; `sortOrder` est unique entre
  fichiers et ne sert qu'à l'ordre d'affichage des packs officiels.
- `emoji` et `description` sont facultatifs.
- `positions` déclare le vocabulaire du pack ; la `position` de chaque carte
  doit y figurer.
- `rating` est un entier entre 1 et 99. Les noms de cartes sont uniques dans un
  pack.
- Tout champ non listé dans le schéma est rejeté par la validation.
- **Les cartes n'ont pas d'id.** Réinstaller un pack remplace son jeu de
  cartes ; l'historique des parties n'en souffre pas, `match_cards` en garde un
  snapshot complet.
- Notes **inventées**, aucun scraping, aucun visuel — contrainte de droits
  assumée depuis la V0.
