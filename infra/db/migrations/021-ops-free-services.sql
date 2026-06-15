\connect ops_db

create table if not exists ops_settings (
  id text primary key,
  settings jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists ops_audit_events (
  id uuid primary key,
  action text not null,
  actor text not null,
  summary text not null,
  details jsonb,
  correlation_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists ops_audit_events_created_at_idx on ops_audit_events (created_at desc);
