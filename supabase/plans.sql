-- Ianz Fitness: 大神方案 (training plans shared by users, with likes, favourites, "used" counts and tips).
-- Run once in Supabase → SQL Editor, after friends.sql and community.sql. Safe to run again.
-- Tips (打赏) show the author's own WeChat / Alipay payment QR code; the app never handles money.

create table if not exists public.plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '',
  title       text not null check (char_length(title) between 1 and 40),
  intro       text not null default '' check (char_length(intro) <= 2000),
  tags        text[] not null default '{}' check (cardinality(tags) <= 5),
  days        jsonb not null check (jsonb_typeof(days) = 'array' and jsonb_array_length(days) between 1 and 14 and pg_column_size(days) < 65536),
  tip_image   text,
  like_count  int not null default 0,
  fav_count   int not null default 0,
  use_count   int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists plans_created_idx on public.plans (created_at desc);
create index if not exists plans_tags_idx on public.plans using gin (tags);

create table if not exists public.plan_likes (
  plan_id uuid not null references public.plans (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
create table if not exists public.plan_favs (
  plan_id uuid not null references public.plans (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
create table if not exists public.plan_uses (
  plan_id uuid not null references public.plans (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);
create table if not exists public.plan_reports (
  plan_id uuid not null references public.plans (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);

-- Author, name and counters are set by the database, not the client
create or replace function public.plans_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.author_name := coalesce((select name from profiles where user_id = auth.uid()), '');
  new.like_count := 0; new.fav_count := 0; new.use_count := 0;
  new.created_at := now();
  if new.tip_image is not null and new.tip_image not like '%/storage/v1/object/public/post-images/' || auth.uid()::text || '/%' then
    raise exception 'invalid tip image url';
  end if;
  return new;
end $$;
drop trigger if exists plans_before_insert on public.plans;
create trigger plans_before_insert before insert on public.plans for each row execute function public.plans_before_insert();

create or replace function public.bump_plan_counts() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d int;
  pid uuid;
begin
  if tg_op = 'INSERT' then d := 1; pid := new.plan_id; else d := -1; pid := old.plan_id; end if;
  if tg_table_name = 'plan_likes' then update plans set like_count = greatest(0, like_count + d) where id = pid;
  elsif tg_table_name = 'plan_favs' then update plans set fav_count = greatest(0, fav_count + d) where id = pid;
  else update plans set use_count = greatest(0, use_count + d) where id = pid;
  end if;
  return null;
end $$;
drop trigger if exists plan_likes_count on public.plan_likes;
create trigger plan_likes_count after insert or delete on public.plan_likes for each row execute function public.bump_plan_counts();
drop trigger if exists plan_favs_count on public.plan_favs;
create trigger plan_favs_count after insert or delete on public.plan_favs for each row execute function public.bump_plan_counts();
drop trigger if exists plan_uses_count on public.plan_uses;
create trigger plan_uses_count after insert on public.plan_uses for each row execute function public.bump_plan_counts();

alter table public.plans        enable row level security;
alter table public.plan_likes   enable row level security;
alter table public.plan_favs    enable row level security;
alter table public.plan_uses    enable row level security;
alter table public.plan_reports enable row level security;

drop policy if exists "plans: read" on public.plans;
drop policy if exists "plans: publish own" on public.plans;
drop policy if exists "plans: delete own" on public.plans;
create policy "plans: read" on public.plans for select to authenticated using (true);
create policy "plans: publish own" on public.plans for insert to authenticated with check (user_id = auth.uid());
create policy "plans: delete own" on public.plans for delete to authenticated using (user_id = auth.uid());

drop policy if exists "plan likes: read" on public.plan_likes;
drop policy if exists "plan likes: give" on public.plan_likes;
drop policy if exists "plan likes: take back" on public.plan_likes;
create policy "plan likes: read" on public.plan_likes for select to authenticated using (user_id = auth.uid());
create policy "plan likes: give" on public.plan_likes for insert to authenticated with check (user_id = auth.uid());
create policy "plan likes: take back" on public.plan_likes for delete to authenticated using (user_id = auth.uid());

drop policy if exists "plan favs: read own" on public.plan_favs;
drop policy if exists "plan favs: add" on public.plan_favs;
drop policy if exists "plan favs: remove" on public.plan_favs;
create policy "plan favs: read own" on public.plan_favs for select to authenticated using (user_id = auth.uid());
create policy "plan favs: add" on public.plan_favs for insert to authenticated with check (user_id = auth.uid());
create policy "plan favs: remove" on public.plan_favs for delete to authenticated using (user_id = auth.uid());

drop policy if exists "plan uses: read own" on public.plan_uses;
drop policy if exists "plan uses: add" on public.plan_uses;
create policy "plan uses: read own" on public.plan_uses for select to authenticated using (user_id = auth.uid());
create policy "plan uses: add" on public.plan_uses for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "plan reports: file" on public.plan_reports;
create policy "plan reports: file" on public.plan_reports for insert to authenticated with check (user_id = auth.uid());
