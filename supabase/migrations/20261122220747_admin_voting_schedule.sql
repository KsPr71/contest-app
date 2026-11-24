begin;
create table public.contest_settings (
  id boolean primary key default true check (id),
  voting_starts_at timestamptz,
  voting_ends_at timestamptz,
  check ((voting_starts_at is null and voting_ends_at is null) or
    (voting_starts_at is not null and voting_ends_at is not null and voting_ends_at > voting_starts_at))
);
insert into public.contest_settings(id) values (true);
alter table public.contest_settings enable row level security;
revoke all on public.contest_settings from public, anon, authenticated;
grant select on public.contest_settings to anon, authenticated;
grant update(voting_starts_at, voting_ends_at) on public.contest_settings to authenticated;
create policy settings_read on public.contest_settings for select to anon, authenticated using (true);
create policy settings_admin_update on public.contest_settings for update to authenticated
using (exists(select 1 from public.admins where user_id = (select auth.uid())))
with check (exists(select 1 from public.admins where user_id = (select auth.uid())));

create function public.get_voting_period() returns jsonb language sql stable security invoker
set search_path = '' as $$
 select jsonb_build_object('voting_starts_at', voting_starts_at, 'voting_ends_at', voting_ends_at,
 'server_now', statement_timestamp()) from public.contest_settings where id = true;
$$;
revoke all on function public.get_voting_period() from public;
grant execute on function public.get_voting_period() to anon, authenticated;

-- Restrictive policies compose with the existing ownership/published-photo policies.
create policy votes_period_insert on public.votes as restrictive for insert to authenticated
with check (exists(select 1 from public.contest_settings where id = true
 and voting_starts_at <= statement_timestamp() and statement_timestamp() < voting_ends_at));
create policy votes_period_update on public.votes as restrictive for update to authenticated
using (exists(select 1 from public.contest_settings where id = true
 and voting_starts_at <= statement_timestamp() and statement_timestamp() < voting_ends_at))
with check (exists(select 1 from public.contest_settings where id = true
 and voting_starts_at <= statement_timestamp() and statement_timestamp() < voting_ends_at));

grant update(name,description,published_at), delete on public.photos to authenticated;
create policy photos_admin_update on public.photos for update to authenticated
using (exists(select 1 from public.admins where user_id = (select auth.uid())))
with check (exists(select 1 from public.admins where user_id = (select auth.uid())));
create policy photos_admin_delete on public.photos for delete to authenticated
using (exists(select 1 from public.admins where user_id = (select auth.uid())));

create function private.broadcast_voting_period() returns trigger language plpgsql security definer
set search_path = '' as $$
begin
 if not exists(select 1 from public.admins where user_id = auth.uid()) then
   raise exception 'Administrator required' using errcode = '42501';
 end if;
 perform realtime.send(jsonb_build_object('changed',true), 'schedule', 'contest:totals', true);
 return new;
end;
$$;
revoke all on function private.broadcast_voting_period() from public, anon, authenticated;
create trigger contest_settings_broadcast after update on public.contest_settings
for each row when (old.* is distinct from new.*) execute function private.broadcast_voting_period();
commit;
