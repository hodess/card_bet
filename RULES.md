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
| Délai d'adjudication | 3 s (configurable par partie) | Sans surenchère pendant ce délai, la carte est adjugée |
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
4. Chaque nouvelle mise **relance le compte à rebours** (délai d'adjudication, 3 s par
   défaut).
5. À tout moment, un joueur qui ne mène pas peut **passer** : il se retire
   définitivement de cette enchère.
6. La carte est **adjugée au dernier enchérisseur** — qui paie sa mise et ajoute la
   carte à son deck — dès que l'une de ces conditions est remplie :
   - le délai d'adjudication s'écoule sans surenchère ;
   - le plafond de 60 secondes est atteint ;
   - **plus aucun joueur ne peut ou ne veut surenchérir** (tous ont passé, ou leur
     réserve ne permet plus de suivre) : adjudication **immédiate**, sans attendre.
7. La carte suivante apparaît.

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
- **Auto-complétion** : quand il ne reste qu'un seul joueur avec un deck incomplet, ses
  slots restants sont remplis automatiquement avec les cartes suivantes à la mise
  minimale, et le classement s'affiche immédiatement.
- La partie et toutes ses données sont **temporaires** : tout est supprimé après la fin.

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

## 7. Le joker *(à partir de la V1)*

- Chaque joueur dispose de **un joker par partie**.
- Il permet de **refuser une ouverture forcée** : l'obligation passe alors au joueur
  suivant dans la rotation.
- Si tous les joueurs éligibles refusent (ou ne peuvent pas miser), la carte est
  **défaussée** et la carte suivante apparaît.

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
- **Bot d'entraînement** : permet de jouer seul contre l'IA pour s'entraîner.
- **Thème FUT** : interface et cartes à l'esthétique FIFA Ultimate Team.

### V1 — Le vrai jeu multijoueur

- **Joker** (section 7).
- **2 à 8 joueurs** par partie.
- **Taille de deck configurable** (3 à 5) dans les paramètres du lobby.
- **Plusieurs packs de base** : Football, Basket, Animés… Le pack est choisi à la
  création de la partie.
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
- Création et partage de packs par la communauté.
