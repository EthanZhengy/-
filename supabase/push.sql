-- Ianz Fitness: lock-screen push reminders (Web Push). Run once in Supabase → SQL Editor. Safe to run again.
-- The app stores each device's push subscription here together with the next 14 days of reminders it computed;
-- the send-reminders Edge Function (supabase/functions/send-reminders) delivers them on time.

create table if not exists public.push_subs (
  endpoint     text primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh       text not null,
  auth         text not null,
  schedule     jsonb not null default '[]'::jsonb check (jsonb_typeof(schedule) = 'array' and pg_column_size(schedule) < 65536),
  enabled      boolean not null default true,
  last_sent_at timestamptz not null default now(),
  user_agent   text not null default '',
  updated_at   timestamptz not null default now()
);
create index if not exists push_subs_user_idx on public.push_subs (user_id);

alter table public.push_subs enable row level security;
drop policy if exists "push: own rows" on public.push_subs;
create policy "push: own rows" on public.push_subs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
