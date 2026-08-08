-- StockInsider v5.12: durable Supabase runtime state for social refresh workers.

create extension if not exists pgcrypto;

create table if not exists public.worker_job_states (
  job_id text primary key,
  status text not null default 'idle',
  last_run_at timestamptz,
  last_scheduled_at timestamptz,
  last_schedule_slot text,
  last_duration_ms integer,
  last_summary text,
  last_error text,
  last_routes jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.worker_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_id text not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  summary text,
  error_message text,
  routes jsonb not null default '[]'::jsonb,
  records_written integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists worker_job_runs_job_started_idx
  on public.worker_job_runs (job_id, started_at desc);

create table if not exists public.worker_logs (
  id uuid primary key default gen_random_uuid(),
  service_name text not null,
  level text not null default 'info',
  message text not null,
  log_excerpt text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists worker_logs_service_created_idx
  on public.worker_logs (service_name, created_at desc);

create table if not exists public.runtime_artifacts (
  id uuid primary key default gen_random_uuid(),
  artifact_type text not null,
  artifact_key text not null unique,
  source_path text,
  storage_url text,
  payload jsonb not null default '{}'::jsonb,
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists runtime_artifacts_type_created_idx
  on public.runtime_artifacts (artifact_type, created_at desc);

create table if not exists public.source_sessions (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  session_kind text not null default 'meta',
  status text not null default 'valid',
  encrypted_payload jsonb not null default '{}'::jsonb,
  cookie_domains jsonb not null default '[]'::jsonb,
  cookie_count integer not null default 0,
  validated_at timestamptz,
  expires_at timestamptz,
  last_successful_url text,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, session_kind)
);

create index if not exists source_sessions_platform_status_idx
  on public.source_sessions (platform, status, updated_at desc);

alter table public.worker_job_states enable row level security;
alter table public.worker_job_runs enable row level security;
alter table public.worker_logs enable row level security;
alter table public.runtime_artifacts enable row level security;
alter table public.source_sessions enable row level security;

drop policy if exists "service role manages worker_job_states" on public.worker_job_states;
create policy "service role manages worker_job_states"
  on public.worker_job_states
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages worker_job_runs" on public.worker_job_runs;
create policy "service role manages worker_job_runs"
  on public.worker_job_runs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages worker_logs" on public.worker_logs;
create policy "service role manages worker_logs"
  on public.worker_logs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages runtime_artifacts" on public.runtime_artifacts;
create policy "service role manages runtime_artifacts"
  on public.runtime_artifacts
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role manages source_sessions" on public.source_sessions;
create policy "service role manages source_sessions"
  on public.source_sessions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
