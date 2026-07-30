create function get_profile_stats(p_username text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  target_id uuid := profile_id_of(p_username);
  caller_id uuid := auth.uid();
  stats json;
  h2h json := null;
begin
  -- seuls comptent les matchs entre deux profils (règle anti-farm : un bot EST un anonyme)
  select json_build_object(
    'games', count(*),
    'wins', count(*) filter (where mp.result = 'win'),
    'losses', count(*) filter (where mp.result = 'loss'),
    'draws', count(*) filter (where mp.result = 'draw'))
  into stats
  from match_players mp
  where mp.profile_id = target_id
    and exists (
      select 1 from match_players o
      where o.match_id = mp.match_id and o.seat <> mp.seat and o.profile_id is not null
    );

  if caller_id is not null and caller_id <> target_id
     and exists (select 1 from profiles where id = caller_id) then
    select json_build_object(
      'games', count(*),
      'wins', count(*) filter (where mine.result = 'win'),
      'losses', count(*) filter (where mine.result = 'loss'),
      'draws', count(*) filter (where mine.result = 'draw'))
    into h2h
    from match_players mine
    join match_players theirs
      on theirs.match_id = mine.match_id and theirs.seat <> mine.seat
    where mine.profile_id = caller_id and theirs.profile_id = target_id;
  end if;

  return json_build_object('stats', stats, 'head_to_head', h2h);
end $$;
