-- Add 'fulfillment' to lead_type and add AI classification tracking columns

ALTER TABLE campaign_replies
DROP CONSTRAINT IF EXISTS campaign_replies_lead_type_check;

ALTER TABLE campaign_replies
ADD CONSTRAINT campaign_replies_lead_type_check
CHECK (lead_type IN ('sales', 'fulfillment', 'podcasts', 'client_podcast', 'other'));

-- Track when AI classified this reply
ALTER TABLE campaign_replies
ADD COLUMN IF NOT EXISTS ai_classified_at TIMESTAMPTZ;

-- AI confidence level
ALTER TABLE campaign_replies
ADD COLUMN IF NOT EXISTS ai_confidence TEXT CHECK (ai_confidence IN ('high', 'medium', 'low'));

-- Track who sent the last message in the thread
-- true = they replied last, we owe a response
-- false = we replied last, waiting on them
ALTER TABLE campaign_replies
ADD COLUMN IF NOT EXISTS awaiting_reply BOOLEAN DEFAULT true;

-- Who sent the last message (email address)
ALTER TABLE campaign_replies
ADD COLUMN IF NOT EXISTS last_reply_from TEXT;

-- Index for unclassified replies (for bulk reclassify)
CREATE INDEX IF NOT EXISTS idx_campaign_replies_ai_classified
ON campaign_replies(ai_classified_at)
WHERE ai_classified_at IS NULL;

-- Index for replies we owe a response to
CREATE INDEX IF NOT EXISTS idx_campaign_replies_awaiting
ON campaign_replies(awaiting_reply)
WHERE awaiting_reply = true AND archived = false;
