-- ============================================
-- SDR SYSTEM DATABASE SCHEMA
-- ============================================
-- Handles the full lead lifecycle with nuanced
-- classification and multi-track sequences
-- ============================================

-- ============================================
-- ENUMS
-- ============================================

-- Lead temperature (how hot is this lead?)
CREATE TYPE lead_temperature AS ENUM (
  'hot',      -- Ready to buy NOW, asking for pricing/call
  'warm',     -- Interested but not urgent, "send me info"
  'cool',     -- Maybe later, "not right now", timing issue
  'cold',     -- Not interested, wrong fit
  'dead'      -- Unsubscribe, bounce, do not contact
);

-- Lead intent (what do they want?)
CREATE TYPE lead_intent AS ENUM (
  'book_call',      -- Wants to schedule a call
  'pricing',        -- Asking about pricing/packages
  'more_info',      -- Wants more information
  'timing_later',   -- Interested but not now
  'referral',       -- Referring to someone else
  'question',       -- Has a question (not buying signal)
  'objection',      -- Has concerns/objections
  'not_fit',        -- Wrong person/company
  'out_of_office',  -- OOO auto-reply
  'unsubscribe'     -- Wants off the list
);

-- Pipeline stage
CREATE TYPE pipeline_stage AS ENUM (
  'new',                -- Just came in
  'classified',         -- Triage ran
  'dashboard_created',  -- GOAP prospect created
  'outreach_sent',      -- Initial response sent
  'nurture',            -- In follow-up sequence
  'engaged',            -- They replied to follow-up
  'qualified',          -- Ready for sales call
  'meeting_scheduled',  -- Call booked
  'proposal_sent',      -- Sent pricing/proposal
  'won',                -- Converted to client
  'lost',               -- Lost deal
  'paused',             -- Temporarily paused
  'disqualified'        -- Not a fit, removed
);

-- Sequence type (which follow-up track?)
CREATE TYPE sequence_type AS ENUM (
  'hot_lead',       -- Fast, aggressive follow-up (1, 2, 4 days)
  'warm_lead',      -- Standard nurture (3, 7, 14 days)
  'cool_lead',      -- Slow drip (7, 14, 30, 60 days)
  'reactivation',   -- Win-back old leads
  'post_meeting',   -- After a call
  'custom'          -- Manual/custom sequence
);

-- ============================================
-- CORE TABLES
-- ============================================

-- Main leads table
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identity
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT GENERATED ALWAYS AS (
    COALESCE(first_name || ' ' || last_name, first_name, last_name, email)
  ) STORED,
  
  -- Company info
  company TEXT,
  title TEXT,
  website TEXT,
  linkedin_url TEXT,
  
  -- Classification
  temperature lead_temperature DEFAULT 'warm',
  intent lead_intent,
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  
  -- Pipeline
  stage pipeline_stage DEFAULT 'new',
  
  -- Source tracking
  source TEXT,  -- 'bison', 'instantly', 'manual', 'inbound'
  source_client TEXT,  -- Bison client name
  source_campaign_id TEXT,
  source_campaign_name TEXT,
  source_lead_id TEXT,
  
  -- GOAP integration
  goap_prospect_id UUID,
  goap_dashboard_url TEXT,
  goap_sheet_url TEXT,
  
  -- Sequence tracking
  current_sequence sequence_type,
  sequence_step INT DEFAULT 0,
  sequence_paused BOOLEAN DEFAULT FALSE,
  next_followup_at TIMESTAMPTZ,
  
  -- Engagement stats
  emails_sent INT DEFAULT 0,
  emails_opened INT DEFAULT 0,
  emails_replied INT DEFAULT 0,
  last_contacted_at TIMESTAMPTZ,
  last_replied_at TIMESTAMPTZ,
  
  -- Notes & tags
  notes TEXT,
  tags TEXT[],
  
  -- Ownership
  assigned_to TEXT,  -- Agent or human owner
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(email, source_client)
);

