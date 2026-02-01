-- =====================================================
-- CAMPAIGN CLASSIFICATION SYSTEM
-- Tracks campaigns by type and stores classified replies
-- =====================================================

-- Campaign Types Enum (NULL = uncategorized, needs human input)
CREATE TYPE campaign_type AS ENUM (
  'sales',        -- Your own sales (Get On A Pod)
  'client',       -- Running for a client
  'partnership'   -- Partnership/BD outreach
);

-- Note: campaigns.type can be NULL = uncategorized (auto-discovered)

-- Campaign Actions (what to do when HOT)
CREATE TYPE hot_action AS ENUM (
  'send_dashboard',    -- Auto-send dashboard link
  'send_template',     -- Auto-send specific template
  'notify_slack',      -- Alert Slack channel
  'notify_human',      -- Queue for human review
  'forward_client'     -- Forward to client to handle
);

-- =====================================================
-- CAMPAIGNS TABLE
-- Register Bison campaigns with their type/context
-- =====================================================

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Bison mapping
  bison_campaign_id INTEGER UNIQUE,  -- From Bison API
  bison_campaign_name TEXT,          -- Auto-fetched from Bison
  
  -- Campaign context
  name TEXT,                          -- Your display name (can be NULL if auto-discovered)
  type campaign_type,                 -- NULL = uncategorized, needs human input
  client_name TEXT,                   -- If type=client, who is it for
  
  -- What to do on HOT leads (defaults to human review until categorized)
  hot_action hot_action DEFAULT 'notify_human',
  hot_template_id INTEGER,            -- Bison template ID (if send_template)
  dashboard_base_url TEXT,            -- For auto-dashboard sends
  
  -- Auto-discovery tracking
  auto_discovered BOOLEAN DEFAULT false,  -- True if system found it
  discovered_at TIMESTAMPTZ,              -- When we first saw it
  categorized_at TIMESTAMPTZ,             -- When human categorized it
  
  -- Metadata
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for Bison lookups
CREATE INDEX idx_campaigns_bison_id ON campaigns(bison_campaign_id);

-- =====================================================
-- CLASSIFIED REPLIES TABLE
-- Store every reply with its classification
-- =====================================================

CREATE TABLE IF NOT EXISTS classified_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Bison identifiers
  bison_reply_id INTEGER UNIQUE NOT NULL,
  bison_lead_id INTEGER,
  bison_campaign_id INTEGER,
  
  -- Link to our campaign (optional - may not be registered)
  campaign_id UUID REFERENCES campaigns(id),
  
  -- Reply content
  from_name TEXT,
  from_email TEXT NOT NULL,
  subject TEXT,
  text_body TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  
  -- Classification result (stored as JSONB for flexibility)
  classification JSONB NOT NULL,
  /*
    {
      "temperature": "hot",
      "intent": "send_info",
      "confidence": 0.92,
      "priority": "high",
      "signal_strength": "high",
      "buying_stage": "decision",
      "urgency": "high",
      "action": "Send dashboard immediately",
      "reasoning": "Explicit yes + request for materials"
    }
  */
  
  -- Extracted fields for easy querying
  temperature TEXT GENERATED ALWAYS AS (classification->>'temperature') STORED,
  intent TEXT GENERATED ALWAYS AS (classification->>'intent') STORED,
  confidence NUMERIC GENERATED ALWAYS AS ((classification->>'confidence')::numeric) STORED,
  priority TEXT GENERATED ALWAYS AS (classification->>'priority') STORED,
  
  -- Action tracking
  action_taken TEXT,                  -- What we did
  action_at TIMESTAMPTZ,              -- When we did it
  response_sent TEXT,                 -- What we sent (if anything)
  
  -- Follow-up tracking
  follow_up_date DATE,                -- When to follow up (for COOL leads)
  follow_up_done BOOLEAN DEFAULT false,
  
  -- Metadata
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_replies_temperature ON classified_replies(temperature);
CREATE INDEX idx_replies_campaign ON classified_replies(campaign_id);
CREATE INDEX idx_replies_bison_campaign ON classified_replies(bison_campaign_id);
CREATE INDEX idx_replies_received ON classified_replies(received_at DESC);
CREATE INDEX idx_replies_follow_up ON classified_replies(follow_up_date) WHERE follow_up_date IS NOT NULL AND NOT follow_up_done;

-- =====================================================
-- RESPONSE TEMPLATES TABLE
-- Store templates by campaign type + intent
-- =====================================================

CREATE TABLE IF NOT EXISTS response_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- When to use this template
  campaign_type campaign_type NOT NULL,
  intent TEXT NOT NULL,               -- send_info, pricing, etc
  
  -- Template content
  name TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  
  -- Variables: {first_name}, {dashboard_url}, etc
  
  -- Metadata
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_templates_type_intent ON response_templates(campaign_type, intent) WHERE active = true;

-- =====================================================
-- USEFUL VIEWS
-- =====================================================

-- Unprocessed replies (need action)
CREATE OR REPLACE VIEW v_pending_replies AS
SELECT 
  cr.*,
  c.name as campaign_name,
  c.type as campaign_type,
  c.client_name,
  c.hot_action
