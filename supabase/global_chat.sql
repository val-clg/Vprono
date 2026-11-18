-- Vprono: global chat with every player. Paste in Supabase > SQL Editor > New query, then Run. Safe to run again.
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
