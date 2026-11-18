-- Vprono: table privileges (newer Supabase projects do not grant them automatically).
-- Row-level security in schema.sql still decides which rows each player can see or change.
grant usage on schema public to anon, authenticated, service_role;
grant all on public.players, public.groups, public.messages, public.days, public.meta to service_role;
grant select, insert, update on public.players to authenticated;
grant select, insert on public.groups to authenticated;
grant select, insert on public.messages to authenticated;
grant select on public.days, public.meta to anon, authenticated;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on function public.is_member(text) to authenticated;
