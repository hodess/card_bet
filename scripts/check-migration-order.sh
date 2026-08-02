#!/usr/bin/env bash
# Refuse une migration dont l'horodatage est ANTÉRIEUR à la dernière migration
# déjà présente sur la branche de base.
#
# Pourquoi : `supabase db push` refuse d'appliquer en production une migration
# plus vieille que la dernière déjà appliquée là-bas (« Found local migration
# files to be inserted before the last migration on remote database »). Le job
# `test`, qui démarre sur une base vide, ne peut pas voir ce problème : depuis
# zéro, l'ordre des fichiers est cohérent et tout passe. Le déploiement casse
# ensuite sur main, après le merge, quand il est trop tard.
#
# Le cas se produit dès que deux chantiers avancent en parallèle : celui qui
# fusionne en second porte des horodatages plus anciens que ceux déjà déployés.
set -euo pipefail

# Usage : check-migration-order.sh [base] [tête]
# La tête est paramétrable pour que le garde-fou soit lui-même testable sur des
# commits passés, sans quoi on ne saurait pas s'il attrape vraiment quoi que ce soit.
base="${1:-origin/main}"
tete="${2:-HEAD}"

derniere_base=$(git ls-tree --name-only "$base" supabase/migrations/ \
  | sed 's#.*/##' | grep -E '^[0-9]{14}_' | sort | tail -1 || true)

if [ -z "$derniere_base" ]; then
  echo "Aucune migration sur $base : rien à vérifier."
  exit 0
fi

version_base="${derniere_base%%_*}"
echo "Dernière migration sur $base : $derniere_base"

fautives=()
while read -r chemin; do
  [ -z "$chemin" ] && continue
  nom="${chemin##*/}"
  case "$nom" in
    [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]_*) ;;
    *) continue ;;
  esac
  version="${nom%%_*}"
  if [[ "$version" < "$version_base" ]]; then
    fautives+=("$nom")
  fi
done < <(git diff --name-only --diff-filter=A "$base"..."$tete" -- supabase/migrations/)

if [ ${#fautives[@]} -eq 0 ]; then
  echo "Ordre des migrations correct : aucune n'est antérieure à $version_base."
  exit 0
fi

echo
echo "ÉCHEC : ces migrations sont antérieures à la dernière déjà sur $base ($version_base) :"
for f in "${fautives[@]}"; do echo "  - $f"; done
cat <<'AIDE'

`supabase db push` les refusera en production, et le déploiement cassera sur
main après le merge — pas ici.

Correctif : renomme ces fichiers avec un horodatage postérieur à celui indiqué
ci-dessus, en conservant leur ordre relatif si elles dépendent l'une de l'autre,
puis rejoue `npx supabase db reset && npx supabase test db`.
AIDE
exit 1
