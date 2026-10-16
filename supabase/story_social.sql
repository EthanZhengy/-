-- Ianz Fitness: likes and comments on stories (快拍), and 获赞 (likes received) on profiles.
-- Run once in Supabase → SQL Editor, after stories.sql. Safe to run again.
-- Story comments are private like Instagram replies: only the commenter and the story's owner can read them.

create table if not exists public.story_likes (
  story_id   uuid not null references public.stories (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create table if not exists public.story_comments (
  id          uuid primary key default gen_random_uuid(),
  story_id    uuid not null references public.stories (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '',
  body        text not null check (char_length(body) between 1 and 300),
  created_at  timestamptz not null default now()
);
create index if not exists story_comments_story_idx on public.story_comments (story_id, created_at);

create or replace function public.story_comments_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.author_name := coalesce((select name from profiles where user_id = auth.uid()), '');
  new.created_at := now();
  return new;
end $$;
drop trigger if exists story_comments_before_insert on public.story_comments;
create trigger story_comments_before_insert before insert on public.story_comments for each row execute function public.story_comments_before_insert();

-- Is this story live, or mine? (security definer so policies can look at stories without recursion)
create or replace function public.story_owner(sid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select user_id from stories where id = sid;
$$;
create or replace function public.story_live(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from stories where id = sid and expires_at > now());
$$;

alter table public.story_likes    enable row level security;
alter table public.story_comments enable row level security;

drop policy if exists "story likes: mine or on my story" on public.story_likes;
drop policy if exists "story likes: give" on public.story_likes;
drop policy if exists "story likes: take back" on public.story_likes;
create policy "story likes: mine or on my story" on public.story_likes for select to authenticated
  using (user_id = auth.uid() or public.story_owner(story_id) = auth.uid());
create policy "story likes: give" on public.story_likes for insert to authenticated
  with check (user_id = auth.uid() and public.story_live(story_id));
create policy "story likes: take back" on public.story_likes for delete to authenticated using (user_id = auth.uid());

drop policy if exists "story comments: commenter and owner" on public.story_comments;
drop policy if exists "story comments: write" on public.story_comments;
drop policy if exists "story comments: delete" on public.story_comments;
create policy "story comments: commenter and owner" on public.story_comments for select to authenticated
  using (user_id = auth.uid() or public.story_owner(story_id) = auth.uid());
create policy "story comments: write" on public.story_comments for insert to authenticated
  with check (user_id = auth.uid() and public.story_live(story_id));
create policy "story comments: delete" on public.story_comments for delete to authenticated
  using (user_id = auth.uid() or public.story_owner(story_id) = auth.uid());

-- Profile card with 获赞: likes on all posts + likes on stories (including expired ones)
drop function if exists public.community_profile(uuid);
create or replace function public.community_profile(uid uuid)
returns table (user_id uuid, name text, avatar_url text, bio text, status text, posts bigint, followers bigint, following bigint, likes bigint)
language sql stable security definer set search_path = public as $$
  select uid, coalesce(p.name, ''), p.avatar_url, coalesce(p.bio, ''), coalesce(p.status, ''),
    (select count(*) from posts where posts.user_id = uid),
    (select count(*) from follows where followee = uid),
    (select count(*) from follows where follower = uid),
    coalesce((select sum(like_count) from posts where posts.user_id = uid), 0)
      + (select count(*) from story_likes l join stories s on s.id = l.story_id where s.user_id = uid)
  from (select 1) one left join profiles p on p.user_id = uid;
$$;
revoke all on function public.community_profile(uuid) from public, anon;
grant execute on function public.community_profile(uuid) to authenticated;
