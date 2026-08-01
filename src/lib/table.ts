import config from '../config.json'

const TABLE = config.ui.auction.table

export type Edge = 'left' | 'top' | 'right'
// x, y : fractions [0..1] du rectangle de la carte, (0,0) au coin haut-gauche.
export type SeatUnit = { edge: Edge; x: number; y: number }

// Les sièges se posent à intervalle régulier sur le périmètre de la carte : on
// démarre sur le bord gauche à `startFraction` de la hauteur, on remonte au coin,
// on traverse le bord haut, on redescend le bord droit jusqu'à la même fraction.
// Un arc elliptique passerait par-dessus les coins de la carte (une ellipse ne
// dépasse le rectangle qu'elle contient qu'au milieu de ses côtés) ; le périmètre,
// lui, garantit par construction que le point d'ancrage de chaque siège reste
// sur le bord de la carte — c'est le transform d'ancrage dans src/index.css
// (translate vers l'extérieur, non couvert par ce test) qui garantit ensuite
// que la boîte du siège reste, elle, hors de la carte.
// Les longueurs viennent de la carte nominale du config : la plaque CSS fait
// exactement cette taille, donc les fractions retombent au pixel près.
export function seatUnits(count: number): SeatUnit[] {
  const monte = TABLE.startFraction * TABLE.cardH
  const traverse = TABLE.cardW
  const total = monte * 2 + traverse
  // Un seul joueur n'existe pas en partie, mais un rendu intermédiaire peut le
  // voir passer : on le pose en haut plutôt que de diviser par zéro.
  if (count < 2) return [{ edge: 'top', x: 0.5, y: 0 }]

  return Array.from({ length: count }, (_, i) => {
    const d = (total * i) / (count - 1)
    if (d < monte) {
      // Écrêtage à `startFraction` : `monte` est un aller-retour flottant
      // (startFraction × cardH puis / cardH) qui ne revient pas toujours
      // bit à bit à sa valeur de départ ; on ne dépasse jamais la borne réelle.
      return { edge: 'left' as const, x: 0, y: Math.min((monte - d) / TABLE.cardH, TABLE.startFraction) }
    }
    if (d <= monte + traverse) {
      return { edge: 'top' as const, x: (d - monte) / TABLE.cardW, y: 0 }
    }
    // Borne haute : le dernier siège tombe sur `total`, dont l'arithmétique
    // flottante peut dépasser d'un cheveu — même écrêtage que côté gauche.
    return {
      edge: 'right' as const,
      x: 1,
      y: Math.min((d - monte - traverse) / TABLE.cardH, TABLE.startFraction),
    }
  })
}

// Rotation de la liste pour que le joueur local occupe le premier siège, bord
// gauche : un repère stable d'une partie à l'autre, quel que soit son siège
// serveur. L'ordre relatif des autres est préservé, la table reste cohérente.
export function seatOrder<T extends { id: string }>(rows: T[], myPlayerId: string | null): T[] {
  const i = myPlayerId ? rows.findIndex(r => r.id === myPlayerId) : -1
  if (i <= 0) return rows
  return [...rows.slice(i), ...rows.slice(0, i)]
}
