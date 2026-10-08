-- replay-safety: this file sorts before 20250125000004_campaign_replies.sql,
-- which creates the table. Create it here with the exact 20250125000004
-- definition so a fresh database can replay; the later CREATE TABLE IF NOT
-- EXISTS is then a no-op. Production already has the table.
CREATE TABLE IF NOT EXISTS campaign_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contact Information
  email TEXT NOT NULL,
  name TEXT,
  company TEXT,

  -- Reply Details
  reply_content TEXT,
  campaign_name TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),

  -- Classification
  lead_type TEXT CHECK (lead_type IN ('sales', 'podcasts', 'other')),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'not_interested', 'converted')),

  -- Notes
  notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add Email Bison reply ID for thread fetching
ALTER TABLE campaign_replies
ADD COLUMN IF NOT EXISTS bison_reply_id INTEGER;

-- Create index for looking up by Bison reply ID
CREATE INDEX IF NOT EXISTS idx_campaign_replies_bison_reply_id ON campaign_replies(bison_reply_id);
