-- Le cœur partagé entre les deux chemins d'écriture d'un pack : les migrations
-- générées depuis data/packs/*.json (packs officiels) et la RPC save_pack
-- (packs de joueurs). Un seul validateur, un seul mécanisme de remplacement —
-- donc les packs officiels exercent le validateur à chaque `db reset`.

-- Pas d'extension unaccent : elle n'est pas immutable, ce qui interdirait
-- l'usage dans une fonction immutable. Une table de translitération explicite
-- est plus prévisible et suffit largement.
create function slugify(p text) returns text
language sql immutable set search_path = public as $$
  select coalesce(nullif(btrim(left(regexp_replace(
    lower(translate(p,
      'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
      'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY')),
    '[^a-z0-9]+', '-', 'g'), 40), '-'), ''), 'pack');
$$;

-- Les bornes ci-dessous font autorité ; src/config.json les reflète pour le
-- formulaire, exactement comme game.limits reflète les check des parties.
-- Un champ inconnu est une ERREUR, pas une donnée ignorée : une faute de frappe
-- doit se voir.
create function validate_pack_payload(p jsonb) returns void
language plpgsql immutable set search_path = public as $$
declare
  cle   text;
  carte jsonb;
  nb    int;
  noms  text[] := '{}';
  nom   text;
begin
  if jsonb_typeof(p) <> 'object' then raise exception 'INVALID_PACK'; end if;

  for cle in select k from jsonb_object_keys(p) as k loop
    if cle not in ('name', 'emoji', 'description', 'positions', 'cards') then
      raise exception 'INVALID_PACK';
    end if;
  end loop;

  -- Présence des champs obligatoires, AVANT tout test de type. Sans cette
  -- garde, une clé absente donne un NULL SQL (et non un jsonb 'null') : les
  -- comparaisons qui suivent s'évaluent alors à NULL, que plpgsql traite comme
  -- faux, et le champ manquant passe sans lever.
  if not (p ?& array['name', 'positions', 'cards']) then
    raise exception 'INVALID_PACK';
  end if;

  if jsonb_typeof(p->'name') <> 'string'
     or char_length(btrim(p->>'name')) not between 1 and 40 then
    raise exception 'INVALID_PACK';
  end if;

  if p ? 'emoji' and (jsonb_typeof(p->'emoji') <> 'string'
                      or char_length(p->>'emoji') > 8) then
    raise exception 'INVALID_PACK';
  end if;

  if p ? 'description' and (jsonb_typeof(p->'description') <> 'string'
                            or char_length(p->>'description') > 200) then
    raise exception 'INVALID_PACK';
  end if;

  if jsonb_typeof(p->'positions') <> 'object' then raise exception 'INVALID_PACK'; end if;
  select count(*) into nb from jsonb_object_keys(p->'positions');
  if nb not between 1 and 12 then raise exception 'INVALID_PACK'; end if;
  for cle in select k from jsonb_object_keys(p->'positions') as k loop
    if char_length(cle) not between 1 and 6
       or jsonb_typeof(p->'positions'->cle) <> 'string'
       or char_length(btrim(p->'positions'->>cle)) not between 1 and 30 then
      raise exception 'INVALID_PACK';
    end if;
  end loop;

  if jsonb_typeof(p->'cards') <> 'array' then raise exception 'INVALID_PACK'; end if;
  nb := jsonb_array_length(p->'cards');
  if nb not between 2 and 300 then raise exception 'INVALID_PACK'; end if;

  for carte in select value from jsonb_array_elements(p->'cards') loop
    if jsonb_typeof(carte) <> 'object' then raise exception 'INVALID_PACK'; end if;
    for cle in select k from jsonb_object_keys(carte) as k loop
      if cle not in ('name', 'position', 'rating') then raise exception 'INVALID_PACK'; end if;
    end loop;

    if jsonb_typeof(carte->'name') <> 'string' then raise exception 'INVALID_PACK'; end if;
    nom := btrim(carte->>'name');
    if char_length(nom) not between 1 and 40 then raise exception 'INVALID_PACK'; end if;
    if nom = any (noms) then raise exception 'INVALID_PACK'; end if;
    noms := noms || nom;

    if jsonb_typeof(carte->'position') <> 'string'
       or not (p->'positions') ? (carte->>'position') then
      raise exception 'INVALID_PACK';
    end if;

    if jsonb_typeof(carte->'rating') <> 'number'
       or (carte->>'rating')::numeric <> trunc((carte->>'rating')::numeric)
       or (carte->>'rating')::int not between 1 and 99 then
      raise exception 'INVALID_PACK';
    end if;
  end loop;
end $$;

-- Remplacer le jeu de cartes d'un pack : on retire tout, puis on supprime ce
-- que plus aucune partie vivante ne référence, puis on insère le nouveau jeu.
-- Les lignes qu'on ne peut pas supprimer restent retirées : une partie en cours
-- garde ses cartes, le job de purge les effacera plus tard.
-- match_cards n'est PAS consulté : c'est un snapshot, il n'a plus besoin des
-- lignes de cards.
create function replace_pack_cards(p_slug text, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  update cards set retired = true where pack = p_slug and not retired;

  delete from cards c
  where c.pack = p_slug and c.retired
    and not exists (select 1 from game_cards   g  where g.card_id  = c.id)
    and not exists (select 1 from player_cards pc where pc.card_id = c.id)
    and not exists (select 1 from auctions     a  where a.card_id  = c.id);

  insert into cards (name, position, rating, pack)
  select btrim(e->>'name'), e->>'position', (e->>'rating')::int, p_slug
  from jsonb_array_elements(p->'cards') e;
end $$;

-- Chemin migration/seed. Idempotent : rejouable à chaque `db reset`.
create function install_official_pack(p jsonb, p_slug text, p_sort_order int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform validate_pack_payload(p);
  insert into packs (slug, sort_order, owner_id, name, description, emoji,
                     positions, visibility)
  values (p_slug, p_sort_order, null, btrim(p->>'name'),
          coalesce(p->>'description', ''), coalesce(p->>'emoji', ''),
          p->'positions', 'public')
  on conflict (slug) do update set
    sort_order  = excluded.sort_order,
    name        = excluded.name,
    description = excluded.description,
    emoji       = excluded.emoji,
    positions   = excluded.positions,
    owner_id    = null,
    visibility  = 'public',
    deleted_at  = null;
  perform replace_pack_cards(p_slug, p);
end $$;

-- Ces trois fonctions n'ont aucun appelant client : elles ne servent qu'aux
-- migrations et à save_pack. Sans ce verrou, PostgREST les exposerait en RPC —
-- et deux d'entre elles sont security definer et écrivent dans packs et cards
-- sans vérifier la moindre identité. Même convention que deck_count,
-- open_next_auction ou has_challenger.
revoke execute on function validate_pack_payload(jsonb) from public, anon, authenticated;
revoke execute on function replace_pack_cards(text, jsonb) from public, anon, authenticated;
revoke execute on function install_official_pack(jsonb, text, int) from public, anon, authenticated;