FROM classified_replies cr
LEFT JOIN campaigns c ON cr.campaign_id = c.id
WHERE cr.action_taken IS NULL
ORDER BY 
  CASE cr.temperature 
    WHEN 'hot' THEN 1 
    WHEN 'warm' THEN 2 
    WHEN 'cool' THEN 3 
    ELSE 4 
  END,
  cr.received_at DESC;

-- Today's hot leads
CREATE OR REPLACE VIEW v_hot_leads_today AS
SELECT * FROM classified_replies
WHERE temperature = 'hot'
  AND received_at >= CURRENT_DATE
ORDER BY received_at DESC;

-- Follow-ups due
CREATE OR REPLACE VIEW v_followups_due AS
SELECT 
  cr.*,
  c.name as campaign_name
FROM classified_replies cr
LEFT JOIN campaigns c ON cr.campaign_id = c.id
WHERE cr.follow_up_date <= CURRENT_DATE
  AND NOT cr.follow_up_done
  AND cr.temperature = 'cool'
ORDER BY cr.follow_up_date;

-- Uncategorized campaigns (need human input)
CREATE OR REPLACE VIEW v_uncategorized_campaigns AS
SELECT 
  c.*,
  COUNT(cr.id) as reply_count,
  MAX(cr.received_at) as last_reply_at
FROM campaigns c
LEFT JOIN classified_replies cr ON c.bison_campaign_id = cr.bison_campaign_id
WHERE c.type IS NULL
GROUP BY c.id
ORDER BY reply_count DESC;

-- Campaign stats (last 30 days)
CREATE OR REPLACE VIEW v_campaign_stats AS
SELECT 
  c.id,
  c.name,
  c.type,
  COUNT(*) as total_replies,
  COUNT(*) FILTER (WHERE cr.temperature = 'hot') as hot,
  COUNT(*) FILTER (WHERE cr.temperature = 'warm') as warm,
  COUNT(*) FILTER (WHERE cr.temperature = 'cool') as cool,
  COUNT(*) FILTER (WHERE cr.temperature = 'cold') as cold,
  ROUND(100.0 * COUNT(*) FILTER (WHERE cr.temperature = 'hot') / NULLIF(COUNT(*), 0), 1) as hot_rate
FROM campaigns c
LEFT JOIN classified_replies cr ON c.id = cr.campaign_id
  AND cr.received_at >= NOW() - INTERVAL '30 days'
GROUP BY c.id, c.name, c.type
ORDER BY total_replies DESC;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- SAMPLE DATA (your campaigns)
-- =====================================================

-- Register Get On A Pod (Sales) - manually categorized
INSERT INTO campaigns (bison_campaign_id, bison_campaign_name, name, type, hot_action, auto_discovered, categorized_at)
VALUES (217, 'Get On A Pod', 'Get On A Pod - Sales', 'sales', 'send_dashboard', false, NOW())
ON CONFLICT (bison_campaign_id) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  hot_action = EXCLUDED.hot_action,
  categorized_at = NOW();

-- =====================================================
-- FUNCTION: Auto-discover campaign
-- Call this when we see a new campaign_id
-- =====================================================

CREATE OR REPLACE FUNCTION discover_campaign(
  p_bison_campaign_id INTEGER,
  p_bison_campaign_name TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Check if already exists
  SELECT id INTO v_id FROM campaigns WHERE bison_campaign_id = p_bison_campaign_id;
  
  IF v_id IS NULL THEN
    -- Auto-discover: insert with NULL type (needs categorization)
    INSERT INTO campaigns (
      bison_campaign_id,
      bison_campaign_name,
      auto_discovered,
      discovered_at,
      hot_action
    ) VALUES (
      p_bison_campaign_id,
      p_bison_campaign_name,
      true,
      NOW(),
      'notify_human'  -- Default to human review until categorized
    )
    RETURNING id INTO v_id;
  END IF;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: Categorize campaign
-- Call this to set the type of an auto-discovered campaign
-- =====================================================

CREATE OR REPLACE FUNCTION categorize_campaign(
  p_bison_campaign_id INTEGER,
  p_type campaign_type,
  p_name TEXT DEFAULT NULL,
  p_client_name TEXT DEFAULT NULL,
  p_hot_action hot_action DEFAULT 'notify_human'
) RETURNS VOID AS $$
BEGIN
  UPDATE campaigns SET
    type = p_type,
    name = COALESCE(p_name, bison_campaign_name),
    client_name = p_client_name,
    hot_action = p_hot_action,
    categorized_at = NOW()
  WHERE bison_campaign_id = p_bison_campaign_id;
END;
$$ LANGUAGE plpgsql;

-- Add response templates
INSERT INTO response_templates (campaign_type, intent, name, subject, body) VALUES
('sales', 'send_info', 'Dashboard Link', 'Re: {subject}', 
'Hey {first_name},

Here''s your personalized podcast dashboard:
{dashboard_url}

Take a look and let me know if any of these shows stand out. Happy to hop on a quick call to discuss.

Best,
{sender_name}'),

('sales', 'pricing', 'Pricing Response', 'Re: {subject}',
'Hey {first_name},

Great question! Our packages start at $X for Y podcasts.

Happy to walk you through options on a quick call. Here''s my calendar: {calendar_link}

Best,
{sender_name}')
ON CONFLICT DO NOTHING;
