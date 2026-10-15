-- Ianz Fitness: friends & training feed. Run once in Supabase → SQL Editor (after schema.sql).
-- Friends see each other's training summaries (title, number of exercises / sets, top set).
-- Body data, nutrition and the full training log stay private in user_data.

-- Public face of each account: display name + a short code others use to add you
create table if not exists public.profiles (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  name           text not null default '',
  friend_code    text not null unique,
  share_activity boolean not null default true,
  updated_at     timestamptz not null default now()
);

-- Friend requests; status becomes 'accepted' when the other person agrees
create table if not exists public.friendships (
  requester  uuid not null references auth.users (id) on delete cascade,
  addressee  uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

-- One summary per user per day, posted when a workout is completed in the app
create table if not exists public.activities (
  user_id    uuid not null references auth.users (id) on delete cascade,
  day        date not null,
  title      text not null,
  exercises  int  not null default 0,
  sets       int  not null default 0,
  volume     int  not null default 0,
  top_set    text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- 💪 cheers on a friend's workout
create table if not exists public.cheers (
  activity_user uuid not null,
  activity_day  date not null,
  user_id       uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (activity_user, activity_day, user_id),
  foreign key (activity_user, activity_day) references public.activities (user_id, day) on delete cascade
);

-- Helpers (security definer so policies can check friendships without exposing the table)
create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
      and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;

create or replace function public.knows(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships
    where (requester = a and addressee = b) or (requester = b and addressee = a)
  );
$$;

-- Look someone up by friend code (only returns their display name)
create or replace function public.find_profile_by_code(code text)
returns table (user_id uuid, name text)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.name from profiles p where p.friend_code = upper(trim(code)) limit 1;
$$;
revoke all on function public.find_profile_by_code(text) from public, anon;
grant execute on function public.find_profile_by_code(text) to authenticated;

alter table public.profiles    enable row level security;
alter table public.friendships enable row level security;
alter table public.activities  enable row level security;
alter table public.cheers      enable row level security;

drop policy if exists "profiles: self, friends and requests" on public.profiles;
drop policy if exists "profiles: insert self" on public.profiles;
drop policy if exists "profiles: update self" on public.profiles;
create policy "profiles: self, friends and requests" on public.profiles for select
  using (user_id = auth.uid() or public.knows(auth.uid(), user_id));
create policy "profiles: insert self" on public.profiles for insert with check (user_id = auth.uid());
create policy "profiles: update self" on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "friendships: involved" on public.friendships;
drop policy if exists "friendships: send" on public.friendships;
drop policy if exists "friendships: accept" on public.friendships;
drop policy if exists "friendships: remove" on public.friendships;
create policy "friendships: involved" on public.friendships for select using (auth.uid() in (requester, addressee));
create policy "friendships: send" on public.friendships for insert with check (requester = auth.uid() and status = 'pending');
create policy "friendships: accept" on public.friendships for update
  using (addressee = auth.uid()) with check (addressee = auth.uid() and status = 'accepted');
create policy "friendships: remove" on public.friendships for delete using (auth.uid() in (requester, addressee));

drop policy if exists "activities: self and sharing friends" on public.activities;
drop policy if exists "activities: write own" on public.activities;
drop policy if exists "activities: update own" on public.activities;
drop policy if exists "activities: delete own" on public.activities;
create policy "activities: self and sharing friends" on public.activities for select
  using (user_id = auth.uid() or (public.are_friends(auth.uid(), user_id)
         and exists (select 1 from public.profiles p where p.user_id = activities.user_id and p.share_activity)));
create policy "activities: write own" on public.activities for insert with check (user_id = auth.uid());
create policy "activities: update own" on public.activities for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "activities: delete own" on public.activities for delete using (user_id = auth.uid());

drop policy if exists "cheers: visible to people involved" on public.cheers;
drop policy if exists "cheers: give" on public.cheers;
drop policy if exists "cheers: take back" on public.cheers;
create policy "cheers: visible to people involved" on public.cheers for select
  using (user_id = auth.uid() or activity_user = auth.uid() or public.are_friends(auth.uid(), activity_user));
create policy "cheers: give" on public.cheers for insert
  with check (user_id = auth.uid() and (activity_user = auth.uid() or public.are_friends(auth.uid(), activity_user)));
create policy "cheers: take back" on public.cheers for delete using (user_id = auth.uid());
