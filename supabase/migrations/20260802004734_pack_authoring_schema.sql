-- Un pack cesse d'être une simple étiquette : il porte son identité (nom,
-- emoji, description, vocabulaire de positions), son auteur et sa visibilité.
-- Les noms et descriptions des packs officiels quittent l'i18n au passage :
-- une fois qu'un joueur peut nommer son pack, un nom de pack est une donnée,
-- et on ne traduit pas les données.
alter table packs
  add column owner_id    uuid references profiles(id) on delete cascade,
  add column name        text not null default '',
  add column description text not null default '',
  add column emoji       text not null default '',
  add column positions   jsonb not null default '{}'::jsonb,
  add column visibility  text not null default 'public'
                         check (visibility in ('public', 'private')),
  add column created_at  timestamptz not null default now(),
  add column deleted_at  timestamptz;

-- Le défaut couvre les deux lignes existantes ET l'insert de supabase/seed.sql,
-- qui ne connaîtra le champ name qu'une fois les JSON convertis (tâche 5).
-- C'est cette tâche 5 qui retirera le défaut, une fois la donnée en place.
update packs set name = initcap(slug) where name = '';

-- sort_order ne concerne que les packs officiels ; les packs de joueurs sont
-- triés par date de création
alter table packs alter column sort_order drop not null;

-- Une carte n'est plus jamais supprimée à chaud : elle est retirée. Les lignes
-- retirées ne sont plus ni tirées ni comptées, mais elles survivent aux clés
-- étrangères de game_cards / player_cards / auctions, si bien qu'une partie en
-- cours continue avec les cartes qu'elle a déjà tirées même si l'auteur
-- réécrit son pack pendant ce temps.
alter table cards add column retired boolean not null default false;

-- appuis des policies et des comptages ajoutés plus loin
create index cards_pack_active on cards (pack) where not retired;
create index games_pack on games (pack);
create index packs_owner on packs (owner_id) where deleted_at is null;
