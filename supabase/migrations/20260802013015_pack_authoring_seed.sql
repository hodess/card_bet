-- Généré par `npm run cards:migration -- pack_authoring_seed` depuis data/packs/*.json.
-- install_official_pack remplace le jeu de cartes du pack : les anciennes
-- cartes sont retirées, et supprimées si plus aucune partie ne les référence.

select install_official_pack($json$
{
  "name": "Football",
  "emoji": "⚽",
  "description": "Les stars du ballon rond.",
  "positions": {
    "GK": "Gardien",
    "DEF": "Défenseur",
    "MID": "Milieu",
    "ATT": "Attaquant"
  },
  "cards": [
    {
      "name": "Kylian Mbappé",
      "position": "ATT",
      "rating": 91
    },
    {
      "name": "Erling Haaland",
      "position": "ATT",
      "rating": 91
    },
    {
      "name": "Jude Bellingham",
      "position": "MID",
      "rating": 90
    },
    {
      "name": "Vinícius Júnior",
      "position": "ATT",
      "rating": 89
    },
    {
      "name": "Rodri",
      "position": "MID",
      "rating": 89
    },
    {
      "name": "Mohamed Salah",
      "position": "ATT",
      "rating": 89
    },
    {
      "name": "Lamine Yamal",
      "position": "ATT",
      "rating": 89
    },
    {
      "name": "Virgil van Dijk",
      "position": "DEF",
      "rating": 89
    },
    {
      "name": "Thibaut Courtois",
      "position": "GK",
      "rating": 89
    },
    {
      "name": "Lionel Messi",
      "position": "ATT",
      "rating": 88
    },
    {
      "name": "Harry Kane",
      "position": "ATT",
      "rating": 88
    },
    {
      "name": "Florian Wirtz",
      "position": "MID",
      "rating": 88
    },
    {
      "name": "Jamal Musiala",
      "position": "MID",
      "rating": 88
    },
    {
      "name": "Alisson Becker",
      "position": "GK",
      "rating": 88
    },
    {
      "name": "Kevin De Bruyne",
      "position": "MID",
      "rating": 87
    },
    {
      "name": "Bukayo Saka",
      "position": "ATT",
      "rating": 87
    },
    {
      "name": "Pedri",
      "position": "MID",
      "rating": 87
    },
    {
      "name": "Federico Valverde",
      "position": "MID",
      "rating": 87
    },
    {
      "name": "Lautaro Martínez",
      "position": "ATT",
      "rating": 87
    },
    {
      "name": "Gianluigi Donnarumma",
      "position": "GK",
      "rating": 87
    },
    {
      "name": "Phil Foden",
      "position": "MID",
      "rating": 86
    },
    {
      "name": "Robert Lewandowski",
      "position": "ATT",
      "rating": 86
    },
    {
      "name": "Antonio Rüdiger",
      "position": "DEF",
      "rating": 86
    },
    {
      "name": "Martin Ødegaard",
      "position": "MID",
      "rating": 86
    },
    {
      "name": "Khvicha Kvaratskhelia",
      "position": "ATT",
      "rating": 86
    },
    {
      "name": "Julián Álvarez",
      "position": "ATT",
      "rating": 86
    },
    {
      "name": "Cole Palmer",
      "position": "MID",
      "rating": 86
    },
    {
      "name": "Declan Rice",
      "position": "MID",
      "rating": 86
    },
    {
      "name": "William Saliba",
      "position": "DEF",
      "rating": 86
    },
    {
      "name": "Emiliano Martínez",
      "position": "GK",
      "rating": 86
    },
    {
      "name": "Antoine Griezmann",
      "position": "ATT",
      "rating": 85
    },
    {
      "name": "Achraf Hakimi",
      "position": "DEF",
      "rating": 85
    },
    {
      "name": "Théo Hernandez",
      "position": "DEF",
      "rating": 85
    },
    {
      "name": "Victor Osimhen",
      "position": "ATT",
      "rating": 85
    },
    {
      "name": "Michael Olise",
      "position": "MID",
      "rating": 85
    },
    {
      "name": "Gavi",
      "position": "MID",
      "rating": 84
    },
    {
      "name": "Eduardo Camavinga",
      "position": "MID",
      "rating": 84
    },
    {
      "name": "Aurélien Tchouaméni",
      "position": "MID",
      "rating": 84
    },
    {
      "name": "Bradley Barcola",
      "position": "ATT",
      "rating": 84
    },
    {
      "name": "Désiré Doué",
      "position": "MID",
      "rating": 83
    }
  ]
}
$json$::jsonb, 'football', 1);

select install_official_pack($json$
{
  "name": "Naruto",
  "emoji": "🌀",
  "description": "Ninjas de Konoha et d’ailleurs.",
  "positions": {
    "NIN": "Ninjutsu",
    "GEN": "Genjutsu",
    "TAI": "Taijutsu",
    "MED": "Médical",
    "INV": "Invocation"
  },
  "cards": [
    {
      "name": "Naruto Uzumaki",
      "position": "NIN",
      "rating": 91
    },
    {
      "name": "Madara Uchiha",
      "position": "NIN",
      "rating": 91
    },
    {
      "name": "Sasuke Uchiha",
      "position": "NIN",
      "rating": 90
    },
    {
      "name": "Hashirama Senju",
      "position": "NIN",
      "rating": 90
    },
    {
      "name": "Itachi Uchiha",
      "position": "GEN",
      "rating": 89
    },
    {
      "name": "Minato Namikaze",
      "position": "NIN",
      "rating": 89
    },
    {
      "name": "Tsunade",
      "position": "MED",
      "rating": 89
    },
    {
      "name": "Kakashi Hatake",
      "position": "NIN",
      "rating": 88
    },
    {
      "name": "Might Guy",
      "position": "TAI",
      "rating": 88
    },
    {
      "name": "Obito Uchiha",
      "position": "NIN",
      "rating": 88
    },
    {
      "name": "Jiraiya",
      "position": "INV",
      "rating": 88
    },
    {
      "name": "Gaara",
      "position": "NIN",
      "rating": 87
    },
    {
      "name": "Orochimaru",
      "position": "INV",
      "rating": 87
    },
    {
      "name": "Killer Bee",
      "position": "NIN",
      "rating": 87
    },
    {
      "name": "Tobirama Senju",
      "position": "NIN",
      "rating": 87
    },
    {
      "name": "Rock Lee",
      "position": "TAI",
      "rating": 86
    },
    {
      "name": "Neji Hyuga",
      "position": "TAI",
      "rating": 86
    },
    {
      "name": "Shikamaru Nara",
      "position": "NIN",
      "rating": 86
    },
    {
      "name": "Hiruzen Sarutobi",
      "position": "NIN",
      "rating": 86
    },
    {
      "name": "Sakura Haruno",
      "position": "MED",
      "rating": 86
    },
    {
      "name": "Hinata Hyuga",
      "position": "TAI",
      "rating": 85
    },
    {
      "name": "Kisame Hoshigaki",
      "position": "NIN",
      "rating": 85
    },
    {
      "name": "Nagato",
      "position": "NIN",
      "rating": 85
    },
    {
      "name": "Konan",
      "position": "NIN",
      "rating": 85
    },
    {
      "name": "Deidara",
      "position": "NIN",
      "rating": 85
    },
    {
      "name": "Sasori",
      "position": "INV",
      "rating": 84
    },
    {
      "name": "Kurenai Yuhi",
      "position": "GEN",
      "rating": 84
    },
    {
      "name": "Asuma Sarutobi",
      "position": "TAI",
      "rating": 84
    },
    {
      "name": "Kabuto Yakushi",
      "position": "MED",
      "rating": 84
    },
    {
      "name": "Temari",
      "position": "NIN",
      "rating": 84
    },
    {
      "name": "Kankuro",
      "position": "INV",
      "rating": 83
    },
    {
      "name": "Ino Yamanaka",
      "position": "GEN",
      "rating": 83
    },
    {
      "name": "Choji Akimichi",
      "position": "TAI",
      "rating": 83
    },
    {
      "name": "Kiba Inuzuka",
      "position": "INV",
      "rating": 83
    },
    {
      "name": "Shino Aburame",
      "position": "INV",
      "rating": 83
    },
    {
      "name": "Tenten",
      "position": "NIN",
      "rating": 82
    },
    {
      "name": "Anko Mitarashi",
      "position": "GEN",
      "rating": 82
    },
    {
      "name": "Yamato",
      "position": "NIN",
      "rating": 82
    },
    {
      "name": "Sai",
      "position": "NIN",
      "rating": 82
    },
    {
      "name": "Chiyo",
      "position": "MED",
      "rating": 82
    }
  ]
}
$json$::jsonb, 'naruto', 2);

-- Le défaut '' n'existait que le temps que les packs officiels acquièrent leur
-- nom. Il part maintenant : plus aucune insertion ne peut créer un pack anonyme.
alter table packs alter column name drop default;
