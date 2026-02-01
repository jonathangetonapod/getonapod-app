-- SDR Prospects Table
-- Tracks all leads through the follow-up sequence

CREATE TABLE IF NOT EXISTS sdr_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Lead info (from Bison webhook)
  lead_email TEXT NOT NULL UNIQUE,
  lead_name TEXT,
  lead_first_name TEXT,
  lead_last_name TEXT,
  lead_title TEXT,
  lead_company TEXT,
  
  -- GOAP prospect info
  goap_prospect_id UUID,
  dashboard_url TEXT,
  google_sheet_url TEXT,
  
  -- Bison campaign info
  bison_client TEXT,
  bison_campaign_id TEXT,
  bison_campaign_name TEXT,
  bison_lead_id TEXT,
  
  -- Original interaction
  original_reply TEXT,
  original_reply_at TIMESTAMPTZ,
  
  -- Classification (from Triage)
  classification TEXT CHECK (classification IN ('INTERESTED', 'NOT_INTERESTED', 'AUTOMATED', 'UNSUBSCRIBE')),
  classification_priority TEXT CHECK (classification_priority IN ('high', 'medium', 'low')),
  classification_confidence TEXT CHECK (classification_confidence IN ('high', 'medium', 'low')),
  classification_reason TEXT,
  
  -- Sequence status
  status TEXT DEFAULT 'new' CHECK (status IN (
    'new',              -- Just received, not processed
    'classified',       -- Classified but no action yet
    'dashboard_created',-- Dashboard created, not sent yet
    'dashboard_sent',   -- Initial email with dashboard sent
    'followup_1',       -- First follow-up sent
    'followup_2',       -- Second follow-up sent  
    'followup_3',       -- Final follow-up sent
    'replied',          -- Prospect replied (stop sequence)
    'booked',           -- Converted to booking
    'completed',        -- Sequence finished (no conversion)
    'unsubscribed',     -- Prospect unsubscribed
    'error'             -- Something went wrong
  )),
  
  -- Sequence timestamps
  dashboard_sent_at TIMESTAMPTZ,
  followup_1_at TIMESTAMPTZ,
  followup_2_at TIMESTAMPTZ,
  followup_3_at TIMESTAMPTZ,
  prospect_replied_at TIMESTAMPTZ,
  
  -- Follow-up intervals (configurable per prospect)
  followup_1_days INT DEFAULT 3,
  followup_2_days INT DEFAULT 7,
  followup_3_days INT DEFAULT 14,
  
  -- Metadata
  notes TEXT,
  tags TEXT[],
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sdr_prospects_status ON sdr_prospects(status);
CREATE INDEX IF NOT EXISTS idx_sdr_prospects_email ON sdr_prospects(lead_email);
CREATE INDEX IF NOT EXISTS idx_sdr_prospects_classification ON sdr_prospects(classification);
CREATE INDEX IF NOT EXISTS idx_sdr_prospects_dashboard_sent ON sdr_prospects(dashboard_sent_at) WHERE status = 'dashboard_sent';
CREATE INDEX IF NOT EXISTS idx_sdr_prospects_followup1 ON sdr_prospects(followup_1_at) WHERE status = 'followup_1';
CREATE INDEX IF NOT EXISTS idx_sdr_prospects_followup2 ON sdr_prospects(followup_2_at) WHERE status = 'followup_2';

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_sdr_prospects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sdr_prospects_updated_at ON sdr_prospects;
CREATE TRIGGER sdr_prospects_updated_at
  BEFORE UPDATE ON sdr_prospects
  FOR EACH ROW
  EXECUTE FUNCTION update_sdr_prospects_updated_at();

-- View: Prospects needing follow-up
CREATE OR REPLACE VIEW sdr_followups_due AS
SELECT 
  id,
  lead_email,
  lead_name,
  lead_company,
  goap_prospect_id,
  dashboard_url,
  status,
  CASE
    WHEN status = 'dashboard_sent' AND dashboard_sent_at < NOW() - (followup_1_days || ' days')::INTERVAL 
      THEN 'followup_1'
    WHEN status = 'followup_1' AND followup_1_at < NOW() - ((followup_2_days - followup_1_days) || ' days')::INTERVAL 
      THEN 'followup_2'
    WHEN status = 'followup_2' AND followup_2_at < NOW() - ((followup_3_days - followup_2_days) || ' days')::INTERVAL 
      THEN 'followup_3'
  END AS followup_needed,
  dashboard_sent_at,
  followup_1_at,
  followup_2_at,
  created_at
FROM sdr_prospects
WHERE status IN ('dashboard_sent', 'followup_1', 'followup_2')
  AND (
    (status = 'dashboard_sent' AND dashboard_sent_at < NOW() - (followup_1_days || ' days')::INTERVAL)
    OR (status = 'followup_1' AND followup_1_at < NOW() - ((followup_2_days - followup_1_days) || ' days')::INTERVAL)
    OR (status = 'followup_2' AND followup_2_at < NOW() - ((followup_3_days - followup_2_days) || ' days')::INTERVAL)
  );

-- View: Pipeline summary
CREATE OR REPLACE VIEW sdr_pipeline_summary AS
SELECT 
  status,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7_days,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as last_30_days
FROM sdr_prospects
GROUP BY status
ORDER BY 
  CASE status
    WHEN 'new' THEN 1
    WHEN 'classified' THEN 2
    WHEN 'dashboard_created' THEN 3
    WHEN 'dashboard_sent' THEN 4
    WHEN 'followup_1' THEN 5
    WHEN 'followup_2' THEN 6
    WHEN 'followup_3' THEN 7
    WHEN 'replied' THEN 8
    WHEN 'booked' THEN 9
    WHEN 'completed' THEN 10
    ELSE 11
  END;

-- Comments
COMMENT ON TABLE sdr_prospects IS 'Tracks leads through the automated SDR follow-up sequence';
COMMENT ON COLUMN sdr_prospects.status IS 'Current stage in the follow-up sequence';
COMMENT ON COLUMN sdr_prospects.goap_prospect_id IS 'UUID from GOAP create_prospect, used for dashboard URL';
COMMENT ON VIEW sdr_followups_due IS 'Prospects that need follow-up emails sent';
