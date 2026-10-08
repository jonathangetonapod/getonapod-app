-- replay-safety: this file sorts before 20260118000003_outreach_messages.sql,
-- which creates outreach_messages. Create the table here with the exact
-- 20260118000003 definition so a fresh database can replay (20260118000002
-- also needs it); the later CREATE TABLE IF NOT EXISTS is then a no-op.
-- Production already has the table.
CREATE TABLE IF NOT EXISTS outreach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Podcast/Host Information
  podcast_id TEXT,
  podcast_name TEXT NOT NULL,
  podcast_url TEXT,
  host_name TEXT NOT NULL,
  host_email TEXT NOT NULL,
  
  -- Email Content
  subject_line TEXT NOT NULL,
  email_body TEXT NOT NULL,
  
  -- Campaign Tracking
  bison_campaign_id TEXT,
  personalization_data JSONB,
  
  -- Status Management
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'sent', 'failed', 'archived')),
  priority TEXT CHECK (priority IN ('high', 'medium', 'low')),
  
  -- Sending
  scheduled_send_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  email_platform_response JSONB,
  error_message TEXT,
  
  -- Metadata
  created_by TEXT DEFAULT 'clay',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes for performance
  CONSTRAINT outreach_messages_client_id_idx CHECK (client_id IS NOT NULL),
  CONSTRAINT outreach_messages_host_email_valid CHECK (host_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Add bison_lead_id column to track Bison leads
ALTER TABLE outreach_messages
ADD COLUMN IF NOT EXISTS bison_lead_id INTEGER;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_outreach_messages_bison_lead_id ON outreach_messages(bison_lead_id);

-- Comment
COMMENT ON COLUMN outreach_messages.bison_lead_id IS 'ID of the lead created in Bison/EmailBison system';
