# Packs de cartes

Ces fichiers sont la **source de vérité des cartes**. Après toute modification :

    npm run cards:seed                       # régénère supabase/seed.sql
    npm run cards:migration -- <nom>         # produit la migration d'upsert pour la prod

Un test vitest valide ces fichiers et vérifie que `supabase/seed.sql` leur correspond.
Ne jamais éditer `supabase/seed.sql` à la main.

## Règles

- **Un `id` est définitif.** On ajoute des cartes ; on peut corriger `name`, `position`
  ou `rating` ; on ne supprime **jamais** une ligne et on ne réutilise **jamais** un id.
  `match_cards` référence ces ids : les réutiliser réécrirait l'historique des parties.
- **Les ids sont uniques entre tous les packs**, par plages : football 1–999,
  pack suivant 1000–1999, etc.
- `slug` doit être identique au nom du fichier.
- `rating` est un entier entre 1 et 99.
- Tout champ non listé dans le schéma est rejeté par la validation.
- Notes **inventées**, aucun scraping, aucun visuel — contrainte de droits assumée
  depuis la V0.
