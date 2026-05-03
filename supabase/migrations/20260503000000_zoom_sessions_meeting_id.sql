-- Add meeting_id column to zoom_sessions so webhook can match meetings by ID
alter table public.zoom_sessions
  add column if not exists meeting_id text;

create index if not exists zoom_sessions_meeting_id_idx on public.zoom_sessions(meeting_id);
