begin;

drop policy photos_read_published on public.photos;
drop policy photos_admin_read on public.photos;

create policy photos_read_published on public.photos
  for select to anon using (published_at <= now());

create policy photos_authenticated_read on public.photos
  for select to authenticated using (
    published_at <= now()
    or (select exists (
      select 1 from public.admins where user_id = (select auth.uid())
    ))
  );

-- Existing platform event trigger: no client needs permission to invoke it.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

commit;
