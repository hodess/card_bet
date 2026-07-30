create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now()
);
create unique index profiles_username_lower on profiles (lower(username));

alter table profiles enable row level security;
create policy profiles_read on profiles for select to authenticated using (true);
grant select on profiles to authenticated;

create function claim_username(p_username text) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  -- l'état en base fait foi : le JWT peut rester « anonyme » jusqu'à 1 h après l'upgrade
  -- (updateUser ne fait pas tourner le token)
  if coalesce((select is_anonymous from auth.users where id = uid), true) then
    raise exception 'ANONYMOUS_NOT_ALLOWED';
  end if;
  if p_username !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'INVALID_USERNAME';
  end if;
  if exists (select 1 from profiles where id = uid) then
    raise exception 'ALREADY_HAS_PROFILE';
  end if;
  begin
    insert into profiles (id, username) values (uid, p_username);
  exception when unique_violation then
    raise exception 'USERNAME_TAKEN';
  end;
end $$;
