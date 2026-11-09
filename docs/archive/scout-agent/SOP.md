# SDR Agent (Scout) - Standard Operating Procedure

## Overview

Scout is an automated Sales Development Representative that handles inbound email replies from podcast booking campaigns.

---

## Pipeline Flow

```
Bison (email reply)
    ↓ every 10 min
Triage (Claude classification)
    ↓
Supabase (store)
    ↓
Twenty CRM (contact, company, note, opportunity @ LEAD)
    ↓
Scout SDR Agent
    ↓
Create GOAP Dashboard
    ↓
Draft reply → Human review → Send
    ↓
Twenty CRM (opportunity → REPLIED)
```

## Twenty CRM Stages

| Stage | Meaning | Who Moves It |
|-------|---------|--------------|
| **LEAD** | Reply received, needs response | Labeler (auto) |
| **REPLIED** | We sent dashboard reply | Scout (auto) |
| **IN_CONVERSATION** | They replied back | Manual |
| **1ST_MEETING_SCHEDULED** | Call booked | Manual/Calendly |
| **2ND_MEETING_SCHEDULED** | Follow-up call | Manual |
| **INVOICE_SENT** | Sent package invoice | Manual |
| **CLOSED_WON** | They paid! 🎉 | Manual |
| **CLOSED_LOST** | Didn't convert | Manual |
| **COLD** | Went silent | Manual |

---

## Lead Classification

Scout receives pre-classified leads from the Bison labeler:

| Temperature | Meaning | Response Priority |
|-------------|---------|-------------------|
| 🔥 **HOT** | Ready to buy (pricing, book call) | IMMEDIATE (< 5 min) |
| 🌡️ **WARM** | Interested, has questions | Fast (< 1 hour) |
| ❄️ **COOL** | Maybe later, timing issue | Same day |
| 🧊 **COLD** | Not interested (but polite) | Optional |
| ❌ **Skip** | Unsubscribe, auto-reply | No response |

---

## Response Strategies

### 🔥 HOT Lead Response

**Goal:** Move to call/sale immediately

**Actions:**
1. Create prospect dashboard in GOAP
2. Match podcasts for their profile
3. Draft reply with:
   - Pricing packages
   - Dashboard link
   - Call-to-action (book call or choose package)

**Template:**
```
Hi {{first_name}},

Great question! Here are our packages:

| Package | Placements | Price |
|---------|------------|-------|
| Starter | 3 podcasts | $2,500 |
| Growth | 6 podcasts | $4,500 |
| Authority | 12 podcasts | $8,000 |

I put together a personalized list of podcast matches for you:
{{dashboard_link}}

Want to jump on a quick call to discuss which package fits best?

[signature]
```

---

### 🌡️ WARM Lead Response

**Goal:** Answer their question, build interest

**Actions:**
1. Address their specific question
2. Offer to create personalized dashboard
3. Soft close toward next step

**Template:**
```
Hi {{first_name}},

Great question about {{their_question}}.

{{answer_their_question}}

I can put together a personalized list of podcasts that would be perfect for someone with your background in {{their_area}}. Want me to create that for you?

[signature]
```

---

### ❄️ COOL Lead Response

**Goal:** Acknowledge timing, stay in touch

**Actions:**
1. Acknowledge their timing concern
2. Offer to follow up later
3. Leave door open

**Template:**
```
Hi {{first_name}},

Totally understand - timing is everything.

I'll check back in {{timeframe}} to see if things have freed up. In the meantime, feel free to reach out if anything changes.

[signature]
```

---

### 🧊 COLD Lead Response

**Goal:** Be gracious, leave door open

**Actions:**
1. Thank them for their response
2. No hard sell
3. Brief and professional

**Template:**
```
Hi {{first_name}},

Thanks for letting me know - I appreciate the response.

If things change down the road, feel free to reach out. Wishing you all the best!

[signature]
```

---

## Draft Review Process

### Where Drafts Go

Scout outputs drafted replies that need human review before sending.

**Current:** Drafts in session transcript
**Recommended:** Save to `~/drafts/` folder or Slack channel

### Review Checklist

Before sending any draft:

