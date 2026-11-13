-- Make the leaderboard public (visible without signing in).
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run. Safe to re-run.

-- Leaderboard: each person's best run (highest score, then fastest clear time).
-- Only runs of the newest Test version count, so a new Test format starts a fresh leaderboard.
-- Public: anyone can read it, signed in or not. The view runs with its owner's rights
-- (security_invoker = false) so visitors see only these columns: name, score, time,
-- date and number of Tests. They cannot read the test_runs or profiles tables themselves.
drop view if exists public.leaderboard;
create view public.leaderboard
with (security_invoker = false) as
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

grant select on public.leaderboard to anon, authenticated;
