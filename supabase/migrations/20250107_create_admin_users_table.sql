-- Create admin_users table for managing admin access
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  added_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on email for fast lookups
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);

-- Enable RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Policy: Only authenticated users can read admin_users
-- (The actual admin check happens in application code)
CREATE POLICY "Authenticated users can read admin_users"
  ON admin_users FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only service role can insert/update/delete
-- This prevents non-admin users from modifying the list
CREATE POLICY "Service role can manage admin_users"
  ON admin_users FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Insert the initial admin user
INSERT INTO admin_users (email, name, added_by)
VALUES ('jonathan@getonapod.com', 'Jonathan', 'system')
ON CONFLICT (email) DO NOTHING;
