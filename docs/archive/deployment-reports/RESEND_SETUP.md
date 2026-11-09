# Resend Email Deliverability Setup Guide

This guide will help you set up maximum email deliverability for Get On A Pod using Resend.

## 1. Domain Verification in Resend

### Step 1: Add Domain to Resend

**⚠️ Use a Subdomain (Recommended)**

Instead of using your root domain (`getonapod.com`), use a subdomain like `mail.getonapod.com`. This:
- Protects your main domain's reputation
- Segments transactional vs marketing email
- Isolates any deliverability issues

1. Go to https://resend.com/domains
2. Click "Add Domain"
3. Enter: `mail.getonapod.com` ✅ (recommended)
   - Alternative: `send.getonapod.com` or `email.getonapod.com`
4. Choose "Send and receive"

### Step 2: Get Your DNS Records
Resend will provide you with DNS records. They will look similar to:

```
Type: TXT
Name: @
Value: resend-verification=xxx
```

```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@getonapod.com
```

```
Type: TXT
Name: @
Value: v=spf1 include:_spf.resend.com ~all
```

```
Type: TXT
Name: resend._domainkey
Value: [DKIM key provided by Resend]
```

### Step 3: Add DNS Records
Add all provided records to your DNS provider (likely where you registered getonapod.com).

**Common DNS Providers:**
- Cloudflare: DNS → Records → Add Record
- Namecheap: Domain List → Manage → Advanced DNS
- GoDaddy: DNS → My Domains → DNS Management

### Step 4: Verify Domain
1. After adding DNS records, wait 5-10 minutes for propagation
2. Return to Resend dashboard
3. Click "Verify" on your domain
4. All checks should pass:
   - ✅ SPF Record
   - ✅ DKIM Record
   - ✅ DMARC Record
   - ✅ Domain Verification

## 2. Best Sender Addresses

Use these sender addresses for different email types:

| Email Type | From Address | Reply-To | Purpose |
|------------|--------------|----------|---------|
| Portal Magic Links | `portal@mail.getonapod.com` | `jonathan@getonapod.com` | Login emails for client portal |
| Order Confirmations | `orders@mail.getonapod.com` | `support@getonapod.com` | Purchase receipts and order updates |
| Portal Invitations | `hello@mail.getonapod.com` | `jonathan@getonapod.com` | Personal touch for onboarding |
| Transactional | `notifications@mail.getonapod.com` | `support@getonapod.com` | System notifications |

**Note:** The subdomain (`mail.getonapod.com`) is used for sending, but replies go to your main domain addresses.

### Why This Matters:
- **Consistent sender = better reputation**
- **Role-based addresses = professional appearance**
- **Separate addresses = easier troubleshooting**

## 3. Email Content Best Practices

### ✅ DO:
- Use plain, simple HTML
- Include plain text version
- Add unsubscribe link (for marketing emails)
- Use your verified domain
- Include physical address (for marketing emails)
- Test emails before sending to production

### ❌ DON'T:
- Use ALL CAPS in subject lines
- Use excessive exclamation marks!!!
- Use spam trigger words (FREE, WIN, URGENT, CLICK HERE)
- Send from unverified domains
- Use URL shorteners in transactional emails
- Send to purchased email lists

## 4. Monitoring Email Delivery

### Resend Dashboard Metrics:
- **Delivered**: Emails accepted by recipient server
- **Opened**: Recipient opened the email
- **Clicked**: Recipient clicked a link
- **Bounced**: Email rejected (hard/soft bounce)
- **Complained**: Marked as spam

### Target Metrics:
- Delivery Rate: > 98%
- Open Rate: > 25% (transactional emails)
- Bounce Rate: < 2%
- Complaint Rate: < 0.1%

## 5. Webhook Setup (Automated)

We've set up webhooks to track:
- Email delivery status
- Opens and clicks
- Bounces and complaints
- All events logged to database

View logs in: Admin Dashboard → Email Logs (coming soon)

## 6. Testing Checklist

Before going live, test emails to:

- [ ] Gmail account
- [ ] Outlook/Hotmail account
- [ ] Yahoo account
- [ ] Corporate email (if available)
- [ ] Check spam folder in all tests
- [ ] Click magic links to verify they work
- [ ] Test on mobile devices

### Mail Tester
1. Send test email to: check-auth-[random]@srv1.mail-tester.com
2. Visit https://www.mail-tester.com/
3. Enter the random ID
4. Aim for 9/10 or higher score

## 7. Troubleshooting

### Emails Not Arriving
1. Check Resend logs: https://resend.com/emails
2. Verify DNS records are still correct
3. Check spam folder
4. Verify recipient email is valid
5. Check rate limits (not exceeded)

### Low Open Rates
- Subject lines may be too generic
- Emails landing in spam (check sender reputation)
- Send time optimization needed

### High Bounce Rate
- Clean your email list
- Remove invalid addresses
- Check for typos in email addresses

### Spam Complaints
- Review email content for spam triggers
- Ensure recipients opted in
- Include clear unsubscribe option

## 8. Emergency Contacts

**Resend Support:**
- Email: support@resend.com
- Docs: https://resend.com/docs
- Status: https://resend.com/status

## 9. Current Setup Status

- [x] Resend API key configured
- [ ] Domain verified in Resend
- [ ] DNS records configured
- [ ] Webhooks set up
- [ ] Email logging implemented
- [ ] Sender addresses configured

---

**Last Updated:** 2025-12-30
**Maintained By:** Get On A Pod Engineering Team
