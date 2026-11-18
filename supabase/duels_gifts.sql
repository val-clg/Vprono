-- Vprono: 1v1 duels and gifts. Paste in Supabase > SQL Editor > New query, then Run. Safe to run again.

-- ---------- Duels ----------
-- Each player only ever writes their own column (a_moves or b_moves), so two players acting at once never overwrite each other.
create table if not exists public.duels (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('pen', 'quiz')),
  stake integer not null check (stake between 1 and 500),
  a uuid not null references auth.users (id) on delete cascade,      -- challenger
  b uuid references auth.users (id) on delete cascade,               -- opponent (null = open duel, anyone can accept)
  a_pseudo text not null default '',
  b_pseudo text not null default '',
  status text not null default 'pending' check (status in ('open', 'pending', 'active', 'done', 'declined', 'cancelled')),
  a_moves jsonb not null default '[]'::jsonb,
  b_moves jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists duels_a_idx on public.duels (a, updated_at desc);
create index if not exists duels_b_idx on public.duels (b, updated_at desc);
create index if not exists duels_open_idx on public.duels (status) where status = 'open';
alter table public.duels enable row level security;

drop policy if exists "see my duels and open ones" on public.duels;
create policy "see my duels and open ones" on public.duels for select to authenticated
  using (a = auth.uid() or b = auth.uid() or (status = 'open' and b is null));
drop policy if exists "challenge as yourself" on public.duels;
create policy "challenge as yourself" on public.duels for insert to authenticated
  with check (a = auth.uid() and (b is null or b <> auth.uid()));
drop policy if exists "play my duels or accept an open one" on public.duels;
create policy "play my duels or accept an open one" on public.duels for update to authenticated
  using (a = auth.uid() or b = auth.uid() or (status = 'open' and b is null and a <> auth.uid()))
  with check (a = auth.uid() or b = auth.uid());

grant select, insert, update on public.duels to authenticated;
grant all on public.duels to service_role;

-- ---------- Gifts (points offered by the creator) ----------
create table if not exists public.gifts (
  id bigint generated always as identity primary key,
  to_user uuid not null references auth.users (id) on delete cascade,
  amount integer not null check (amount between 1 and 100000),
  message text not null default '' check (char_length(message) <= 300),
  from_label text not null default 'le créateur de Vprono',
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index if not exists gifts_to_idx on public.gifts (to_user) where claimed_at is null;
alter table public.gifts enable row level security;
drop policy if exists "see my gifts" on public.gifts;
create policy "see my gifts" on public.gifts for select to authenticated using (to_user = auth.uid());
drop policy if exists "claim my gifts" on public.gifts;
create policy "claim my gifts" on public.gifts for update to authenticated
  using (to_user = auth.uid() and claimed_at is null) with check (to_user = auth.uid());
grant select, update (claimed_at) on public.gifts to authenticated;
grant all on public.gifts to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- ---------- Live updates ----------
do $$
declare t text;
begin
  foreach t in array array['duels', 'gifts'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
