# Domain-Wide Delegation Setup Guide

This guide will enable your service account to create Google Sheets in YOUR Drive (not the service account's limited storage).

## What is Domain-Wide Delegation?

It allows your service account to **impersonate you** when making API calls, so:
- ✅ Sheets are created in YOUR Google Drive
- ✅ No service account storage quota issues
- ✅ You automatically own all created sheets
- ✅ Service account still gets write access for exports

---

## Step 1: Enable Domain-Wide Delegation

### 1.1 Get Your Service Account's Client ID

Your service account email is: `sheets-writer@goapfulfilment.iam.gserviceaccount.com`

The Client ID is in your service account JSON file. It's the `client_id` field:

```
"client_id": "110063601210293192231"
```

Copy this number.

### 1.2 Go to Google Workspace Admin Console

1. Open: https://admin.google.com
2. Log in with your `jonathan@getonapod.com` admin account

### 1.3 Navigate to API Controls

1. Click **Security** (left sidebar)
2. Click **Access and data control**
3. Click **API controls**
4. Scroll down to **Domain-wide delegation**
5. Click **MANAGE DOMAIN-WIDE DELEGATION**

### 1.4 Add Your Service Account

1. Click **Add new**
2. **Client ID**: Paste `110063601210293192231`
3. **OAuth Scopes**: Paste these two scopes (comma-separated):
   ```
   https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/drive
   ```
4. Click **AUTHORIZE**

---

## Step 2: Add Your Email to Supabase

We need to tell the Edge Function which user to impersonate:

```bash
npx supabase secrets set GOOGLE_WORKSPACE_USER_EMAIL="jonathan@getonapod.com"
```

---

## Step 3: Update the Edge Function

I'll update the code to use domain-wide delegation (next step).

---

## Verification

After setup, when you click "Create Sheet":
- ✅ Sheet will be created in jonathan@getonapod.com's Drive
- ✅ You'll see it in your Google Drive immediately
- ✅ Service account gets automatic write access
- ✅ No more storage quota errors!

---

## Troubleshooting

**Error: "Not Authorized to access this resource/api"**
- Check that you added the correct Client ID in Admin Console
- Verify both OAuth scopes are added
- Wait 15-30 minutes for changes to propagate

**Error: "Invalid grant"**
- Make sure `GOOGLE_WORKSPACE_USER_EMAIL` is set correctly
- Verify the email domain matches your Google Workspace domain

**Still getting quota errors?**
- Double-check domain-wide delegation is authorized
- Try creating a test sheet manually to confirm your Drive has space
