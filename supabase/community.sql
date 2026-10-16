-- Ianz Fitness: 社区 (Weibo-style posts with photos, likes, comments, follows and trending #topics#).
-- Run once in Supabase → SQL Editor, after schema.sql and friends.sql. Safe to run again.
-- Posts are visible to every signed-in user. Body data, nutrition and training logs stay private.

-- ---------- tables ----------
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name   text not null default '',
  body          text not null default '' check (char_length(body) <= 2000),
  images        text[] not null default '{}' check (cardinality(images) <= 9),
  topics        text[] not null default '{}',
  like_count    int not null default 0,
  comment_count int not null default 0,
  created_at    timestamptz not null default now(),
  check (char_length(body) > 0 or cardinality(images) > 0)
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_user_idx on public.posts (user_id, created_at desc);
create index if not exists posts_topics_idx on public.posts using gin (topics);

create table if not exists public.post_likes (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '',
  body        text not null check (char_length(body) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

create table if not exists public.follows (
  follower   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  followee   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index if not exists follows_followee_idx on public.follows (followee);

-- Reports go to the app owner (review them in Table Editor → post_reports)
create table if not exists public.post_reports (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason     text not null default '',
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- ---------- triggers: author, topics, counters ----------
-- The author and the display name always come from the signed-in account, never from the client.
create or replace function public.posts_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.author_name := coalesce((select name from profiles where user_id = auth.uid()), '');
  new.like_count := 0;
  new.comment_count := 0;
  new.created_at := now();
  -- photos must be this user's uploads in the post-images bucket
  if exists (select 1 from unnest(new.images) as u where u not like '%/storage/v1/object/public/post-images/' || auth.uid()::text || '/%') then
    raise exception 'invalid image url';
  end if;
  -- #话题# (Weibo style) → topics
  new.topics := array(select distinct m[1] from regexp_matches(new.body, '#([^#\s]{1,20})#', 'g') as m limit 5);
  return new;
end $$;
drop trigger if exists posts_before_insert on public.posts;
create trigger posts_before_insert before insert on public.posts for each row execute function public.posts_before_insert();

create or replace function public.comments_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.author_name := coalesce((select name from profiles where user_id = auth.uid()), '');
  new.created_at := now();
  return new;
end $$;
drop trigger if exists comments_before_insert on public.post_comments;
create trigger comments_before_insert before insert on public.post_comments for each row execute function public.comments_before_insert();

create or replace function public.bump_post_counts() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d int;
  pid uuid;
begin
  if tg_op = 'INSERT' then d := 1; pid := new.post_id; else d := -1; pid := old.post_id; end if;
  if tg_table_name = 'post_likes' then
    update posts set like_count = greatest(0, like_count + d) where id = pid;
  else
    update posts set comment_count = greatest(0, comment_count + d) where id = pid;
  end if;
  return null;
end $$;
drop trigger if exists post_likes_count on public.post_likes;
create trigger post_likes_count after insert or delete on public.post_likes for each row execute function public.bump_post_counts();
drop trigger if exists post_comments_count on public.post_comments;
create trigger post_comments_count after insert or delete on public.post_comments for each row execute function public.bump_post_counts();

-- ---------- functions ----------
-- Trending topics: posts in the last N days, weighted by likes and comments
create or replace function public.trending_topics(days int default 7, lim int default 20)
returns table (topic text, posts bigint, heat bigint)
language sql stable set search_path = public as $$
  select t, count(*), count(*) * 10 + sum(p.like_count) + sum(p.comment_count) * 2
  from posts p, unnest(p.topics) as t
  where p.created_at > now() - make_interval(days => days)
  group by t order by 3 desc, 2 desc limit lim;
$$;
grant execute on function public.trending_topics(int, int) to authenticated;

-- Public profile card: display name and counts only
create or replace function public.community_profile(uid uuid)
returns table (user_id uuid, name text, posts bigint, followers bigint, following bigint)
language sql stable security definer set search_path = public as $$
  select uid, coalesce((select name from profiles where profiles.user_id = uid), ''),
    (select count(*) from posts where posts.user_id = uid),
    (select count(*) from follows where followee = uid),
    (select count(*) from follows where follower = uid);
$$;
revoke all on function public.community_profile(uuid) from public, anon;
grant execute on function public.community_profile(uuid) to authenticated;

-- ---------- row level security ----------
alter table public.posts         enable row level security;
alter table public.post_likes    enable row level security;
alter table public.post_comments enable row level security;
alter table public.follows       enable row level security;
alter table public.post_reports  enable row level security;

drop policy if exists "posts: read" on public.posts;
drop policy if exists "posts: write own" on public.posts;
drop policy if exists "posts: delete own" on public.posts;
create policy "posts: read" on public.posts for select to authenticated using (true);
create policy "posts: write own" on public.posts for insert to authenticated with check (user_id = auth.uid());
create policy "posts: delete own" on public.posts for delete to authenticated using (user_id = auth.uid());

drop policy if exists "likes: read" on public.post_likes;
drop policy if exists "likes: give" on public.post_likes;
drop policy if exists "likes: take back" on public.post_likes;
create policy "likes: read" on public.post_likes for select to authenticated using (true);
create policy "likes: give" on public.post_likes for insert to authenticated with check (user_id = auth.uid());
create policy "likes: take back" on public.post_likes for delete to authenticated using (user_id = auth.uid());

drop policy if exists "comments: read" on public.post_comments;
drop policy if exists "comments: write" on public.post_comments;
drop policy if exists "comments: delete own or on own post" on public.post_comments;
create policy "comments: read" on public.post_comments for select to authenticated using (true);
create policy "comments: write" on public.post_comments for insert to authenticated with check (user_id = auth.uid());
create policy "comments: delete own or on own post" on public.post_comments for delete to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()));

drop policy if exists "follows: read" on public.follows;
drop policy if exists "follows: follow" on public.follows;
drop policy if exists "follows: unfollow" on public.follows;
create policy "follows: read" on public.follows for select to authenticated using (true);
create policy "follows: follow" on public.follows for insert to authenticated with check (follower = auth.uid());
create policy "follows: unfollow" on public.follows for delete to authenticated using (follower = auth.uid());

drop policy if exists "reports: file" on public.post_reports;
create policy "reports: file" on public.post_reports for insert to authenticated with check (user_id = auth.uid());

-- ---------- photo storage ----------
-- Public bucket (anyone with the link can view a photo); each user may only upload into their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "post images: upload own folder" on storage.objects;
drop policy if exists "post images: delete own" on storage.objects;
create policy "post images: upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "post images: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and owner = auth.uid());
