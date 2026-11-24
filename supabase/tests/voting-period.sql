-- All users, votes, configuration and broadcasts roll back together.
begin;
insert into auth.users(id) values ('cc200000-0000-4000-8000-000000000001'),('cc200000-0000-4000-8000-000000000002');
insert into public.admins(user_id) values ('cc200000-0000-4000-8000-000000000001');
insert into public.photos(id,name,description,thumbnail_path,image_path,image_width,image_height,thumbnail_width,thumbnail_height)
values ('cc200000-0000-4000-8000-000000000010','Period fixture','Test',
'cc200000-0000-4000-8000-000000000010/thumb.webp','cc200000-0000-4000-8000-000000000010/full.webp',100,100,100,100);
select set_config('request.jwt.claim.sub','cc200000-0000-4000-8000-000000000001',true);
set local role authenticated;
update public.contest_settings set voting_starts_at=now()+interval '1 day', voting_ends_at=now()+interval '2 days' where id;
reset role;
select set_config('request.jwt.claim.sub','cc200000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ declare changed integer; begin
 begin
  insert into public.votes(photo_id,score) values ('cc200000-0000-4000-8000-000000000010',3);
  raise exception 'Vote before opening accepted';
 exception when insufficient_privilege then null; end;
 update public.contest_settings set voting_ends_at=now()+interval '3 days' where id;
 get diagnostics changed = row_count;
 if changed <> 0 then raise exception 'Non-admin changed schedule'; end if;
 update public.photos set name='Unauthorized' where id='cc200000-0000-4000-8000-000000000010';
 get diagnostics changed = row_count;
 if changed <> 0 then raise exception 'Non-admin edited photo'; end if;
 delete from public.photos where id='cc200000-0000-4000-8000-000000000010';
 get diagnostics changed = row_count;
 if changed <> 0 then raise exception 'Non-admin deleted photo'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','cc200000-0000-4000-8000-000000000001',true);
set local role authenticated;
update public.contest_settings set voting_starts_at=now()-interval '1 day', voting_ends_at=now()+interval '1 day' where id;
do $$ begin
 begin
 update public.contest_settings set voting_ends_at=voting_starts_at where id;
 raise exception 'Invalid period accepted';
 exception when check_violation then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','cc200000-0000-4000-8000-000000000002',true);
set local role authenticated;
insert into public.votes(photo_id,score) values ('cc200000-0000-4000-8000-000000000010',3);
update public.votes set score=5 where photo_id='cc200000-0000-4000-8000-000000000010';
do $$ begin
 if not exists(select 1 from public.votes where photo_id='cc200000-0000-4000-8000-000000000010' and score=5) then raise exception 'Open voting failed'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','cc200000-0000-4000-8000-000000000001',true);
set local role authenticated;
update public.contest_settings set voting_starts_at=now()-interval '2 days', voting_ends_at=now()-interval '1 day' where id;
update public.photos set name='Edited by admin' where id='cc200000-0000-4000-8000-000000000010';
reset role;
select set_config('request.jwt.claim.sub','cc200000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ declare changed integer; begin
 update public.votes set score=1 where photo_id='cc200000-0000-4000-8000-000000000010';
 get diagnostics changed = row_count;
 if changed <> 0 then raise exception 'Vote edited after closing'; end if;
 begin
 insert into public.votes(photo_id,score) values ('cc200000-0000-4000-8000-000000000010',4);
 raise exception 'Vote after closing accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