- [ ] Name spelled correctly?
- [ ] Company/role accurate?
- [ ] Pricing current and correct?
- [ ] Dashboard link works (if included)?
- [ ] Tone appropriate for their temperature?
- [ ] No AI-sounding phrases?

### Approval Flow

```
Scout drafts reply
    ↓
Saved to review queue
    ↓
Human reviews (< 5 min for HOT)
    ↓
Approved → Send via Bison
    OR
Edited → Send via Bison
    OR
Rejected → Note reason, don't send
```

---

## Follow-Up Sequences

After initial response, automated follow-ups:

| Day | Status | Action |
|-----|--------|--------|
| 0 | Dashboard sent | Initial reply with dashboard |
| 3 | No reply | Follow-up #1 (gentle nudge) |
| 7 | Still no reply | Follow-up #2 (highlight top podcasts) |
| 14 | Still no reply | Follow-up #3 (final, close loop) |

### Follow-Up #1 (Day 3)
```
Hi {{first_name}},

Quick follow-up - did you get a chance to look at the podcast matches I sent?

{{dashboard_link}}

Happy to walk you through any of them!

[signature]
```

### Follow-Up #2 (Day 7)
```
Hi {{first_name}},

Just checking in. A few shows that would be great for you:

• {{podcast_1}}
• {{podcast_2}}
• {{podcast_3}}

Let me know if any catch your eye!

[signature]
```

### Follow-Up #3 (Day 14)
```
Hi {{first_name}},

This is my last note. Your dashboard is still here if you want to explore:

{{dashboard_link}}

Feel free to reach out whenever you're ready.

Best,
[signature]
```

---

## Tools & Integrations

### BridgeKit MCP

Access via mcporter:
```bash
mcporter call --http-url "$BRIDGEKIT_URL" <tool_name> arg=value
```

**GOAP Tools:**
- `create_prospect` - Create dashboard
- `match_podcasts_for_prospect` - AI podcast matching
- `run_ai_analysis_for_prospect` - Generate fit reasons
- `toggle_prospect_publish` - Publish dashboard

**Bison Tools:**
- `get_bison_leads` - View leads
- `reply_to_email` - Send via Bison thread

**Email Tools:**
- `send_email` - Direct email send

### Twenty CRM

Leads automatically sync with:
- Contact record
- Company record
- Note with full context
- Opportunity (HOT/WARM)
- Follow-up task (HOT)

### Supabase

Track prospect status:
```sql
SELECT * FROM sdr_prospects 
WHERE status = 'dashboard_sent'
AND dashboard_sent_at < NOW() - INTERVAL '3 days';
```

---

## Error Handling

### If MCP Fails

1. Note the error in draft
2. Draft reply WITHOUT dashboard link
3. Flag for human to create dashboard manually
4. Include pricing info directly

### If Classification Seems Wrong

1. Review the original reply
2. Override if needed
3. Log the correction for training

### If Unsure How to Respond

1. Don't send anything
2. Escalate to Clawd (main agent)
3. Flag as "needs human review"

---

## Metrics to Track

| Metric | Target |
|--------|--------|
| Response time (HOT) | < 5 min |
| Response time (WARM) | < 1 hour |
| Draft approval rate | > 90% |
| Reply rate after dashboard | > 30% |
| Conversion to call | > 15% |

---

## Daily Checklist

### Morning
- [ ] Check for overnight HOT leads (respond ASAP)
- [ ] Review pending drafts
- [ ] Check follow-up queue

### Throughout Day
- [ ] Monitor for new leads (auto every 10 min)
- [ ] Review and approve drafts
- [ ] Handle escalations

### End of Day
- [ ] Clear draft queue
- [ ] Note any issues for tomorrow
- [ ] Check follow-up stats

---

## Escalation Triggers

Escalate to human (Clawd → Jonathan) when:

1. **High-value prospect** - Fortune 500, celebrity, major influencer
2. **Unusual request** - Not covered by templates
3. **Complaint** - Anything negative
4. **Technical failure** - Can't create dashboard, MCP down
5. **Unclear intent** - Can't tell if interested or not

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-02 | 1.0 | Initial SOP |
