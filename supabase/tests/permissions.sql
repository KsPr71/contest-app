-- Integration checks run in one transaction; no fixtures survive rollback.
begin;

insert into auth.users (id) values
  ('cc000000-0000-4000-8000-000000000001'),
  ('cc000000-0000-4000-8000-000000000002');
insert into public.admins (user_id) values ('cc000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', 'cc000000-0000-4000-8000-000000000001', true);
update public.contest_settings set voting_starts_at = now() - interval '1 day', voting_ends_at = now() + interval '1 day' where id;
insert into public.photos (id, name, description, published_at, thumbnail_path, image_path,
  image_width, image_height, thumbnail_width, thumbnail_height) values
  ('cc000000-0000-4000-8000-000000000010', 'Published fixture', 'Test photo', now() - interval '1 day',
   'cc000000-0000-4000-8000-000000000010/thumb.webp', 'cc000000-0000-4000-8000-000000000010/full.webp', 100, 100, 100, 100),
  ('cc000000-0000-4000-8000-000000000011', 'Future fixture', 'Test photo', now() + interval '1 day',
   'cc000000-0000-4000-8000-000000000011/thumb.webp', 'cc000000-0000-4000-8000-000000000011/full.webp', 100, 100, 100, 100);

set local role anon;
do $$ begin
  if (select count(*) from public.photos where id::text like 'cc000000-%') <> 1 then
    raise exception 'Public visibility failed';
  end if;
  begin
    perform * from public.votes;
    raise exception 'Anonymous visitor could read votes';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'cc000000-0000-4000-8000-000000000002', true);
set local role authenticated;
insert into public.votes (photo_id, score) values ('cc000000-0000-4000-8000-000000000010', 3);
update public.votes set score = 5 where photo_id = 'cc000000-0000-4000-8000-000000000010';
do $$ begin
  if (select score from public.votes where photo_id = 'cc000000-0000-4000-8000-000000000010') <> 5 then
    raise exception 'Own vote update failed';
  end if;
  begin
    insert into public.votes (photo_id, score) values ('cc000000-0000-4000-8000-000000000010', 2);
    raise exception 'Duplicate vote accepted';
  exception when unique_violation then null;
  end;
  begin
    update public.votes set score = 6 where photo_id = 'cc000000-0000-4000-8000-000000000010';
    raise exception 'Score 6 accepted';
  exception when check_violation then null;
  end;
  begin
    update public.votes set score = 0 where photo_id = 'cc000000-0000-4000-8000-000000000010';
    raise exception 'Score 0 accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.votes (photo_id, score) values ('cc000000-0000-4000-8000-000000000011', 3);
    raise exception 'Future photo vote accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.photos (name, description, thumbnail_path, image_path, image_width, image_height, thumbnail_width, thumbnail_height)
    values ('Denied', 'Denied', 'invalid/thumb.webp', 'invalid/full.webp', 100, 100, 100, 100);
    raise exception 'Non-admin photo insert accepted';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.admins) then raise exception 'Non-admin could read admin membership'; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', 'cc000000-0000-4000-8000-000000000001', true);
set local role authenticated;
do $$ declare changed integer; begin
  if exists (select 1 from public.votes where photo_id = 'cc000000-0000-4000-8000-000000000010') then
    raise exception 'Another user could read votes';
  end if;
  update public.votes set score = 1 where photo_id = 'cc000000-0000-4000-8000-000000000010';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Another user could change votes'; end if;
  if (select count(*) from public.photos where id::text like 'cc000000-%') <> 2 then
    raise exception 'Admin cannot see future photos';
  end if;
end $$;
insert into public.photos (id, name, description, thumbnail_path, image_path, image_width, image_height, thumbnail_width, thumbnail_height)
values ('cc000000-0000-4000-8000-000000000012', 'Admin upload', 'Test',
  'cc000000-0000-4000-8000-000000000012/thumb.webp', 'cc000000-0000-4000-8000-000000000012/full.webp', 100, 100, 100, 100);
reset role;

rollback;
select 'PASS: public visibility, admin permissions, own votes, isolation, score constraints, future voting' as result;
