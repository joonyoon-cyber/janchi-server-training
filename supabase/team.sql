-- Team progress for the owner: who is practicing, how often, and how they are doing.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run. Safe to re-run.
-- (Also included in schema.sql for new projects.)

-- True when the signed-in person is the owner.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_owner);
$$;

revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- Test runs: each person sees only their own; the owner sees everyone's.
-- (The public leaderboard view does not depend on this.)
drop policy if exists "runs are visible to signed-in users" on public.test_runs;
drop policy if exists "users see their own runs; the owner sees all" on public.test_runs;
create policy "users see their own runs; the owner sees all" on public.test_runs
  for select to authenticated using (user_id = auth.uid() or public.is_owner());

-- Every Test that was started (finished or not), to count attempts that were abandoned.
create table if not exists public.test_starts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  version int not null,
  seed bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists test_starts_user_idx on public.test_starts (user_id, created_at desc);
alter table public.test_starts enable row level security;

drop policy if exists "users add their own test starts" on public.test_starts;
create policy "users add their own test starts" on public.test_starts
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "users see their own test starts; the owner sees all" on public.test_starts;
create policy "users see their own test starts; the owner sees all" on public.test_starts
  for select to authenticated using (user_id = auth.uid() or public.is_owner());

grant select, insert on public.test_starts to authenticated;

-- Scenario practice finished while signed in.
create table if not exists public.practice_results (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  scenario_id text not null,
  title text not null,
  level text not null,
  generated boolean not null default false,
  score int not null check (score between 0 and 100),
  duration_sec int not null check (duration_sec >= 0),
  mistakes int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists practice_results_user_idx on public.practice_results (user_id, created_at desc);
alter table public.practice_results enable row level security;

drop policy if exists "users add their own practice results" on public.practice_results;
create policy "users add their own practice results" on public.practice_results
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "users see their own practice results; the owner sees all" on public.practice_results;
create policy "users see their own practice results; the owner sees all" on public.practice_results
  for select to authenticated using (user_id = auth.uid() or public.is_owner());

grant select, insert on public.practice_results to authenticated;

-- Owner only: everyone with an account, with their sign-in email and last sign-in.
create or replace function public.team_members()
returns table (id uuid, display_name text, email text, joined_at timestamptz, last_sign_in_at timestamptz, is_owner boolean)
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can see the team';
  end if;
  return query
    select p.id, p.display_name, u.email::text, u.created_at, u.last_sign_in_at, p.is_owner
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.display_name;
end;
$$;

revoke all on function public.team_members() from public, anon;
grant execute on function public.team_members() to authenticated;

-- Clearing the leaderboard starts a fresh ranking but keeps everyone's history for the owner.
create table if not exists public.leaderboard_resets (
  id bigint generated always as identity primary key,
  cleared_at timestamptz not null default now(),
  cleared_by uuid default auth.uid()
);
alter table public.leaderboard_resets enable row level security;
-- No policies: only the security-definer view and function below touch it.

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
       and x.created_at > coalesce((select max(cleared_at) from public.leaderboard_resets), '-infinity'))::int as attempts
from public.test_runs r
join public.profiles p on p.id = r.user_id
where r.version = (select max(version) from public.test_runs)
  and r.created_at > coalesce((select max(cleared_at) from public.leaderboard_resets), '-infinity')
order by r.user_id, r.score desc, r.clear_time_sec asc, r.created_at asc;

grant select on public.leaderboard to anon, authenticated;

create or replace function public.clear_leaderboard()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can clear the leaderboard';
  end if;
  insert into public.leaderboard_resets (cleared_by) values (auth.uid());
end;
$$;

revoke all on function public.clear_leaderboard() from public, anon;
grant execute on function public.clear_leaderboard() to authenticated;
