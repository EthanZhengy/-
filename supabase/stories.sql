-- Ianz Fitness: profile photo, bio and status + 24-hour stories (快拍). Run once in Supabase → SQL Editor,
-- after friends.sql and community.sql. Safe to run again. Photos go to the post-images bucket (own folder).

-- ---------- profile: photo, bio, status ----------
alter table public.profiles add column if not exists avatar_url  text;
alter table public.profiles add column if not exists bio         text not null default '';
alter table public.profiles add column if not exists status      text not null default '';
alter table public.profiles add column if not exists status_at   timestamptz;
alter table public.profiles drop constraint if exists profiles_bio_len;
alter table public.profiles add constraint profiles_bio_len check (char_length(bio) <= 80 and char_length(status) <= 24);

-- A profile photo must be the user's own upload
create or replace function public.profiles_check_avatar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.avatar_url is not null and new.avatar_url not like '%/storage/v1/object/public/post-images/' || new.user_id::text || '/%' then
    raise exception 'invalid avatar url';
  end if;
  return new;
end $$;
drop trigger if exists profiles_check_avatar on public.profiles;
create trigger profiles_check_avatar before insert or update on public.profiles for each row execute function public.profiles_check_avatar();

-- Public card for any set of users: name, photo, bio and status only (no friend code)
create or replace function public.public_profiles(ids uuid[])
returns table (user_id uuid, name text, avatar_url text, bio text, status text)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.name, p.avatar_url, p.bio, p.status from profiles p where p.user_id = any (ids[1:200]);
$$;
revoke all on function public.public_profiles(uuid[]) from public, anon;
grant execute on function public.public_profiles(uuid[]) to authenticated;

drop function if exists public.community_profile(uuid);
create or replace function public.community_profile(uid uuid)
returns table (user_id uuid, name text, avatar_url text, bio text, status text, posts bigint, followers bigint, following bigint)
language sql stable security definer set search_path = public as $$
  select uid, coalesce(p.name, ''), p.avatar_url, coalesce(p.bio, ''), coalesce(p.status, ''),
    (select count(*) from posts where posts.user_id = uid),
    (select count(*) from follows where followee = uid),
    (select count(*) from follows where follower = uid)
  from (select 1) one left join profiles p on p.user_id = uid;
$$;
revoke all on function public.community_profile(uuid) from public, anon;
grant execute on function public.community_profile(uuid) to authenticated;

-- ---------- stories (disappear after 24 hours) ----------
create table if not exists public.stories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  image_url  text not null,
  caption    text not null default '' check (char_length(caption) <= 100),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists stories_live_idx on public.stories (expires_at desc);

create or replace function public.stories_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  if new.image_url not like '%/storage/v1/object/public/post-images/' || auth.uid()::text || '/%' then
    raise exception 'invalid image url';
  end if;
  if (select count(*) from stories where user_id = auth.uid() and expires_at > now()) >= 20 then
    raise exception 'too many stories';
  end if;
  return new;
end $$;
drop trigger if exists stories_before_insert on public.stories;
create trigger stories_before_insert before insert on public.stories for each row execute function public.stories_before_insert();

create table if not exists public.story_reports (
  story_id   uuid not null references public.stories (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason     text not null default '',
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

alter table public.stories       enable row level security;
alter table public.story_reports enable row level security;
drop policy if exists "stories: read live" on public.stories;
drop policy if exists "stories: post own" on public.stories;
drop policy if exists "stories: delete own" on public.stories;
create policy "stories: read live" on public.stories for select to authenticated using (expires_at > now() or user_id = auth.uid());
create policy "stories: post own" on public.stories for insert to authenticated with check (user_id = auth.uid());
create policy "stories: delete own" on public.stories for delete to authenticated using (user_id = auth.uid());
drop policy if exists "story reports: file" on public.story_reports;
create policy "story reports: file" on public.story_reports for insert to authenticated with check (user_id = auth.uid());
