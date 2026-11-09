-- Run this in Supabase SQL Editor to check your friend's client record

-- Replace 'their-email@example.com' with your friend's actual email
SELECT
  id,
  name,
  email,
  portal_access_enabled,
  portal_last_login_at,
  portal_invitation_sent_at,
  status
FROM clients
WHERE email ILIKE 'their-email@example.com';

-- If the query returns nothing, the client doesn't exist
-- If portal_access_enabled is false or NULL, that's why they can't get the email

-- Also check recent magic link activity:
SELECT
  cal.created_at,
  cal.action,
  cal.metadata,
  c.email
FROM client_portal_activity_log cal
JOIN clients c ON c.id = cal.client_id
WHERE c.email ILIKE 'their-email@example.com'
ORDER BY cal.created_at DESC
LIMIT 10;