-- Activity log (every interaction)
CREATE TABLE lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- What happened
  activity_type TEXT NOT NULL,  -- 'email_received', 'email_sent', 'classified', 'dashboard_created', 'stage_changed', 'note_added'
  
  -- Details
  description TEXT,
  metadata JSONB,  -- Flexible storage for activity-specific data
  
  -- Who did it
  actor TEXT,  -- 'triage', 'scout', 'bison', 'human:jonathan'
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email messages (full history)
CREATE TABLE lead_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Direction
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  
  -- Content
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  
  -- Threading
  thread_id TEXT,
  in_reply_to TEXT,
  message_id TEXT,
  
  -- Source details
  from_email TEXT,
  to_email TEXT,
  
  -- Classification (for inbound)
  classification JSONB,  -- Full Triage output
  
  -- Status
  status TEXT DEFAULT 'sent',  -- 'draft', 'queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  
  -- Source
  source TEXT,  -- 'bison', 'gmail', 'manual'
  source_message_id TEXT,
  
  -- Timestamps
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Follow-up sequences (templates)
CREATE TABLE sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identity
  name TEXT NOT NULL,
  type sequence_type NOT NULL,
  description TEXT,
  
  -- Settings
  enabled BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sequence steps
CREATE TABLE sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  
  -- Order
  step_number INT NOT NULL,
  
  -- Timing
  delay_days INT NOT NULL,  -- Days after previous step (or after sequence start for step 1)
  delay_hours INT DEFAULT 0,  -- Additional hours
  
  -- Content
  subject_template TEXT,
  body_template TEXT NOT NULL,
  
  -- Conditions
  skip_if_replied BOOLEAN DEFAULT TRUE,
  skip_if_opened BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(sequence_id, step_number)
);

-- Lead sequence progress
CREATE TABLE lead_sequence_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES sequences(id),
  
  -- Progress
  current_step INT DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'stopped')),
  paused_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  stopped_reason TEXT,
  
  -- Next action
  next_step_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(lead_id, sequence_id)
);

-- ============================================
-- INDEXES
-- ============================================

-- Leads
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_stage ON leads(stage);
CREATE INDEX idx_leads_temperature ON leads(temperature);
CREATE INDEX idx_leads_source ON leads(source, source_client);
CREATE INDEX idx_leads_next_followup ON leads(next_followup_at) WHERE next_followup_at IS NOT NULL;
CREATE INDEX idx_leads_goap ON leads(goap_prospect_id) WHERE goap_prospect_id IS NOT NULL;

-- Activities
CREATE INDEX idx_activities_lead ON lead_activities(lead_id);
CREATE INDEX idx_activities_type ON lead_activities(activity_type);
CREATE INDEX idx_activities_created ON lead_activities(created_at);

-- Emails
CREATE INDEX idx_emails_lead ON lead_emails(lead_id);
CREATE INDEX idx_emails_direction ON lead_emails(direction);
CREATE INDEX idx_emails_thread ON lead_emails(thread_id);

