-- Create matching_experiments table to store autoresearch experiment results
-- Used by run-matching-experiment and run-experiment-sweep edge functions
-- to track precision/recall/F1 across different AI scoring parameters

CREATE TABLE IF NOT EXISTS matching_experiments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  parameters JSONB NOT NULL,
  scoring_model TEXT,
  cutoff_threshold DECIMAL,
  scoring_prompt TEXT,
  precision_score DECIMAL,
  recall_score DECIMAL,
  f1_score DECIMAL,
  avg_overlap DECIMAL,
  prospects_evaluated INT,
  total_predictions INT,
  total_correct INT,
  duration_seconds INT,
  notes TEXT
);

-- Index for querying best experiments
CREATE INDEX idx_matching_experiments_f1 ON matching_experiments(f1_score DESC NULLS LAST);
CREATE INDEX idx_matching_experiments_created ON matching_experiments(created_at DESC);

-- Enable RLS
ALTER TABLE matching_experiments ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can write (edge functions use service role key)
-- No public read needed — this is internal analytics
CREATE POLICY "Service role full access on matching_experiments"
  ON matching_experiments
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE matching_experiments IS 'Stores results from autoresearch experiment runs comparing AI scoring parameters against human feedback';
COMMENT ON COLUMN matching_experiments.parameters IS 'JSON with scoring_model, cutoff_threshold, prompt_variant used for this run';
COMMENT ON COLUMN matching_experiments.scoring_model IS 'Anthropic model used for scoring (e.g. claude-haiku-4-5-20251001)';
COMMENT ON COLUMN matching_experiments.cutoff_threshold IS 'Score threshold — podcasts scoring >= this are considered AI picks';
COMMENT ON COLUMN matching_experiments.scoring_prompt IS 'Prompt variant key (default/strict/lenient) or full custom prompt text';
COMMENT ON COLUMN matching_experiments.precision_score IS 'true_positives / (true_positives + false_positives)';
COMMENT ON COLUMN matching_experiments.recall_score IS 'true_positives / (true_positives + false_negatives)';
COMMENT ON COLUMN matching_experiments.f1_score IS '2 * (precision * recall) / (precision + recall)';
COMMENT ON COLUMN matching_experiments.avg_overlap IS 'Average overlap ratio between predictions and approved podcasts per prospect';


-- =============================================================================
-- replay-safety: folded-in onboarding_sessions schema
-- =============================================================================
-- onboarding_sessions was applied to production by hand (April 2026, after this
-- file and before the invite-only cutover) from un-numbered files the CLI never
-- runs; the originals now live in supabase/migrations_archive/. It is folded in
-- here, in idempotent form, because 20260720000200_invite_only_workspace_rls.sql
-- revokes and drops policies on it. Production already has it and never re-runs
-- this file.

-- From archived create_onboarding_sessions.sql
-- Track onboarding sessions from the moment someone starts the flow
-- Even if they never submit, we capture their partial data for follow-up

create table if not exists onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique, -- browser-generated ID to track across saves

  -- Status tracking
  status text not null default 'started' check (status in ('started', 'in_progress', 'completed', 'abandoned')),
  current_step integer not null default 1,
  furthest_step integer not null default 1,

  -- Basic Information (Step 1)
  name text,
  email text,
  title text,
  company text,
  website text,
  social_followers text,

  -- Professional Profile (Step 2)
  bio text,
  linkedin_url text,

  -- Story (Step 3)
  compelling_story text,
  unique_journey text,
  previous_podcasts text,

  -- Expertise & Topics (Step 4)
  expertise text[], -- array of selected expertise tags
  topics_confident text[], -- array of selected topics
  passions text,

  -- Goals & Audience (Step 5)
  goals text[], -- array of selected goals
  ideal_audience text,
  specific_podcasts text,
  audience_value text,

  -- Final Details (Step 6)
  availability text,
  calendar_link text,
  personal_stories text,
  hobbies text,
  future_vision text,
  specific_angles text,
  additional_info text,
  key_messages text[],
  impact text,

  -- Has headshot been uploaded?
  has_headshot boolean default false,

  -- Linked to client if they complete onboarding
  client_id uuid references clients(id),

  -- Metadata
  user_agent text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,

  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  last_active_at timestamptz not null default now()
);

-- Index for looking up sessions
create index if not exists idx_onboarding_sessions_session_id on onboarding_sessions(session_id);
create index if not exists idx_onboarding_sessions_email on onboarding_sessions(email) where email is not null;
create index if not exists idx_onboarding_sessions_status on onboarding_sessions(status);
create index if not exists idx_onboarding_sessions_created_at on onboarding_sessions(created_at desc);

-- Auto-update updated_at
create or replace function update_onboarding_session_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  new.last_active_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_onboarding_sessions_updated on onboarding_sessions;
create trigger trg_onboarding_sessions_updated
  before update on onboarding_sessions
  for each row
  execute function update_onboarding_session_timestamp();

-- RLS: allow anonymous inserts/updates (prospects aren't logged in)
alter table onboarding_sessions enable row level security;

-- Allow insert from anon key
drop policy if exists "Allow anonymous insert" on onboarding_sessions;
create policy "Allow anonymous insert" on onboarding_sessions
  for insert to anon with check (true);

-- Allow update from anon key (only their own session via session_id)
drop policy if exists "Allow anonymous update" on onboarding_sessions;
create policy "Allow anonymous update" on onboarding_sessions
  for update to anon using (true) with check (true);

-- Allow service role full access (for admin views)
drop policy if exists "Service role full access" on onboarding_sessions;
create policy "Service role full access" on onboarding_sessions
  for all to service_role using (true) with check (true);

-- From archived fix_onboarding_sessions_cascade_delete.sql: the client FK is
-- ON DELETE SET NULL. Guarded so it only swaps a constraint that is not already
-- SET NULL.
DO $replay$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'onboarding_sessions_client_id_fkey'
      AND conrelid = 'public.onboarding_sessions'::regclass
      AND confdeltype <> 'n'
  ) THEN
    ALTER TABLE public.onboarding_sessions
      DROP CONSTRAINT onboarding_sessions_client_id_fkey,
      ADD CONSTRAINT onboarding_sessions_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
  END IF;
END
$replay$;
