# GOAP App - Known Issues & Improvements

Track issues, bugs, and improvements for continuous development.

---

## ✅ Resolved Issues

### Issue #001: Email Formatting - Newlines Not Rendering
**Status:** ✅ Fixed  
**Severity:** High  
**Reported:** 2026-03-12  
**Fixed:** 2026-03-12  
**Reported By:** Pablo

**Problem:**  
Emails sent through the admin/leads interface displayed as one continuous paragraph. Line breaks were not being preserved in the recipient's email client.

**Root Cause:**  
In `supabase/functions/send-reply/index.ts`, the Bison API was being called with:
```javascript
content_type: 'text'  // ❌ Plain text doesn't preserve formatting
```

**Fix Applied:**  
Changed to send as HTML with newline conversion:
```javascript
const htmlMessage = message.replace(/\n/g, '<br>')
// ...
content_type: 'html'  // ✅ HTML preserves line breaks
message: htmlMessage
```

**Files Changed:**
- `supabase/functions/send-reply/index.ts`

---

## 🔴 Active Issues

*(None currently)*

---

## 🟡 Pending Improvements

### Improvement #001: WhatsApp Notifications for New Leads
**Status:** 🟡 Pending  
**Priority:** Medium  
**Requested:** 2026-03-03

**Request:**  
Send WhatsApp notifications when lead status changes to "Responded".

**Notes:**  
Requires webhook integration with Clawdbot or similar notification service.

---

## 📝 Development Notes

- **Supabase Functions:** Deploy with `supabase functions deploy send-reply`
- **Bison API Docs:** https://send.leadgenjay.com/api/reference
- **Railway Deployment:** Auto-deploys on push to main

---

*Last Updated: 2026-03-12*