-- Sequence progress
CREATE INDEX idx_progress_lead ON lead_sequence_progress(lead_id);
CREATE INDEX idx_progress_next ON lead_sequence_progress(next_step_at) WHERE status = 'active';

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sequences_updated_at BEFORE UPDATE ON sequences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER progress_updated_at BEFORE UPDATE ON lead_sequence_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Log stage changes
CREATE OR REPLACE FUNCTION log_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO lead_activities (lead_id, activity_type, description, metadata, actor)
    VALUES (
      NEW.id,
      'stage_changed',
      'Stage changed from ' || COALESCE(OLD.stage::text, 'none') || ' to ' || NEW.stage::text,
      jsonb_build_object('old_stage', OLD.stage, 'new_stage', NEW.stage),
      'system'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_stage_change AFTER UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION log_stage_change();

-- ============================================
-- VIEWS
-- ============================================

-- Leads needing follow-up
CREATE VIEW leads_followup_due AS
SELECT 
  l.*,
  lsp.sequence_id,
  lsp.current_step,
  lsp.next_step_at,
  s.name as sequence_name,
  ss.body_template as next_template
FROM leads l
JOIN lead_sequence_progress lsp ON l.id = lsp.lead_id
JOIN sequences s ON lsp.sequence_id = s.id
LEFT JOIN sequence_steps ss ON s.id = ss.sequence_id AND ss.step_number = lsp.current_step + 1
WHERE lsp.status = 'active'
  AND lsp.next_step_at <= NOW()
  AND l.stage NOT IN ('won', 'lost', 'disqualified');

-- Pipeline summary
CREATE VIEW pipeline_summary AS
SELECT 
  stage,
  temperature,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as new_7d,
  COUNT(*) FILTER (WHERE last_replied_at > NOW() - INTERVAL '7 days') as active_7d
FROM leads
WHERE stage NOT IN ('won', 'lost', 'disqualified')
GROUP BY stage, temperature
ORDER BY 
  CASE stage
    WHEN 'new' THEN 1
    WHEN 'classified' THEN 2
    WHEN 'dashboard_created' THEN 3
    WHEN 'outreach_sent' THEN 4
    WHEN 'nurture' THEN 5
    WHEN 'engaged' THEN 6
    WHEN 'qualified' THEN 7
    WHEN 'meeting_scheduled' THEN 8
    WHEN 'proposal_sent' THEN 9
    ELSE 10
  END,
  CASE temperature
    WHEN 'hot' THEN 1
    WHEN 'warm' THEN 2
    WHEN 'cool' THEN 3
    ELSE 4
  END;

-- Recent activity feed
CREATE VIEW recent_activity AS
SELECT 
  la.id,
  la.lead_id,
  l.full_name,
  l.company,
  l.temperature,
  l.stage,
  la.activity_type,
  la.description,
  la.actor,
  la.created_at
FROM lead_activities la
JOIN leads l ON la.lead_id = l.id
ORDER BY la.created_at DESC
LIMIT 100;

-- ============================================
-- SEED DATA: Default sequences
-- ============================================

-- Hot lead sequence (fast follow-up)
INSERT INTO sequences (id, name, type, description) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Hot Lead Fast Track', 'hot_lead', 
   'Aggressive follow-up for leads asking about pricing or wanting to book calls');

