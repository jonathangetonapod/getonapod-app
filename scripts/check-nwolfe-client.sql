-- Check if nwolfe@quantumleaders.com exists and is configured for portal access
SELECT 
  id,
  name,
  email,
  portal_access_enabled,
  CASE 
    WHEN portal_password IS NOT NULL AND portal_password != '' 
    THEN 'Password SET: "' || portal_password || '"'
    ELSE '❌ NO PASSWORD SET'
  END as password_status,
  LENGTH(portal_password) as password_length,
  portal_invitation_sent_at,
  portal_last_login_at,
  created_at
FROM clients
WHERE email = 'nwolfe@quantumleaders.com';

-- Also check recent login attempts in activity log
SELECT 
  created_at,
  action,
  metadata,
  ip_address
FROM client_portal_activity_log
WHERE metadata->>'email' = 'nwolfe@quantumleaders.com'
ORDER BY created_at DESC
LIMIT 10;
