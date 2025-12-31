# 🚨 Sentry Error Tracking Setup

Sentry is now integrated into your application to catch and alert you about errors that users experience in real-time.

## 📋 What's Been Set Up

✅ **Frontend Error Tracking** - Catches all JavaScript errors
✅ **React Error Boundaries** - Graceful error UI for users
✅ **User Context** - Errors are tagged with client ID, email, name
✅ **Session Replay** - 10% of sessions recorded, 100% of error sessions
✅ **Performance Monitoring** - Track slow operations
✅ **Automatic Source Maps** - See exact line numbers in errors

## 🔧 Setup Instructions

### Step 1: Create a Sentry Account

1. Go to [sentry.io](https://sentry.io/signup/)
2. Sign up for a free account (50,000 errors/month free)
3. Create a new project
   - Platform: **React**
   - Project name: **Authority Built** (or your choice)

### Step 2: Get Your DSN

1. After creating the project, copy your DSN
   - It looks like: `https://xxxxxxxxxxxx@o0000000.ingest.sentry.io/0000000`
2. This is your unique identifier for this project

### Step 3: Add DSN to Environment Variables

**For Local Development:**
Add to `.env.local`:
```bash
VITE_SENTRY_DSN=https://xxxxxxxxxxxx@o0000000.ingest.sentry.io/0000000
```

**For Railway Production:**
1. Go to your Railway project dashboard
2. Click on your service
3. Go to "Variables" tab
4. Click "New Variable"
5. Add:
   - Name: `VITE_SENTRY_DSN`
   - Value: `https://xxxxxxxxxxxx@o0000000.ingest.sentry.io/0000000`
6. Redeploy your application

### Step 4: Test Error Tracking

After deploying with the DSN configured, test it:

1. **Option A: Throw a test error in console**
   ```javascript
   // Open browser console on your app
   throw new Error("Test Sentry error tracking")
   ```

2. **Option B: Add a temporary test button**
   ```tsx
   <Button onClick={() => { throw new Error("Sentry test") }}>
     Test Error
   </Button>
   ```

3. Check your Sentry dashboard - you should see the error appear within seconds!

## 📊 What You'll See in Sentry

### Error Details
- **Stack trace** - Exact line number where error occurred
- **User context** - Client ID, email, name who experienced the error
- **Browser info** - Chrome, Safari, Firefox, version
- **URL** - Which page the error happened on
- **Timestamp** - When it happened

### Session Replays
- **Video playback** - See exactly what the user did before the error
- **Console logs** - See console output during the session
- **Network requests** - See API calls that were made

### Alerts
Configure Sentry to:
- **Email you** when new errors occur
- **Slack notifications** for critical errors
- **Weekly digest** of all errors

## 🎯 Best Practices

### 1. Set Up Alerts
Go to Settings → Alerts → Create Alert Rule:
- Alert on: **Issue is first seen**
- Send to: Your email
- This way you're notified immediately of new errors

### 2. Create Releases
When you deploy, tag your release:
```bash
# Set in your environment
VITE_APP_VERSION=1.0.0
```

This helps you track which version introduced errors.

### 3. Review Weekly
- Check Sentry dashboard weekly
- Look for patterns in errors
- Fix high-frequency errors first

### 4. Ignore Known Errors
Some errors are expected (like ad blockers):
- Go to the error in Sentry
- Click "Ignore" or "Archive"
- Add ignore rules in `src/lib/sentry.ts`

## 🔍 Debugging Errors

When you see an error in Sentry:

1. **Check the stack trace** - See exactly which line caused it
2. **Look at user context** - Reproduce as that user
3. **Watch session replay** - See what they clicked
4. **Check breadcrumbs** - See API calls, navigation, clicks before error
5. **Look for similar errors** - Is it affecting many users?

## 🚫 What to Do for Justin

Since Justin mentioned this specifically:

1. **Send him the Sentry project invite**
   - Go to Settings → Members → Invite Member
   - Add his email
   - Role: Admin

2. **Show him it's working**
   - Trigger a test error
   - Send him screenshot of it in Sentry

3. **Set up Slack alerts (optional)**
   - Integrations → Slack
   - Connect your workspace
   - Route critical errors to a #alerts channel

## 📱 Common Errors to Watch For

Based on your app, watch for:

1. **Authentication failures** - Magic link issues, session expiry
2. **API errors** - Supabase Edge Function failures
3. **Cart checkout errors** - Stripe integration issues
4. **Data loading errors** - Missing podcast data, bookings not loading
5. **Permission errors** - RLS policy violations

## 🎓 Learn More

- [Sentry React Docs](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Session Replay](https://docs.sentry.io/product/session-replay/)
- [Performance Monitoring](https://docs.sentry.io/product/performance/)

## ✅ Verification Checklist

- [ ] Sentry account created
- [ ] Project created in Sentry
- [ ] DSN added to Railway environment variables
- [ ] DSN added to .env.local for development
- [ ] Application redeployed with DSN
- [ ] Test error successfully appears in Sentry
- [ ] Alert rules configured
- [ ] Justin added as admin
- [ ] Slack integration set up (optional)

---

**Status**: Sentry is installed and configured in your codebase. You just need to add the DSN to start tracking!

**Need help?** The Sentry docs are excellent and their free tier is generous.
