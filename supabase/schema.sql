-- Vprono database. Paste this whole file in Supabase > SQL Editor > New query, then Run.
-- Safe to run again: every statement checks what already exists.

-- ---------- Players: one row per account ----------
create table if not exists public.players (
  id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,      -- balance, bets, stats, picks... (the app's player document)
  score integer not null default 0,             -- balance + stakes in play, used by the global ranking
  pseudo text not null default '',
  groups text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists players_score_idx on public.players (score desc);
create index if not exists players_groups_idx on public.players using gin (groups);

-- ---------- Friend groups ----------
create table if not exists public.groups (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  name text not null check (char_length(name) between 1 and 32),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- Group chat ----------
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  group_code text not null references public.groups (code) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 400),
  kind text,
  bet jsonb,
  ts timestamptz not null default now()
);
create index if not exists messages_group_ts_idx on public.messages (group_code, ts desc);

-- ---------- Match data (written only by the sync job with the secret key) ----------
create table if not exists public.days (
  date text primary key,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.meta (
  id text primary key,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- Row-level security ----------
alter table public.players enable row level security;
alter table public.groups enable row level security;
alter table public.messages enable row level security;
alter table public.days enable row level security;
alter table public.meta enable row level security;

drop policy if exists "players are public to members" on public.players;
create policy "players are public to members" on public.players for select to authenticated using (true);
drop policy if exists "create own player" on public.players;
create policy "create own player" on public.players for insert to authenticated with check (id = auth.uid());
drop policy if exists "update own player" on public.players;
create policy "update own player" on public.players for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "groups readable" on public.groups;
create policy "groups readable" on public.groups for select to authenticated using (true);
drop policy if exists "create group" on public.groups;
create policy "create group" on public.groups for insert to authenticated with check (created_by = auth.uid());

-- a message is visible to, and can be posted by, members of its group only
create or replace function public.is_member(g text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.players p where p.id = auth.uid() and g = any (p.groups));
$$;
drop policy if exists "members read chat" on public.messages;
create policy "members read chat" on public.messages for select to authenticated using (public.is_member(group_code));
drop policy if exists "members post chat" on public.messages;
create policy "members post chat" on public.messages for insert to authenticated with check (user_id = auth.uid() and public.is_member(group_code));

drop policy if exists "match days are public" on public.days;
create policy "match days are public" on public.days for select to anon, authenticated using (true);
drop policy if exists "meta is public" on public.meta;
create policy "meta is public" on public.meta for select to anon, authenticated using (true);

-- ---------- Table privileges (newer projects do not grant them automatically) ----------
grant usage on schema public to anon, authenticated, service_role;
grant all on public.players, public.groups, public.messages, public.days, public.meta to service_role;
grant select, insert, update on public.players to authenticated;
grant select, insert on public.groups to authenticated;
grant select, insert on public.messages to authenticated;
grant select on public.days, public.meta to anon, authenticated;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on function public.is_member(text) to authenticated;

-- ---------- Live updates ----------
do $$
declare t text;
begin
  foreach t in array array['players', 'messages', 'days', 'meta', 'groups'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- Global chat ----------
create table if not exists public.global_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  pseudo text not null default '' check (char_length(pseudo) <= 24),
  body text not null default '' check (char_length(body) <= 400),
  kind text,
  bet jsonb,
  ts timestamptz not null default now()
);
create index if not exists global_messages_ts_idx on public.global_messages (ts desc);
alter table public.global_messages enable row level security;
drop policy if exists "everyone reads global chat" on public.global_messages;
create policy "everyone reads global chat" on public.global_messages for select to authenticated using (true);
drop policy if exists "post as yourself" on public.global_messages;
create policy "post as yourself" on public.global_messages for insert to authenticated with check (user_id = auth.uid());
grant select, insert on public.global_messages to authenticated;
grant all on public.global_messages to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'global_messages') then
    alter publication supabase_realtime add table public.global_messages;
  end if;
end $$;
