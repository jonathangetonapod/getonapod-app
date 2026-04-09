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
create index idx_onboarding_sessions_session_id on onboarding_sessions(session_id);
create index idx_onboarding_sessions_email on onboarding_sessions(email) where email is not null;
create index idx_onboarding_sessions_status on onboarding_sessions(status);
create index idx_onboarding_sessions_created_at on onboarding_sessions(created_at desc);

-- Auto-update updated_at
create or replace function update_onboarding_session_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  new.last_active_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_onboarding_sessions_updated
  before update on onboarding_sessions
  for each row
  execute function update_onboarding_session_timestamp();

-- RLS: allow anonymous inserts/updates (prospects aren't logged in)
alter table onboarding_sessions enable row level security;

-- Allow insert from anon key
create policy "Allow anonymous insert" on onboarding_sessions
  for insert to anon with check (true);

-- Allow update from anon key (only their own session via session_id)
create policy "Allow anonymous update" on onboarding_sessions
  for update to anon using (true) with check (true);

-- Allow service role full access (for admin views)
create policy "Service role full access" on onboarding_sessions
  for all to service_role using (true) with check (true);
