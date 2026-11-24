-- Run once in christmas_contest SQL Editor using a database administrator.
-- Application authorization uses public.admins, not auth.users.role.
begin;
do $$
declare admin_id uuid;
begin
 select id into admin_id from auth.users
 where lower(email) = 'jorgealejandrocasaresdelgado@gmail.com';
 if admin_id is null then raise exception 'The requested administrator does not exist in Auth'; end if;
 insert into public.admins(user_id) values (admin_id) on conflict do nothing;
end $$;
commit;
