# Debug Client Login Issues

## Step 1: Check Client Record in Supabase

Run this SQL in Supabase SQL Editor (https://supabase.com/dashboard/project/ysjwveqnwjysldpfqzov/sql/new):

```sql
-- Replace with the actual email you're testing with
SELECT 
  id,
  name,
  email,
  portal_access_enabled,
  CASE 
    WHEN portal_password IS NOT NULL AND portal_password != '' 
    THEN 'Password SET: ' || LEFT(portal_password, 3) || '...'
    ELSE '❌ NO PASSWORD'
  END as password_status,
  LENGTH(portal_password) as password_length,
  portal_invitation_sent_at,
  portal_last_login_at,
  created_at
FROM clients
WHERE email = 'YOUR_EMAIL_HERE'
LIMIT 1;
```

## Step 2: Check Edge Function Logs

1. Go to: https://supabase.com/dashboard/project/ysjwveqnwjysldpfqzov/functions/login-with-password/logs
2. Try logging in
3. Look for these log entries:
   - `[LOGIN] ========== FUNCTION INVOKED ==========`
   - `[LOGIN] Request received for email: ...`
   - Any error messages

## Step 3: Verify Environment Variables

Go to: https://supabase.com/dashboard/project/ysjwveqnwjysldpfqzov/settings/functions

Check these exist:
- ✅ SUPABASE_URL
- ✅ SUPABASE_SERVICE_ROLE_KEY

## Common Issues:

- **401 from client not found**: Email doesn't exist or typo
- **401 from wrong password**: Password doesn't match (passwords are plain text)
- **403 from access disabled**: portal_access_enabled = false
- **403 from no password**: portal_password is NULL or empty
- **500 from env vars**: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY
