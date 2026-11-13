-- Clear the leaderboard and count only the newest Test format from now on.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.

-- 1. Remove every saved Test run (names and sign-ins are kept).
truncate table public.test_runs;

-- 2. Leaderboard shows only runs of the newest Test version.
create or replace view public.leaderboard
with (security_invoker = true) as
select distinct on (r.user_id)
  r.user_id,
  p.display_name,
  r.score,
  r.clear_time_sec,
  r.created_at,
  (select count(*) from public.test_runs x where x.user_id = r.user_id and x.version = r.version)::int as attempts
from public.test_runs r
join public.profiles p on p.id = r.user_id
where r.version = (select max(version) from public.test_runs)
order by r.user_id, r.score desc, r.clear_time_sec asc, r.created_at asc;

grant select on public.leaderboard to authenticated;
