-- replay-safety: this file sorts before 20250126000004_sales_calls.sql, which
-- creates the table. Create it here with the exact 20250126000004 definition so
-- a fresh database can replay; the later CREATE TABLE IF NOT EXISTS is then a
-- no-op. Production already has the table.
CREATE TABLE IF NOT EXISTS sales_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id BIGINT UNIQUE NOT NULL,
  title TEXT,
  meeting_title TEXT,
  fathom_url TEXT,
  share_url TEXT,
  scheduled_start_time TIMESTAMPTZ,
  scheduled_end_time TIMESTAMPTZ,
  recording_start_time TIMESTAMPTZ,
  recording_end_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  transcript JSONB,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add call_type column to sales_calls table
CREATE TYPE call_type AS ENUM ('sales', 'non-sales', 'unclassified');

ALTER TABLE sales_calls
ADD COLUMN IF NOT EXISTS call_type call_type DEFAULT 'unclassified';

-- Create index for filtering by call type
CREATE INDEX IF NOT EXISTS idx_sales_calls_call_type ON sales_calls(call_type);
