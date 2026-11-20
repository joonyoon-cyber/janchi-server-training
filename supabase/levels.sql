-- Levels and badges on the leaderboard.
-- Badges and XP are worked out in the website from each person's own history (which only they
-- and the owner can read), so each person's browser saves a short summary to their profile:
-- their XP and the badges they have earned ("test90:2,passport:1,..."). The public
-- leaderboard shows it next to their score.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run. Safe to re-run.
-- (Also included at the end of schema.sql for new projects.)

alter table public.profiles add column if not exists xp int not null default 0;
alter table public.profiles add column if not exists badges text;

alter table public.profiles drop constraint if exists profiles_xp_range;
alter table public.profiles add constraint profiles_xp_range check (xp between 0 and 1000000);
alter table public.profiles drop constraint if exists profiles_badges_format;
alter table public.profiles add constraint profiles_badges_format
  check (badges is null or (char_length(badges) <= 2000 and badges ~ '^([a-z0-9-]{1,40}:[1-9](,|$))*$'));

-- People update only their own row (the policy on profiles), and only these columns.
grant update (xp, badges) on public.profiles to authenticated;

drop view if exists public.leaderboard;
create view public.leaderboard
with (security_invoker = false) as
select distinct on (r.user_id)
  r.user_id,
  p.display_name,
  r.score,
  r.clear_time_sec,
  r.created_at,
  (select count(*) from public.test_runs x
     where x.user_id = r.user_id and x.version = r.version
       and x.created_at > coalesce((select max(cleared_at) from public.leaderboard_resets), '-infinity'))::int as attempts,
  p.avatar_url,
  p.featured_badge,
  p.xp,
  p.badges
from public.test_runs r
join public.profiles p on p.id = r.user_id
where r.version = (select max(version) from public.test_runs)
  and r.created_at > coalesce((select max(cleared_at) from public.leaderboard_resets), '-infinity')
order by r.user_id, r.score desc, r.clear_time_sec asc, r.created_at asc;

grant select on public.leaderboard to anon, authenticated;
