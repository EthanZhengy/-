-- 身材照片墙: private progress photos. Only the owner can see, add or delete their own photos.
-- Run once in Supabase → SQL Editor (after schema.sql). Safe to run again.

-- ---------- private photo storage ----------
-- Not public: photos are shown through short-lived signed links that only the owner can create.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "progress photos: read own" on storage.objects;
drop policy if exists "progress photos: upload own folder" on storage.objects;
drop policy if exists "progress photos: delete own" on storage.objects;
create policy "progress photos: read own" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "progress photos: upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "progress photos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- photo records ----------
create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path text not null check (length(path) <= 200),
  taken_on date not null default current_date,
  pose text not null default 'front' check (pose in ('front', 'side', 'back', 'other')),
  weight numeric(5, 1) check (weight is null or weight between 20 and 400),
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists progress_photos_user_idx on public.progress_photos (user_id, taken_on desc);

alter table public.progress_photos enable row level security;
drop policy if exists "progress photos: own rows" on public.progress_photos;
create policy "progress photos: own rows" on public.progress_photos for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and path like auth.uid()::text || '/%');
