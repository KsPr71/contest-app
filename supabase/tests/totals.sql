begin;
insert into auth.users(id) values
  ('cc100000-0000-4000-8000-000000000001'), ('cc100000-0000-4000-8000-000000000002');
insert into public.admins(user_id) values ('cc100000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','cc100000-0000-4000-8000-000000000001',true);
update public.contest_settings set voting_starts_at = now() - interval '1 day', voting_ends_at = now() + interval '1 day' where id;
insert into public.photos(id,name,description,thumbnail_path,image_path,image_width,image_height,thumbnail_width,thumbnail_height)
values ('cc100000-0000-4000-8000-000000000010','Totals fixture','Integration check',
 'cc100000-0000-4000-8000-000000000010/thumb.webp','cc100000-0000-4000-8000-000000000010/full.webp',480,360,480,360);
select set_config('request.jwt.claim.sub','cc100000-0000-4000-8000-000000000001',true);
set local role authenticated;
insert into public.votes(photo_id,score) values ('cc100000-0000-4000-8000-000000000010',2);
update public.votes set score=5 where photo_id='cc100000-0000-4000-8000-000000000010';
reset role;
select set_config('request.jwt.claim.sub','cc100000-0000-4000-8000-000000000002',true);
set local role authenticated;
insert into public.votes(photo_id,score) values ('cc100000-0000-4000-8000-000000000010',3);
do $$ begin
  if not exists(select 1 from public.vote_totals where photo_id='cc100000-0000-4000-8000-000000000010' and vote_count=2 and score_sum=8) then
    raise exception 'Totals incorrect after insert and edit';
  end if;
  begin
    update public.vote_totals set score_sum=999 where photo_id='cc100000-0000-4000-8000-000000000010';
    raise exception 'Client could modify totals';
  exception when insufficient_privilege then null; end;
  begin
    perform public.publish_vote_totals();
    raise exception 'Client could invoke worker';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Auth user deletion cascades votes and must decrement both aggregates.
delete from auth.users where id='cc100000-0000-4000-8000-000000000002';
do $$ begin
  if not exists(select 1 from public.vote_totals where photo_id='cc100000-0000-4000-8000-000000000010' and vote_count=1 and score_sum=5) then
    raise exception 'Delete delta failed'; end if;
  if (select count(*) from private.vote_totals_pending where photo_id='cc100000-0000-4000-8000-000000000010')<>1 then
    raise exception 'Changes not coalesced'; end if;
end $$;
set local role service_role;
select public.publish_vote_totals();
reset role;
do $$ begin
  if exists(select 1 from private.vote_totals_pending where photo_id='cc100000-0000-4000-8000-000000000010') then
    raise exception 'Worker failed to clear queue'; end if;
end $$;
-- Everything, including the queued Broadcast, rolls back.
rollback;
select 'PASS: totals, changed votes, deletion, coalescing, client denial, publishing' as result;
