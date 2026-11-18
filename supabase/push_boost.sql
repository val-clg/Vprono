-- Vprono: push notifications and the evening boosted odd. Paste in Supabase > SQL Editor > New query, then Run. Safe to run again.

-- Devices that accepted notifications
create table if not exists public.push_subs (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists "manage my devices" on public.push_subs;
create policy "manage my devices" on public.push_subs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.push_subs to authenticated;
grant all on public.push_subs to service_role;

-- Evening boosted odd (written by the sync job, read by everyone)
create table if not exists public.boosts (
  date text primary key,
  doc jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.boosts enable row level security;
drop policy if exists "boosts are public" on public.boosts;
create policy "boosts are public" on public.boosts for select to anon, authenticated using (true);
grant select on public.boosts to anon, authenticated;
grant all on public.boosts to service_role;

-- Server-side secrets (notification signing key). No policy: only the secret key can read it.
create table if not exists public.app_secrets (
  key text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
grant all on public.app_secrets to service_role;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'boosts') then
    alter publication supabase_realtime add table public.boosts;
  end if;
end $$;
