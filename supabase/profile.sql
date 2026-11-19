-- Profiles: a picture and a featured badge, shown on the profile page and the leaderboard.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run. Safe to re-run.
-- (Also included at the end of schema.sql for new projects.)

-- avatar_url holds either a picked avatar ("emoji:🔥:#be1e2d") or a small photo that the
-- website shrinks to 128 x 128 before saving ("data:image/jpeg;base64,..."), so no file storage is needed.
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists featured_badge text;

alter table public.profiles drop constraint if exists profiles_avatar_url_size;
alter table public.profiles add constraint profiles_avatar_url_size
  check (avatar_url is null or (char_length(avatar_url) <= 60000 and (avatar_url like 'emoji:%' or avatar_url like 'data:image/%')));

alter table public.profiles drop constraint if exists profiles_featured_badge_size;
alter table public.profiles add constraint profiles_featured_badge_size
  check (featured_badge is null or featured_badge ~ '^[a-z0-9-]{1,40}$');

-- People may change their own name, picture and featured badge (never is_owner).
grant update (display_name, avatar_url, featured_badge) on public.profiles to authenticated;

-- The public leaderboard also shows each person's picture and featured badge.
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
  p.featured_badge
from public.test_runs r
join public.profiles p on p.id = r.user_id
where r.version = (select max(version) from public.test_runs)
  and r.created_at > coalesce((select max(cleared_at) from public.leaderboard_resets), '-infinity')
order by r.user_id, r.score desc, r.clear_time_sec asc, r.created_at asc;

grant select on public.leaderboard to anon, authenticated;
