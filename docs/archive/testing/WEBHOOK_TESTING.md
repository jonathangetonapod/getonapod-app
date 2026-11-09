# Webhook Testing Guide

Test the onboarding webhook without going through the full onboarding flow.

## Quick Setup

### 1. Get Your Supabase Anon Key

1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **API**
4. Copy the **anon/public** key

### 2. Set Your Webhook URL

In Supabase Dashboard:
- Go to **Settings** → **Edge Functions**
- Add environment variable:
  - Name: `ONBOARDING_WEBHOOK_URL`
  - Value: Your webhook URL (e.g., https://webhook.site/your-unique-url)

### 3. Run the Test

#### Option A: Using Bash Script (Easiest)

```bash
# Make it executable
chmod +x test-webhook.sh

# Edit the script and add your anon key
nano test-webhook.sh  # Replace "your-anon-key-here" with your actual key

# Run it
./test-webhook.sh
```

#### Option B: Using Node.js

```bash
# Edit the script and add your anon key
nano test-onboarding-webhook.js  # Replace "your-anon-key-here"

# Run it
node test-onboarding-webhook.js
```

#### Option C: Using curl directly

```bash
curl -X POST "https://ysjwveqnwjysldpfqzov.supabase.co/functions/v1/create-client-account" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "bio": "Test bio for webhook testing",
    "enable_portal_access": true,
    "password": "TestPass123!",
    "send_invitation_email": false,
    "create_google_sheet": false
  }'
```

## Expected Webhook Payload

Your webhook endpoint will receive:

```json
{
  "event": "client_created",
  "timestamp": "2026-01-21T...",
  "client": {
    "id": "uuid",
    "name": "Test User",
    "email": "test@example.com",
    "bio": "...",
    "linkedin_url": "...",
    "website": "...",
    "calendar_link": "...",
    "contact_person": "...",
    "status": "active",
    "notes": "...",
    "photo_url": null
  },
  "access": {
    "portal_url": "https://getonapod.com/portal/login",
    "portal_email": "test@example.com",
    "portal_password": "TestPass123!",
    "portal_access_enabled": true
  },
  "dashboard": {
    "enabled": true,
    "slug": "test-user",
    "url": "https://getonapod.com/client/test-user"
  },
  "google_sheet": {
    "created": false,
    "url": null,
    "error": null
  },
  "invitation_sent": false
}
```

## Testing Services

Use these to catch the webhook:

- **Webhook.site**: https://webhook.site (instant, free)
- **RequestBin**: https://requestbin.com
- **Beeceptor**: https://beeceptor.com

Just copy the URL they give you and set it as `ONBOARDING_WEBHOOK_URL`.

## Troubleshooting

**Webhook not firing?**
- Check that `ONBOARDING_WEBHOOK_URL` is set in Supabase Edge Functions settings
- Redeploy the `create-client-account` function after setting the env var
- Check Supabase Edge Functions logs for errors

**Getting 401 error?**
- Make sure you're using the anon/public key, not the service role key
- Check that the key hasn't expired

**Email already exists?**
- The test script generates unique emails using timestamps
- Or manually delete the test client from the database
