-- zoom_scheduled: stores upcoming scheduled Zoom meetings
create table if not exists public.zoom_scheduled (
  id           uuid primary key default gen_random_uuid(),
  host_id      uuid not null references auth.users(id) on delete cascade,
  host_name    text not null,
  title        text not null,
  scheduled_at timestamptz not null,
  zoom_url     text not null,
  meeting_id   text,
  status       text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_at   timestamptz not null default now()
);

alter table public.zoom_scheduled enable row level security;

create policy "Anyone authenticated can view scheduled zoom meetings"
  on public.zoom_scheduled for select
  using (auth.role() = 'authenticated');

create policy "Mentors can insert scheduled zoom meetings"
  on public.zoom_scheduled for insert
  with check (auth.uid() = host_id);

create policy "Mentors can update their own scheduled zoom meetings"
  on public.zoom_scheduled for update
  using (auth.uid() = host_id);
