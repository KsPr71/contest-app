-- Broadcast payloads use an object envelope for Realtime compatibility.
create or replace function public.publish_vote_totals() returns integer
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
    perform realtime.send(jsonb_build_object('totals', batch), 'totals', 'contest:totals', true);
  end if;
  return published;
end $$;
