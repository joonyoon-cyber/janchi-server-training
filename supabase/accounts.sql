-- Accounts: nickname rules and deleting your own account.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run. Safe to re-run.
-- (Also included at the end of schema.sql for new projects.)

-- ---- Nicknames ------------------------------------------------------------------
-- Letters and numbers only (2-20), and no two people with the same one
-- (capital letters don't make a different name: "Joon" and "joon" are the same).

-- 1. New accounts: make the starting nickname from the Google name or email, letters and
--    numbers only, adding a number if it is taken (e.g. "Joon Yoon" -> JoonYoon, then JoonYoon2).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  base text;
  cand text;
  n int := 1;
begin
  base := left(regexp_replace(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), ''), '[^A-Za-z0-9]', '', 'g'), 20);
  if char_length(base) < 2 then base := 'Trainee'; end if;
  cand := base;
  while exists (select 1 from public.profiles where lower(display_name) = lower(cand)) loop
    n := n + 1;
    cand := left(base, 20 - char_length(n::text)) || n;
  end loop;
  insert into public.profiles (id, display_name) values (new.id, cand) on conflict (id) do nothing;
  return new;
end;
$$;

-- 2. Existing nicknames: remove anything but letters and numbers, and number any duplicates
--    (oldest account keeps the plain name). People can change theirs on their Profile page.
do $$
declare
  r record;
  base text;
  cand text;
  n int;
begin
  for r in select id, display_name from public.profiles order by created_at, id loop
    base := left(regexp_replace(coalesce(r.display_name, ''), '[^A-Za-z0-9]', '', 'g'), 20);
    if char_length(base) < 2 then base := 'Trainee'; end if;
    cand := base;
    n := 1;
    while exists (select 1 from public.profiles where lower(display_name) = lower(cand) and id <> r.id) loop
      n := n + 1;
      cand := left(base, 20 - char_length(n::text)) || n;
    end loop;
    if cand is distinct from r.display_name then
      update public.profiles set display_name = cand where id = r.id;
    end if;
  end loop;
end;
$$;

-- 3. The rules, enforced by the database from now on.
alter table public.profiles drop constraint if exists profiles_display_name_format;
alter table public.profiles add constraint profiles_display_name_format check (display_name ~ '^[A-Za-z0-9]{2,20}$');
create unique index if not exists profiles_display_name_unique on public.profiles (lower(display_name));

-- ---- Delete my account ------------------------------------------------------------
-- From the Profile page: removes the signed-in person's account and everything saved
-- for it (profile, Tests, practice). Each person can delete only their own account.
-- The owner account is protected: remove the owner flag in Supabase first if you
-- really mean to delete it.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_owner) then
    raise exception 'The owner account cannot be deleted from the website';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