INSERT INTO sequence_steps (sequence_id, step_number, delay_days, subject_template, body_template) VALUES
  ('11111111-1111-1111-1111-111111111111', 1, 0, NULL, 
   'Hi {{first_name}},

Here''s your personalized podcast dashboard: {{dashboard_url}}

These are hand-picked based on your background in {{industry}}. I''ve highlighted the top 3 that would be perfect for you.

When works for a quick 15-min call to discuss?

Best,
{{sender_name}}'),
  ('11111111-1111-1111-1111-111111111111', 2, 1, 'Quick follow-up', 
   'Hi {{first_name}},

Just wanted to make sure you saw your podcast matches. A few of these have limited spots available.

Any questions I can answer?

{{sender_name}}'),
  ('11111111-1111-1111-1111-111111111111', 3, 3, 'Last check', 
   'Hi {{first_name}},

Circling back one more time on those podcast opportunities.

If now isn''t the right time, no worries - just let me know and I''ll check back later.

{{sender_name}}');

-- Warm lead sequence (standard nurture)
INSERT INTO sequences (id, name, type, description) VALUES
  ('22222222-2222-2222-2222-222222222222', 'Warm Lead Nurture', 'warm_lead',
   'Standard follow-up for interested but not urgent leads');

INSERT INTO sequence_steps (sequence_id, step_number, delay_days, subject_template, body_template) VALUES
  ('22222222-2222-2222-2222-222222222222', 1, 0, NULL,
   'Hi {{first_name}},

I put together a personalized list of podcasts that would be great for someone with your expertise.

Check it out here: {{dashboard_url}}

Let me know if any catch your eye!

{{sender_name}}'),
  ('22222222-2222-2222-2222-222222222222', 2, 3, 'Did you get a chance to look?',
   'Hi {{first_name}},

Quick follow-up - did you get a chance to check out those podcast matches?

Here''s the link again: {{dashboard_url}}

Happy to walk you through any of them.

{{sender_name}}'),
  ('22222222-2222-2222-2222-222222222222', 3, 7, 'These opportunities won''t last forever',
   'Hi {{first_name}},

Just a heads up - a few of the podcasts I matched you with have limited guest availability:

{{top_podcasts}}

Worth grabbing while they''re open!

{{sender_name}}'),
  ('22222222-2222-2222-2222-222222222222', 4, 14, 'Last note from me',
   'Hi {{first_name}},

This''ll be my last note about this. Your personalized dashboard is still available:

{{dashboard_url}}

Whenever the timing is right, feel free to reach out.

{{sender_name}}');

-- Cool lead sequence (slow drip)
INSERT INTO sequences (id, name, type, description) VALUES
  ('33333333-3333-3333-3333-333333333333', 'Cool Lead Long Nurture', 'cool_lead',
   'Slow drip for "not right now" leads');

INSERT INTO sequence_steps (sequence_id, step_number, delay_days, subject_template, body_template) VALUES
  ('33333333-3333-3333-3333-333333333333', 1, 0, NULL,
   'Hi {{first_name}},

No rush at all - I created a podcast dashboard for whenever you''re ready to explore guesting opportunities.

{{dashboard_url}}

I''ll check back in a few weeks!

{{sender_name}}'),
  ('33333333-3333-3333-3333-333333333333', 2, 14, 'Checking in',
   'Hi {{first_name}},

Just checking in - has anything changed on your end regarding podcast appearances?

Your dashboard is still here: {{dashboard_url}}

{{sender_name}}'),
  ('33333333-3333-3333-3333-333333333333', 3, 30, 'Quick update',
   'Hi {{first_name}},

Wanted to share that we''ve added some new podcasts that might be a great fit for you.

Take a look when you have a moment: {{dashboard_url}}

{{sender_name}}'),
  ('33333333-3333-3333-3333-333333333333', 4, 60, 'Still interested?',
   'Hi {{first_name}},

It''s been a while - are podcast appearances still on your radar?

If so, your personalized matches are ready: {{dashboard_url}}

Either way, feel free to reach out anytime.

{{sender_name}}');

-- ============================================
-- FUNCTIONS
-- ============================================

-- Classify lead and assign sequence
CREATE OR REPLACE FUNCTION classify_and_assign_lead(
  p_lead_id UUID,
  p_temperature lead_temperature,
  p_intent lead_intent,
  p_confidence DECIMAL
)
RETURNS void AS $$
DECLARE
  v_sequence_id UUID;
  v_sequence_type sequence_type;
BEGIN
  -- Determine sequence based on temperature
  CASE p_temperature
    WHEN 'hot' THEN v_sequence_type := 'hot_lead';
    WHEN 'warm' THEN v_sequence_type := 'warm_lead';
    WHEN 'cool' THEN v_sequence_type := 'cool_lead';
    ELSE v_sequence_type := NULL;
  END CASE;
  
  -- Update lead
  UPDATE leads SET
    temperature = p_temperature,
    intent = p_intent,
    confidence = p_confidence,
    stage = 'classified',
    current_sequence = v_sequence_type
  WHERE id = p_lead_id;
  
  -- Get sequence ID
  IF v_sequence_type IS NOT NULL THEN
    SELECT id INTO v_sequence_id FROM sequences WHERE type = v_sequence_type LIMIT 1;
    
    IF v_sequence_id IS NOT NULL THEN
      -- Create sequence progress
      INSERT INTO lead_sequence_progress (lead_id, sequence_id, next_step_at)
      VALUES (p_lead_id, v_sequence_id, NOW())
      ON CONFLICT (lead_id, sequence_id) DO NOTHING;
    END IF;
  END IF;
  
  -- Log activity
  INSERT INTO lead_activities (lead_id, activity_type, description, metadata, actor)
  VALUES (
    p_lead_id,
    'classified',
    'Lead classified as ' || p_temperature || ' / ' || p_intent,
    jsonb_build_object('temperature', p_temperature, 'intent', p_intent, 'confidence', p_confidence),
    'triage'
  );
END;
$$ LANGUAGE plpgsql;

-- Get next follow-ups due
CREATE OR REPLACE FUNCTION get_followups_due(p_limit INT DEFAULT 50)
RETURNS TABLE (
  lead_id UUID,
  email TEXT,
  full_name TEXT,
  company TEXT,
  temperature lead_temperature,
  sequence_name TEXT,
  step_number INT,
  body_template TEXT,
  dashboard_url TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.email,
    l.full_name,
    l.company,
    l.temperature,
    s.name,
    lsp.current_step + 1,
    ss.body_template,
    l.goap_dashboard_url
  FROM leads l
  JOIN lead_sequence_progress lsp ON l.id = lsp.lead_id
  JOIN sequences s ON lsp.sequence_id = s.id
  JOIN sequence_steps ss ON s.id = ss.sequence_id AND ss.step_number = lsp.current_step + 1
  WHERE lsp.status = 'active'
    AND lsp.next_step_at <= NOW()
    AND l.stage NOT IN ('won', 'lost', 'disqualified', 'paused')
    AND (ss.skip_if_replied = FALSE OR l.last_replied_at IS NULL OR l.last_replied_at < lsp.started_at)
  ORDER BY l.temperature, lsp.next_step_at
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Record sent follow-up and advance sequence
CREATE OR REPLACE FUNCTION record_followup_sent(
  p_lead_id UUID,
  p_sequence_id UUID,
  p_message_id TEXT DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_current_step INT;
  v_max_step INT;
  v_next_delay INT;
BEGIN
  -- Get current step
  SELECT current_step INTO v_current_step
  FROM lead_sequence_progress
  WHERE lead_id = p_lead_id AND sequence_id = p_sequence_id;
  
  -- Get max step
  SELECT MAX(step_number) INTO v_max_step
  FROM sequence_steps WHERE sequence_id = p_sequence_id;
  
  -- Get next delay
  SELECT delay_days INTO v_next_delay
  FROM sequence_steps
  WHERE sequence_id = p_sequence_id AND step_number = v_current_step + 2;
  
  -- Update progress
  IF v_current_step + 1 >= v_max_step THEN
    -- Sequence complete
    UPDATE lead_sequence_progress SET
      current_step = v_current_step + 1,
      status = 'completed',
      completed_at = NOW(),
      next_step_at = NULL
    WHERE lead_id = p_lead_id AND sequence_id = p_sequence_id;
    
    UPDATE leads SET stage = 'nurture' WHERE id = p_lead_id;
  ELSE
    -- Advance to next step
    UPDATE lead_sequence_progress SET
      current_step = v_current_step + 1,
      next_step_at = NOW() + (v_next_delay || ' days')::INTERVAL
    WHERE lead_id = p_lead_id AND sequence_id = p_sequence_id;
  END IF;
  
  -- Update lead stats
  UPDATE leads SET
    emails_sent = emails_sent + 1,
    last_contacted_at = NOW()
  WHERE id = p_lead_id;
  
  -- Log activity
  INSERT INTO lead_activities (lead_id, activity_type, description, metadata, actor)
  VALUES (
    p_lead_id,
    'email_sent',
    'Follow-up email sent (step ' || (v_current_step + 1) || ')',
    jsonb_build_object('step', v_current_step + 1, 'message_id', p_message_id),
    'scout'
  );
END;
$$ LANGUAGE plpgsql;

-- Handle inbound reply (stop sequence if active)
CREATE OR REPLACE FUNCTION handle_inbound_reply(
  p_lead_id UUID,
  p_new_temperature lead_temperature DEFAULT NULL,
  p_new_intent lead_intent DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- Stop any active sequences
  UPDATE lead_sequence_progress SET
    status = 'stopped',
    stopped_reason = 'Lead replied'
  WHERE lead_id = p_lead_id AND status = 'active';
  
  -- Update lead
  UPDATE leads SET
    emails_replied = emails_replied + 1,
    last_replied_at = NOW(),
    stage = 'engaged',
    temperature = COALESCE(p_new_temperature, temperature),
    intent = COALESCE(p_new_intent, intent)
  WHERE id = p_lead_id;
  
  -- Log activity
  INSERT INTO lead_activities (lead_id, activity_type, description, actor)
  VALUES (p_lead_id, 'reply_received', 'Lead replied - sequence stopped', 'system');
END;
$$ LANGUAGE plpgsql;
