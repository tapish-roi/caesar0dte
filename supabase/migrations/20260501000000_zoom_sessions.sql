-- zoom_sessions: stores active Zoom meeting links shared on the platform
create table if not exists public.zoom_sessions (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid not null references auth.users(id) on delete cascade,
  host_name   text not null,
  title       text not null,
  zoom_url    text not null,
  status      text not null default 'active' check (status in ('active', 'ended')),
  created_at  timestamptz not null default now(),
  ended_at    timestamptz
);

-- Only authenticated users can read
alter table public.zoom_sessions enable row level security;

create policy "Anyone authenticated can view active zoom sessions"
  on public.zoom_sessions for select
  using (auth.role() = 'authenticated');

create policy "Users can insert their own zoom sessions"
  on public.zoom_sessions for insert
  with check (auth.uid() = host_id);

create policy "Hosts can update their own zoom sessions"
  on public.zoom_sessions for update
  using (auth.uid() = host_id);
