-- Vprono: Supporter purchase requests (cosmetic only) and gifts that carry items. Safe to run again.
create table if not exists public.purchase_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  pseudo text not null default '',
  item text not null check (item in ('pass_supporter', 'pack_neon')),
  price text not null,
  code text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'granted', 'refused')),
  created_at timestamptz not null default now()
);
alter table public.purchase_requests enable row level security;
drop policy if exists "create my requests" on public.purchase_requests;
create policy "create my requests" on public.purchase_requests for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "see my requests" on public.purchase_requests;
create policy "see my requests" on public.purchase_requests for select to authenticated using (user_id = auth.uid());
grant select, insert on public.purchase_requests to authenticated;
grant all on public.purchase_requests to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

alter table public.gifts add column if not exists items jsonb;
alter table public.gifts drop constraint if exists gifts_amount_check;
alter table public.gifts add constraint gifts_amount_check check (amount between 0 and 100000);
