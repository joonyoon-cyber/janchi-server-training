-- Owner account + owner-only "Clear leaderboard".
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.

-- 1. Owner flag on profiles. Users cannot change it themselves
--    (they may only update display_name; see schema.sql).
alter table public.profiles add column if not exists is_owner boolean not null default false;

-- 2. "Clear leaderboard" and the owner's Team page are set up by team.sql (run it too).

-- 3. AFTER you have created the owner account on the site (Sign in > Create account),
--    make it the owner. Put the owner account's email in the quotes, then run this line:
-- update public.profiles set is_owner = true
--   where id = (select id from auth.users where email = 'OWNER-EMAIL-HERE');
