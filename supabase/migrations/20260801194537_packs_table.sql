-- Table des packs de cartes. Les lignes sont ensuite écrites par les migrations
-- générées depuis data/packs/*.json (npm run cards:migration) ; on n'insère ici
-- que 'football' pour amorcer, parce que la colonne cards.pack qui suit prend ce
-- slug par défaut et que la clé étrangère exige que la ligne existe déjà.
create table packs (
  slug       text primary key,
  sort_order int not null
);

insert into packs (slug, sort_order) values ('football', 1);

alter table cards add column pack text not null default 'football'
  references packs(slug);

-- Le jeu ne change pas encore : start_game verse toujours toutes les cartes.
-- La sélection de pack en partie fait l'objet du chantier suivant.

alter table packs enable row level security;
create policy packs_read on packs for select to authenticated using (true);
grant select on packs to authenticated;
