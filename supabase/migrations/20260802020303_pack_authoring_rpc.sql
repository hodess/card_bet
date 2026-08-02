-- Les quatre RPC de gestion d'un pack de joueur. Le client n'écrit jamais dans
-- packs ni dans cards : aucune policy d'écriture n'est ajoutée nulle part.

-- Le slug est définitif : renommer un pack ne change que packs.name. Sans ça,
-- les URL partagées, les parties en cours et cards.pack casseraient au premier
-- renommage.
create function save_pack(p_slug text, p_payload jsonb,
                          p_visibility text default 'private')
returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_username text;
  v_slug text;
  base text;
  n int := 1;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select username into v_username from profiles where id = uid;
  -- un compte anonyme n'a pas de pseudo stable : pas de namespace possible
  if v_username is null then raise exception 'NICKNAME_REQUIRED'; end if;
  -- p_visibility explicitement NULL : `NULL not in (...)` s'évalue à NULL, pas
  -- à vrai, et laisserait passer une contrainte de colonne brute plus loin.
  if coalesce(p_visibility, '') not in ('public', 'private') then
    raise exception 'INVALID_SETTINGS';
  end if;

  perform validate_pack_payload(p_payload);

  if p_slug is null then
    -- Sérialise les save_pack d'un même compte : le quota comme la génération
    -- du slug lisent puis écrivent, et un double-clic suffit à faire passer
    -- deux appels par la même lecture. Verrou de transaction : relâché au commit.
    perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

    -- borne reflétée dans config.json (packs.maxPerUser)
    if (select count(*) from packs where owner_id = uid and deleted_at is null) >= 20 then
      raise exception 'TOO_MANY_PACKS';
    end if;
    base := slugify(v_username) || '~' || slugify(p_payload->>'name');
    v_slug := base;
    while exists (select 1 from packs where slug = v_slug) loop
      n := n + 1;
      v_slug := base || '-' || n;
    end loop;
    loop
      begin
        insert into packs (slug, owner_id, name, description, emoji, positions, visibility)
        values (v_slug, uid, btrim(p_payload->>'name'),
                coalesce(p_payload->>'description', ''), coalesce(p_payload->>'emoji', ''),
                p_payload->'positions', p_visibility);
        exit;
      exception when unique_violation then
        -- deux pseudos différents peuvent produire le même préfixe de slug
        -- (profiles n'impose l'unicité que sur lower(username), or slugify
        -- déplie aussi les accents) : le while ci-dessus ne les voit pas venir.
        n := n + 1;
        v_slug := base || '-' || n;
      end;
    end loop;
  else
    v_slug := p_slug;
    if not exists (select 1 from packs
                   where slug = v_slug and owner_id = uid and deleted_at is null) then
      raise exception 'NOT_PACK_OWNER';
    end if;
    update packs set
      name        = btrim(p_payload->>'name'),
      description = coalesce(p_payload->>'description', ''),
      emoji       = coalesce(p_payload->>'emoji', ''),
      positions   = p_payload->'positions',
      visibility  = p_visibility
    where slug = v_slug;
  end if;

  perform replace_pack_cards(v_slug, p_payload);
  return json_build_object('slug', v_slug);
end $$;

create function set_pack_visibility(p_slug text, p_visibility text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if coalesce(p_visibility, '') not in ('public', 'private') then
    raise exception 'INVALID_SETTINGS';
  end if;
  update packs set visibility = p_visibility
  where slug = p_slug and owner_id = uid and deleted_at is null;
  if not found then raise exception 'NOT_PACK_OWNER'; end if;
end $$;

-- Suppression LOGIQUE : games.pack et cards.pack référencent packs.slug, un
-- delete buterait sur les parties des dernières 24 h. Le job de purge efface la
-- ligne pour de bon quand plus rien ne la référence.
create function delete_pack(p_slug text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update packs set deleted_at = now()
  where slug = p_slug and owner_id = uid and deleted_at is null;
  if not found then raise exception 'NOT_PACK_OWNER'; end if;
end $$;

-- La vitrine : officiels + publics + les miens, jamais le privé d'un autre.
-- Les compteurs ignorent les cartes retirées.
create or replace function list_packs() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select p.slug, p.name, p.emoji, p.description, p.positions,
           pr.username as owner_username,
           p.visibility,
           coalesce(p.owner_id is not null and p.owner_id = auth.uid(), false) as is_mine,
           (select count(*)::int from cards c where c.pack = p.slug and not c.retired) as card_count,
           (select min(c.rating)::int from cards c where c.pack = p.slug and not c.retired) as min_rating,
           (select max(c.rating)::int from cards c where c.pack = p.slug and not c.retired) as max_rating
    from packs p
    left join profiles pr on pr.id = p.owner_id
    where p.deleted_at is null
      and (p.owner_id is null or p.visibility = 'public' or p.owner_id = auth.uid())
    order by (p.owner_id is not null), p.sort_order nulls last, p.created_at desc
  ) t;
$$;
