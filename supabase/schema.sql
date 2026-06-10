-- RedZone Arena Supabase schema
-- Run this in Supabase SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  discord text,
  role text not null default 'player' check (role in ('player','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tag text not null unique,
  captain_id uuid not null references public.profiles(id) on delete cascade,
  wins int not null default 0,
  losses int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid references public.teams(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  member_role text not null default 'player' check (member_role in ('captain','player')),
  created_at timestamptz not null default now(),
  primary key(team_id, profile_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  team_a uuid not null references public.teams(id) on delete cascade,
  team_b uuid not null references public.teams(id) on delete cascade,
  room_code text,
  score_a int,
  score_b int,
  submitted_by uuid references public.profiles(id) on delete set null,
  confirmed_by uuid references public.profiles(id) on delete set null,
  winner_team uuid references public.teams(id) on delete set null,
  status text not null default 'open' check (status in ('open','submitted','confirmed','disputed')),
  created_at timestamptz not null default now(),
  check (team_a <> team_b)
);

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.matches enable row level security;

-- Profiles
create policy "profiles are readable" on public.profiles for select using (true);
create policy "users insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "users update own profile" on public.profiles for update using (auth.uid() = id);

-- Teams
create policy "teams are readable" on public.teams for select using (true);
create policy "authenticated users create teams" on public.teams for insert with check (auth.role() = 'authenticated' and auth.uid() = captain_id);
create policy "captains update own teams" on public.teams for update using (auth.uid() = captain_id);

-- Team members
create policy "team members are readable" on public.team_members for select using (true);
create policy "captains create membership" on public.team_members for insert with check (auth.role() = 'authenticated');
create policy "members delete own membership" on public.team_members for delete using (auth.uid() = profile_id);

-- Matches
create policy "matches are readable" on public.matches for select using (true);
create policy "authenticated users create matches" on public.matches for insert with check (auth.role() = 'authenticated');
create policy "authenticated users update matches" on public.matches for update using (auth.role() = 'authenticated');

create or replace function public.finalize_match_stats()
returns trigger as $$
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' and new.winner_team is not null then
    update public.teams set wins = wins + 1 where id = new.winner_team;
    update public.teams set losses = losses + 1 where id in (new.team_a, new.team_b) and id <> new.winner_team;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_match_confirmed on public.matches;
create trigger on_match_confirmed
after update on public.matches
for each row execute function public.finalize_match_stats();
