-- Janchi POS Trainer: database schema for Test mode and the leaderboard.
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Safe to re-run: it only creates things that do not exist yet.

-- Profiles: one row per signed-in person (name shown on the leaderboard).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  is_owner boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists is_owner boolean not null default false;

alter table public.profiles enable row level security;

drop policy if exists "profiles are visible to signed-in users" on public.profiles;
create policy "profiles are visible to signed-in users" on public.profiles
  for select to authenticated using (true);

drop policy if exists "users edit their own profile" on public.profiles;
create policy "users edit their own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

grant select, update (display_name) on public.profiles to authenticated;

-- Create a profile automatically on first Google sign-in.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), 40)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Test runs: one row per finished 20-table Test.
create table if not exists public.test_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  version int not null,
  seed bigint not null,
  score int not null check (score between 0 and 100),
  clear_time_sec int not null check (clear_time_sec > 0),
  tables jsonb not null,
  events jsonb,
  created_at timestamptz not null default now()
);

create index if not exists test_runs_user_idx on public.test_runs (user_id, created_at desc);

alter table public.test_runs enable row level security;

drop policy if exists "runs are visible to signed-in users" on public.test_runs;
create policy "runs are visible to signed-in users" on public.test_runs
  for select to authenticated using (true);

drop policy if exists "users add their own runs" on public.test_runs;
create policy "users add their own runs" on public.test_runs
  for insert to authenticated with check (user_id = auth.uid());

-- No update or delete: a finished run cannot be changed.
grant select, insert on public.test_runs to authenticated;

-- Leaderboard: each person's best run (highest score, then fastest clear time).
-- Only runs of the newest Test version count, so a new Test format starts a fresh leaderboard.
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

-- Profiles for anyone who signed in before this script was run.
insert into public.profiles (id, display_name)
select u.id, left(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1)), 40)
from auth.users u
on conflict (id) do nothing;

-- Owner-only: clear the leaderboard (see owner.sql for making an account the owner).
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
