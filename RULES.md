# CardBet — Règles du jeu

CardBet est un jeu multijoueur en ligne de parties rapides où les joueurs enchérissent
sur des cartes pour constituer le meilleur deck. Aucune monnaie réelle : chaque joueur
démarre avec la même bankroll virtuelle.

---

## 1. Principe

- Les cartes apparaissent **une par une**, dans un ordre aléatoire, tirées **sans remise**
  depuis le pack de la partie.
- Les cartes à venir sont **cachées** : on ne sait pas ce qui va sortir. La connaissance
  de l'univers du pack (foot, basket…) fait partie du skill.
- Chaque joueur enchérit pour remporter les cartes et remplir son deck.
- La partie s'arrête quand **tous les joueurs ont un deck complet**.
- Le gagnant est le joueur dont le deck a le **plus grand total de notes**.

## 2. Paramètres d'une partie

| Paramètre | Défaut | Description |
|---|---|---|
| Bankroll de départ | 1 000 | Identique pour tous les joueurs |
| Taille du deck | 3 | Nombre de cartes à obtenir pour finir |
| Mise minimale | 10 | Sert aussi de montant d'ouverture forcée |
| Incréments de mise | +10 / +50 / +100 / Max | Boutons de surenchère rapide |
| Délai d'adjudication | 8 s (configurable par partie, 6 s minimum) | Sans surenchère pendant ce délai, la carte est adjugée. Sert aussi de temporisation entre deux cartes. |
| Passer | À tout moment sauf en tête | Se retirer définitivement de l'enchère en cours |
| Durée max d'une enchère | 60 s | Plafond dur, l'enchère ne peut pas bloquer la partie |

La durée totale d'une partie n'est pas fixe : elle dépend du rythme des enchères.
L'objectif de design est que ça reste rapide (ordre de grandeur : 2 à 3 minutes).

## 3. Déroulement d'une enchère

1. Une carte apparaît, visible de tous.
2. **Ouverture forcée** : un joueur désigné (rotation dans l'ordre de la table, façon
   blinds au poker) mise automatiquement la mise minimale. On ne désigne que des joueurs
   dont le deck n'est pas complet.
3. Les autres joueurs peuvent surenchérir via les boutons d'incréments. Chaque mise doit
   être strictement supérieure à la précédente.
4. Chaque nouvelle mise **relance le compte à rebours** (délai d'adjudication, 8 s par
   défaut).
5. À tout moment, un joueur qui ne mène pas peut **passer** : il se retire
   définitivement de cette enchère.
6. La carte est **adjugée au dernier enchérisseur** — qui paie sa mise et ajoute la
   carte à son deck — dès que l'une de ces conditions est remplie :
   - le délai d'adjudication s'écoule sans surenchère ;
   - le plafond de 60 secondes est atteint ;
   - **plus aucun joueur ne peut ou ne veut surenchérir** (tous ont passé, ou leur
     réserve ne permet plus de suivre) : adjudication **immédiate**, sans attendre.
7. L'adjudication est **jouée à l'écran** (tampon « Adjugé », la carte rejoint le deck
   du gagnant), puis la carte suivante apparaît. Chaque carte est précédée d'une
   **temporisation** égale au délai d'adjudication de la partie — première carte
   comprise. Pendant cette pause, la carte est visible mais l'enchère n'a pas
   commencé : on ne peut ni miser ni passer, son compte à rebours ne démarre pas, et
   c'est la seule fenêtre où le joueur désigné peut jouer son **joker** (section 7).

## 4. Règle de réserve

Un joueur ne peut jamais miser un montant qui l'empêcherait de compléter son deck :

> **Mise max autorisée = bankroll − (slots manquants − 1) × mise minimale**

(Le `− 1` correspond à la carte en cours, qui remplit un slot si elle est remportée.)

Exemple : bankroll 1 000, deck de 3 vide, mise min 10 → mise max sur la première
carte = 1 000 − 2 × 10 = **980**.

Conséquences :
- Personne ne peut se retrouver fauché avec un deck incomplet.
- Le bouton **Max** correspond à cette mise max autorisée, pas à la bankroll totale.
- Les boutons d'incréments sont désactivés s'ils dépasseraient le plafond.

## 5. Fin de partie et cas particuliers

- Un joueur dont le deck est complet **ne participe plus** aux enchères (il est sauté
  dans la rotation et ne peut plus miser). Il devient spectateur jusqu'à la fin.
- **Fin en solo** : quand il ne reste qu'un seul joueur avec un deck incomplet, plus
  personne ne peut le contrer. Ses cartes restantes s'enchaînent donc à la mise
  minimale, mais **jouées à l'écran** comme les autres — une par une, avec leur
  temporisation et leur adjudication — au lieu de sauter directement au classement.
  Il garde la main sur son joker jusqu'au bout.
- La partie elle-même est **temporaire** : tout est supprimé après la fin, sauf
  pour les joueurs connectés à un compte, dont l'historique (résumé, deck
  final avec le nom et la note de chaque carte achetée) est conservé
  **définitivement**. Si la partie s'est jouée sur un pack privé, ce détail
  reste réservé aux joueurs de la partie.

