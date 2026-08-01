-- Généré par `npm run cards:migration -- cards_football` depuis data/packs/*.json.
-- Additif : rien n'est jamais supprimé.

insert into packs (slug, sort_order) values
  ('football', 1)
on conflict (slug) do update set sort_order = excluded.sort_order;

insert into cards (id, name, position, rating, pack) overriding system value values
  (1, 'Kylian Mbappé', 'ATT', 91, 'football'),
  (2, 'Erling Haaland', 'ATT', 91, 'football'),
  (3, 'Jude Bellingham', 'MID', 90, 'football'),
  (4, 'Vinícius Júnior', 'ATT', 89, 'football'),
  (5, 'Rodri', 'MID', 89, 'football'),
  (6, 'Mohamed Salah', 'ATT', 89, 'football'),
  (7, 'Lamine Yamal', 'ATT', 89, 'football'),
  (8, 'Virgil van Dijk', 'DEF', 89, 'football'),
  (9, 'Thibaut Courtois', 'GK', 89, 'football'),
  (10, 'Lionel Messi', 'ATT', 88, 'football'),
  (11, 'Harry Kane', 'ATT', 88, 'football'),
  (12, 'Florian Wirtz', 'MID', 88, 'football'),
  (13, 'Jamal Musiala', 'MID', 88, 'football'),
  (14, 'Alisson Becker', 'GK', 88, 'football'),
  (15, 'Kevin De Bruyne', 'MID', 87, 'football'),
  (16, 'Bukayo Saka', 'ATT', 87, 'football'),
  (17, 'Pedri', 'MID', 87, 'football'),
  (18, 'Federico Valverde', 'MID', 87, 'football'),
  (19, 'Lautaro Martínez', 'ATT', 87, 'football'),
  (20, 'Gianluigi Donnarumma', 'GK', 87, 'football'),
  (21, 'Phil Foden', 'MID', 86, 'football'),
  (22, 'Robert Lewandowski', 'ATT', 86, 'football'),
  (23, 'Antonio Rüdiger', 'DEF', 86, 'football'),
  (24, 'Martin Ødegaard', 'MID', 86, 'football'),
  (25, 'Khvicha Kvaratskhelia', 'ATT', 86, 'football'),
  (26, 'Julián Álvarez', 'ATT', 86, 'football'),
  (27, 'Cole Palmer', 'MID', 86, 'football'),
  (28, 'Declan Rice', 'MID', 86, 'football'),
  (29, 'William Saliba', 'DEF', 86, 'football'),
  (30, 'Emiliano Martínez', 'GK', 86, 'football'),
  (31, 'Antoine Griezmann', 'ATT', 85, 'football'),
  (32, 'Achraf Hakimi', 'DEF', 85, 'football'),
  (33, 'Théo Hernandez', 'DEF', 85, 'football'),
  (34, 'Victor Osimhen', 'ATT', 85, 'football'),
  (35, 'Michael Olise', 'MID', 85, 'football'),
  (36, 'Gavi', 'MID', 84, 'football'),
  (37, 'Eduardo Camavinga', 'MID', 84, 'football'),
  (38, 'Aurélien Tchouaméni', 'MID', 84, 'football'),
  (39, 'Bradley Barcola', 'ATT', 84, 'football'),
  (40, 'Désiré Doué', 'MID', 83, 'football')
on conflict (id) do update set
  name = excluded.name,
  position = excluded.position,
  rating = excluded.rating,
  pack = excluded.pack;

select setval(pg_get_serial_sequence('cards', 'id'), (select max(id) from cards));
