-- Check if the test client exists and has proper portal access
-- Replace 'test@example.com' with the actual email you're testing with

SELECT 
  id,
  name,
  email,
  portal_access_enabled,
  CASE 
    WHEN portal_password IS NOT NULL THEN 'Password is set'
    ELSE 'NO PASSWORD SET'
  END as password_status,
  portal_invitation_sent_at,
  portal_last_login_at
FROM clients
WHERE email = 'YOUR_TEST_EMAIL_HERE'
LIMIT 1;

-- Also check if SUPABASE environment variables are set correctly
-- (You'll need to verify this in Supabase dashboard under Settings > Edge Functions)
