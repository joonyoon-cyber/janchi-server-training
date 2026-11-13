-- Owner account + owner-only "Clear leaderboard".
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.

-- 1. Owner flag on profiles. Users cannot change it themselves
--    (they may only update display_name; see schema.sql).
alter table public.profiles add column if not exists is_owner boolean not null default false;

-- 2. Clear the leaderboard: only a profile with is_owner = true may run it.
create or replace function public.clear_leaderboard()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_owner) then
    raise exception 'Only the owner can clear the leaderboard';
  end if;
  delete from public.test_runs where true;
end;
$$;

revoke all on function public.clear_leaderboard() from public, anon;
grant execute on function public.clear_leaderboard() to authenticated;

-- 3. AFTER you have created the owner account on the site (Sign in > Create account),
--    make it the owner. Put the owner account's email in the quotes, then run this line:
-- update public.profiles set is_owner = true
--   where id = (select id from auth.users where email = 'OWNER-EMAIL-HERE');
