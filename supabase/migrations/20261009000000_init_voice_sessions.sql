-- Voice Agent Dashboard: initial schema
-- Sessions, raw Gemini usage messages, and per-user Row Level Security.

create table public.voice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed', 'error')),
  model text not null,
  persona text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  end_reason text,
  -- Aggregates computed server-side from session_usage_events when a session ends.
  usage_message_count integer not null default 0 check (usage_message_count >= 0),
  prompt_tokens bigint not null default 0 check (prompt_tokens >= 0),
  response_tokens bigint not null default 0 check (response_tokens >= 0),
  thoughts_tokens bigint not null default 0 check (thoughts_tokens >= 0),
  input_text_tokens bigint not null default 0 check (input_text_tokens >= 0),
  input_audio_tokens bigint not null default 0 check (input_audio_tokens >= 0),
  output_text_tokens bigint not null default 0 check (output_text_tokens >= 0),
  output_audio_tokens bigint not null default 0 check (output_audio_tokens >= 0),
  -- ESTIMATE only, not a provider billing figure. pricing_version records which rate table was used.
  estimated_cost_usd numeric(12, 6) not null default 0 check (estimated_cost_usd >= 0),
  pricing_version text,
  transcript jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index voice_sessions_user_started_idx
  on public.voice_sessions (user_id, started_at desc);

-- One row per usageMetadata message received from the API, stored exactly as sent.
create table public.session_usage_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.voice_sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  seq integer not null check (seq >= 1),
  usage jsonb not null,
  received_at timestamptz not null default now(),
  unique (session_id, seq)
);

create index session_usage_events_session_idx
  on public.session_usage_events (session_id);

alter table public.voice_sessions enable row level security;
alter table public.session_usage_events enable row level security;

revoke all on public.voice_sessions from anon;
revoke all on public.session_usage_events from anon;

create policy "voice_sessions_select_own" on public.voice_sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "voice_sessions_insert_own" on public.voice_sessions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "voice_sessions_update_own" on public.voice_sessions
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "voice_sessions_delete_own" on public.voice_sessions
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "usage_events_select_own" on public.session_usage_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy "usage_events_insert_own" on public.session_usage_events
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.voice_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );
create policy "usage_events_delete_own" on public.session_usage_events
  for delete to authenticated using (user_id = (select auth.uid()));
