-- Check if a specific session exists in the database.
-- Set these transaction-local values before running this diagnostic:
--   SELECT set_config('app.diagnostic_session_token_hash', '<sha256 verifier>', true);
--   SELECT set_config('app.diagnostic_client_id', '<client uuid>', true);

SELECT
  id,
  client_id,
  substring(session_token, 1, 12) || '...' AS token_verifier_preview,
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
WHERE session_token = current_setting('app.diagnostic_session_token_hash', true)
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
WHERE client_id = current_setting('app.diagnostic_client_id', true)::uuid
ORDER BY created_at DESC
LIMIT 10;
