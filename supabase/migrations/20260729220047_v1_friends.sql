create table friendships (
  requester uuid not null references profiles(id) on delete cascade,
  addressee uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
-- une seule relation par paire, quel que soit le sens
create unique index friendships_pair
  on friendships (least(requester, addressee), greatest(requester, addressee));
create index friendships_addressee on friendships (addressee, status);

alter table friendships enable row level security;
create policy friendships_read on friendships for select to authenticated
  using (requester = auth.uid() or addressee = auth.uid());
grant select on friendships to authenticated;

-- résout un pseudo en id de profil, ou PLAYER_NOT_FOUND
create function profile_id_of(p_username text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare pid uuid;
begin
  select id into pid from profiles where lower(username) = lower(p_username);
  if pid is null then raise exception 'PLAYER_NOT_FOUND'; end if;
  return pid;
end $$;

create function send_friend_request(p_username text) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  target_id uuid;
  existing friendships%rowtype;
begin
  if not exists (select 1 from profiles where id = uid) then
    raise exception 'PROFILE_REQUIRED';
  end if;
  target_id := profile_id_of(p_username);
  if target_id = uid then raise exception 'SELF_FRIENDSHIP'; end if;
  select * into existing from friendships
  where (requester = uid and addressee = target_id)
     or (requester = target_id and addressee = uid)
  for update;
  if found then
    if existing.status = 'accepted' then raise exception 'ALREADY_FRIENDS'; end if;
    if existing.requester = uid then return; end if;  -- déjà envoyée : no-op
    -- demande croisée : les deux se veulent amis, on accepte
    update friendships set status = 'accepted'
    where requester = existing.requester and addressee = existing.addressee;
    return;
  end if;
  begin
    insert into friendships (requester, addressee) values (uid, target_id);
  exception when unique_violation then
    -- course entre deux premières demandes simultanées : on retombe sur la ligne gagnante
    select * into existing from friendships
    where (requester = uid and addressee = target_id)
       or (requester = target_id and addressee = uid);
    if existing.status = 'accepted' then raise exception 'ALREADY_FRIENDS'; end if;
    if existing.requester <> uid then
      update friendships set status = 'accepted'
      where requester = existing.requester and addressee = existing.addressee;
    end if;
  end;
end $$;

create function accept_friend_request(p_username text) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  target_id uuid := profile_id_of(p_username);
begin
  update friendships set status = 'accepted'
  where requester = target_id and addressee = uid and status = 'pending';
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
end $$;

-- refus, annulation ou suppression d'amitié : même geste, idempotent
create function remove_friendship(p_username text) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  target_id uuid := profile_id_of(p_username);
begin
  delete from friendships
  where (requester = uid and addressee = target_id)
     or (requester = target_id and addressee = uid);
end $$;