## 6. Score et départage

Classement par, dans l'ordre :

1. **Total des notes** des cartes du deck (le plus haut gagne).
2. **Argent restant** (le plus haut gagne). L'argent non dépensé ne vaut rien d'autre —
   thésauriser n'est jamais une stratégie gagnante en soi.
3. Si le total des notes **et** l'argent restant sont égaux : **égalité**, les joueurs
   concernés partagent la même place.

Le prix d'achat des cartes n'a **aucune incidence sur le score** : seule la note des
cartes compte. Le prix payé n'agit qu'indirectement, via la bankroll consommée pendant
la partie et l'argent restant au départage.

## 7. Le joker

- Chaque joueur dispose de **un joker par partie**.
- Seul le joueur désigné pour l'**ouverture forcée** peut le jouer, et seulement
  **pendant la temporisation** qui précède l'enchère. Passé ce délai, l'ouverture part
  et la carte est en jeu.
- Le joker **défausse la carte** : elle quitte la partie, personne ne l'achète, aucun
  argent ne bouge. Le tirage étant sans remise, elle ne réapparaît jamais.
- L'**obligation d'ouvrir avance normalement** : le voisin suivant ouvre la carte
  suivante.
- C'est ce qui donne un vrai intérêt au siège d'ouvreur : on peut écarter une carte
  dont on ne veut pas, ou priver un rival d'une carte qu'il convoite.
- Chaque siège montre publiquement s'il a encore son joker.

## 8. Les packs de cartes

- Le pack se choisit à la **création** de la partie, et peut être changé dans
  le **salon** tant que la partie n'a pas démarré.
- Un pack compte de **2 à 300 cartes**.
- Un joueur peut créer son propre pack et le garder **privé** ou le
  **publier**. Un pack privé n'est jouable que par son auteur, et seulement en
  tant qu'**hôte** — les autres joueurs de la partie en voient les cartes le
  temps de la partie, sans pouvoir l'héberger eux-mêmes. Si quelqu'un d'autre
  que l'auteur relance une **revanche** après une partie jouée sur ce pack,
  la revanche repart sur le pack par défaut.
- Éditer ou supprimer un pack n'interrompt **jamais** une partie en cours,
  mais empêche un salon de **démarrer** s'il pointe encore vers ce pack.

---

## Versions

### V0 — La boucle d'enchère qui marche

Périmètre volontairement minimal : valider le système de mise temps réel de bout en bout.

- **2 joueurs** exactement.
- **Deck de 3 cartes**, non configurable.
- **Un seul pack de cartes**, défini à l'avance (Football). Chaque carte : nom, image,
  note globale.
- **Pas de joker.** L'ouverture forcée alterne simplement entre les deux joueurs.
- Partie **privée uniquement**, rejointe par code d'invitation.
- Pas de compte : pseudo éphémère par session.
- Toutes les règles des sections 1 à 6 s'appliquent.

### V0.5 — Enchère accélérée

- **Bouton "Je passe"** : un joueur qui ne mène pas peut se retirer de l'enchère en cours.
- **Clôture immédiate** : dès qu'aucun joueur ne peut ou ne veut surenchérir, la carte est adjugée immédiatement, sans attendre le délai.
- **Délais configurables par partie** : le délai d'adjudication est paramétrable à la création.
- **Bot d'entraînement** : permet de jouer seul contre l'IA pour s'entraîner. Trois
  niveaux (facile, moyen, difficile), choisis par l'hôte à l'ajout de chaque bot et
  conservés dans l'historique des parties. Un bot ne voit que ce qu'un joueur humain
  voit à la table : les notes du pack, les cartes déjà passées en enchère, les prix
  déjà payés, les bankrolls et les decks de chacun. L'ordre du tirage à venir lui
  reste inconnu, exactement comme pour un humain.
- **Thème FUT** : interface et cartes à l'esthétique FIFA Ultimate Team.

### V1 — Le vrai jeu multijoueur

- **Joker** (section 7).
- **2 à 8 joueurs** par partie.
- **Taille de deck configurable** (3 à 5) dans les paramètres du lobby.
- **Plusieurs packs de base** : Football, Naruto… Le pack est choisi à la
  création de la partie, et modifiable dans le salon.
- Parties **publiques** avec matchmaking simple, en plus des parties privées.
- Paramètres de lobby exposés : bankroll, mise minimale, taille de deck, pack.

### V2 — Persistance et progression

- **Comptes utilisateur** (les parties restent jouables sans compte).
- **Historique des parties** et statistiques personnelles (victoires, défaites, taux de
  victoire).
- **Système d'amis** et suivi des duels entre amis.
- **Ranking** (ELO) avec classement.
- Seuls les comptes, statistiques et classements sont persistés — les parties restent
  temporaires et supprimées après leur fin.

### Idées pour plus tard (non planifié)

- Notes masquées aux ranks élevés (`show_ratings` par partie) : la connaissance des
  cartes devient un skill à part entière.
- Cartes multi-statistiques et modes de duel (statistique aléatoire, moyenne, catégorie).
