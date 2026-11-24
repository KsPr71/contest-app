-- Initial contest schema. No administrator is granted automatically.
begin;

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  description text not null check (char_length(btrim(description)) between 1 and 350),
  published_at timestamptz not null default now(),
  thumbnail_path text not null unique,
  image_path text not null unique,
  image_width integer not null check (image_width > 0),
  image_height integer not null check (image_height > 0),
  thumbnail_width integer not null check (thumbnail_width > 0),
  thumbnail_height integer not null check (thumbnail_height > 0),
  check (thumbnail_path in (id::text || '/thumb.webp', id::text || '/thumb.avif')),
  check (image_path in (id::text || '/full.webp', id::text || '/full.avif'))
);

create index photos_gallery_idx on public.photos (published_at desc, id desc);

create table public.votes (
  photo_id uuid not null references public.photos(id) on delete cascade,
  voter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  primary key (photo_id, voter_id)
);

-- Supports per-user vote reads and the auth.users foreign key.
create index votes_voter_idx on public.votes (voter_id, photo_id);

alter table public.admins enable row level security;
alter table public.photos enable row level security;
alter table public.votes enable row level security;

revoke all on public.admins, public.photos, public.votes from public, anon, authenticated;
grant select on public.admins to authenticated;
grant select on public.photos to anon, authenticated;
grant insert on public.photos to authenticated;
grant select on public.votes to authenticated;
grant insert (photo_id, score), update (score) on public.votes to authenticated;

create policy admins_read_self on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

create policy photos_read_published on public.photos
  for select to anon, authenticated using (published_at <= now());

create policy photos_admin_read on public.photos
  for select to authenticated using (
    exists (select 1 from public.admins where user_id = (select auth.uid()))
  );

create policy photos_admin_insert on public.photos
  for insert to authenticated with check (
    exists (select 1 from public.admins where user_id = (select auth.uid()))
  );

create policy votes_read_own on public.votes
  for select to authenticated using (voter_id = (select auth.uid()));

create policy votes_insert_own on public.votes
  for insert to authenticated with check (
    voter_id = (select auth.uid())
    and exists (
      select 1 from public.photos
      where id = votes.photo_id and published_at <= now()
    )
  );

create policy votes_update_own on public.votes
  for update to authenticated
  using (voter_id = (select auth.uid()))
  with check (
    voter_id = (select auth.uid())
    and exists (
      select 1 from public.photos
      where id = votes.photo_id and published_at <= now()
    )
  );

create policy concurso_objects_admin_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'concurso-fotos'
    and exists (select 1 from public.admins where user_id = (select auth.uid()))
  );

create policy concurso_objects_admin_select on storage.objects
  for select to authenticated using (
    bucket_id = 'concurso-fotos'
    and exists (select 1 from public.admins where user_id = (select auth.uid()))
  );

create policy concurso_objects_admin_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'concurso-fotos'
    and exists (select 1 from public.admins where user_id = (select auth.uid()))
    and not exists (
      select 1 from public.photos
      where thumbnail_path = storage.objects.name or image_path = storage.objects.name
    )
  );

-- Public reads use public URLs; writes remain restricted by storage.objects RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('concurso-fotos', 'concurso-fotos', true, 2097152,
        array['image/webp', 'image/avif']);

commit;
