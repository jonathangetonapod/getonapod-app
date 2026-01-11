-- Check if the specific session exists in the database
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/ysjwveqnwjysldpfqzov/sql/new

SELECT
  id,
  client_id,
  session_token,
  created_at,
  expires_at,
  last_active_at,
  CASE
    WHEN expires_at > NOW() THEN 'Valid'
    ELSE 'Expired'
  END as status,
  ip_address,
  user_agent
FROM client_portal_sessions
WHERE session_token = '3454e178-cb5b-4ff8-89e3-5cffd4ea903c'
ORDER BY created_at DESC;

-- Also check all sessions for this client
SELECT
  id,
  client_id,
  substring(session_token, 1, 20) || '...' as token_preview,
  created_at,
  expires_at,
  CASE
    WHEN expires_at > NOW() THEN 'Valid'
    ELSE 'Expired'
  END as status
FROM client_portal_sessions
WHERE client_id = 'fe2521cb-7782-4321-a065-08cdfdf319da'
ORDER BY created_at DESC
LIMIT 10;
