-- RedZone Arena Pro schema
create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text,
  discord_name text,
  standoff_id text,
  avatar_url text,
  role text default 'player' check (role in ('player','admin')),
  created_at timestamptz default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tag text not null,
  logo_url text,
  wins int default 0,
  losses int default 0,
  created_by uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text default 'captain',
  created_at timestamptz default now(),
  unique(team_id, user_id)
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  team_a uuid references teams(id) on delete cascade,
  team_b uuid references teams(id) on delete cascade,
  score_a int,
  score_b int,
  status text default 'open' check (status in ('open','submitted','confirmed','disputed')),
  created_by uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.add_win_loss(winner_id uuid, loser_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.teams set wins = wins + 1 where id = winner_id;
  update public.teams set losses = losses + 1 where id = loser_id;
end;
$$;

alter table profiles enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table matches enable row level security;

drop policy if exists profiles_select on profiles;
drop policy if exists profiles_insert on profiles;
drop policy if exists profiles_update_self on profiles;
drop policy if exists teams_select on teams;
drop policy if exists teams_insert on teams;
drop policy if exists teams_update_admin on teams;
drop policy if exists members_select on team_members;
drop policy if exists members_insert on team_members;
drop policy if exists matches_select on matches;
drop policy if exists matches_insert on matches;
drop policy if exists matches_update_users on matches;

create policy profiles_select on profiles for select using (true);
create policy profiles_insert on profiles for insert with check (auth.uid() = id);
create policy profiles_update_self on profiles for update using (auth.uid() = id or public.is_admin()) with check (auth.uid() = id or public.is_admin());

create policy teams_select on teams for select using (true);
create policy teams_insert on teams for insert with check (auth.uid() = created_by);
create policy teams_update_admin on teams for update using (created_by = auth.uid() or public.is_admin()) with check (created_by = auth.uid() or public.is_admin());

create policy members_select on team_members for select using (true);
create policy members_insert on team_members for insert with check (auth.role() = 'authenticated');

create policy matches_select on matches for select using (true);
create policy matches_insert on matches for insert with check (auth.uid() = created_by);
create policy matches_update_users on matches for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Avatar bucket + public read/write for logged users
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists avatar_public_read on storage.objects;
drop policy if exists avatar_authenticated_upload on storage.objects;
drop policy if exists avatar_owner_update on storage.objects;
create policy avatar_public_read on storage.objects for select using (bucket_id = 'avatars');
create policy avatar_authenticated_upload on storage.objects for insert with check (bucket_id = 'avatars' and auth.role() = 'authenticated');
create policy avatar_owner_update on storage.objects for update using (bucket_id = 'avatars' and auth.role() = 'authenticated');

-- Run this AFTER you create/login your own account, replacing email:
-- update profiles set role = 'admin' where email = 'YOUR_EMAIL@gmail.com';
