alter table public.memory_events
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text,
  add column if not exists archive_reason text;

create index if not exists memory_events_archived_at_idx
  on public.memory_events (archived_at);

create index if not exists memory_events_active_created_at_idx
  on public.memory_events (created_at desc)
  where archived_at is null;
