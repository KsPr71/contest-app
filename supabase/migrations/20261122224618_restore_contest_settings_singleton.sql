-- Restore only a missing singleton; preserve any existing voting dates.
begin;
insert into public.contest_settings (id) values (true) on conflict (id) do nothing;
commit;
