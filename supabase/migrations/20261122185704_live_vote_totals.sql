begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table public.vote_totals (
  photo_id uuid primary key references public.photos(id) on delete cascade,
  vote_count bigint not null default 0 check (vote_count >= 0),
  score_sum bigint not null default 0 check (score_sum >= vote_count and score_sum <= vote_count * 5),
  version bigint not null default 1 check (version > 0)
);
alter table public.vote_totals enable row level security;
revoke all on public.vote_totals from public, anon, authenticated;
grant select on public.vote_totals to anon, authenticated;
grant all on public.vote_totals to service_role;
create policy vote_totals_published_read on public.vote_totals for select to anon, authenticated
  using (exists (select 1 from public.photos p where p.id = photo_id and p.published_at <= now()));

create table private.vote_totals_pending (
  photo_id uuid primary key references public.vote_totals(photo_id) on delete cascade,
  changed_at timestamptz not null default now()
);
alter table private.vote_totals_pending enable row level security;
grant all on private.vote_totals_pending to service_role;

-- Only this trigger may bypass client RLS to maintain aggregate values.
create function private.track_vote_totals() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target_id uuid; count_delta integer; sum_delta integer;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Authenticated vote required';
  end if;
  if TG_OP = 'UPDATE' and new.score = old.score then return null; end if;
  if TG_OP = 'INSERT' then
    target_id := new.photo_id; count_delta := 1; sum_delta := new.score;
  elsif TG_OP = 'UPDATE' then
    target_id := new.photo_id; count_delta := 0; sum_delta := new.score - old.score;
  else
    target_id := old.photo_id; count_delta := -1; sum_delta := -old.score;
  end if;
  -- Photo cascades need no aggregate: its foreign key will remove it.
  if not exists (select 1 from public.photos where id = target_id) then return null; end if;
  -- Seed a valid zero row before applying negative UPDATE/DELETE deltas.
  insert into public.vote_totals (photo_id) values (target_id) on conflict do nothing;
  update public.vote_totals set vote_count = vote_count + count_delta,
    score_sum = score_sum + sum_delta, version = version + 1 where photo_id = target_id;
  insert into private.vote_totals_pending (photo_id) values (target_id)
    on conflict (photo_id) do update set changed_at = excluded.changed_at;
  return null;
end $$;
revoke all on function private.track_vote_totals() from public, anon, authenticated, service_role;
create trigger votes_track_totals after insert or update or delete on public.votes
  for each row execute function private.track_vote_totals();

insert into public.vote_totals (photo_id, vote_count, score_sum)
select photo_id, count(*), sum(score) from public.votes group by photo_id;

-- A single transaction locks, broadcasts and removes only the claimed rows.
-- Concurrent votes wait and then enqueue a new version, never losing changes.
create function public.publish_vote_totals() returns integer
language plpgsql security invoker set search_path = '' as $$
declare item record; batch jsonb := '[]'::jsonb; published integer := 0;
begin
  for item in
    select q.photo_id from private.vote_totals_pending q
    order by q.photo_id for update skip locked limit 100
  loop
    batch := batch || coalesce((select jsonb_build_array(jsonb_build_object(
      'photo_id', t.photo_id, 'vote_count', t.vote_count,
      'score_sum', t.score_sum, 'version', t.version))
      from public.vote_totals t join public.photos p on p.id = t.photo_id
      where t.photo_id = item.photo_id and p.published_at <= now()), '[]'::jsonb);
    delete from private.vote_totals_pending where photo_id = item.photo_id;
    published := published + 1;
  end loop;
  if jsonb_array_length(coalesce(batch, '[]'::jsonb)) > 0 then
    perform realtime.send(batch, 'totals', 'contest:totals', true);
  end if;
  return published;
end $$;
revoke all on function public.publish_vote_totals() from public, anon, authenticated;
grant execute on function public.publish_vote_totals() to service_role;

-- Receive-only: clients cannot forge totals on the private channel.
create policy contest_totals_receive on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'contest:totals' and extension = 'broadcast');
commit;
