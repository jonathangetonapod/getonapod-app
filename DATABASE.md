# SDR Database Architecture

## Overview

The SDR system uses a relational database to track leads through the full lifecycle with nuanced classification and automated multi-track sequences.

## Core Concepts

### Lead Temperature (Heat Level)
```
🔥 HOT   → Ready to buy NOW (pricing, book call)
🌡️ WARM  → Interested, not urgent (send info, sounds good)
❄️ COOL  → Not now, maybe later (timing issue)
🧊 COLD  → Not interested (rejection)
💀 DEAD  → Do not contact (unsubscribe, bounce)
```

### Lead Intent (What They Want)
```
book_call     → "Let's schedule a call"
pricing       → "What does this cost?"
more_info     → "Tell me more"
timing_later  → "Not right now, check back later"
referral      → "I'm CC'ing my VP"
question      → General question (not buying signal)
objection     → "We already have a solution"
not_fit       → "Wrong person"
out_of_office → Auto-reply
unsubscribe   → "Remove me"
```

### Pipeline Stages
```
new → classified → dashboard_created → outreach_sent → nurture
                                                         ↓
                    won ← proposal_sent ← meeting_scheduled ← qualified ← engaged
                     ↓
               lost/disqualified
```

## Tables

### `leads`
Main lead records with all attributes.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| email | TEXT | Lead's email |
| first_name, last_name | TEXT | Name |
| company, title | TEXT | Company info |
| temperature | ENUM | hot/warm/cool/cold/dead |
| intent | ENUM | What they want |
| confidence | DECIMAL | 0-1 classification confidence |
| stage | ENUM | Pipeline stage |
| goap_prospect_id | UUID | GOAP dashboard ID |
| goap_dashboard_url | TEXT | Dashboard link |
| current_sequence | ENUM | Which follow-up track |
| sequence_step | INT | Current step in sequence |
| next_followup_at | TIMESTAMP | When to send next email |

### `lead_activities`
Every interaction logged.

| Column | Type | Description |
|--------|------|-------------|
| lead_id | UUID | FK to leads |
| activity_type | TEXT | What happened |
| description | TEXT | Human readable |
| metadata | JSONB | Structured details |
| actor | TEXT | Who did it (triage/scout/human) |

### `lead_emails`
Full email history (inbound + outbound).

| Column | Type | Description |
|--------|------|-------------|
| lead_id | UUID | FK to leads |
| direction | TEXT | inbound/outbound |
| subject, body_text | TEXT | Content |
| thread_id | TEXT | Email threading |
| classification | JSONB | Triage output (for inbound) |
| status | TEXT | sent/delivered/opened/bounced |

### `sequences`
Follow-up sequence templates.

| Column | Type | Description |
|--------|------|-------------|
| name | TEXT | "Hot Lead Fast Track" |
| type | ENUM | hot_lead/warm_lead/cool_lead/etc |
| enabled | BOOL | Active or not |

### `sequence_steps`
Individual steps in a sequence.

| Column | Type | Description |
|--------|------|-------------|
| sequence_id | UUID | FK to sequences |
| step_number | INT | Order (1, 2, 3...) |
| delay_days | INT | Days after previous step |
| subject_template | TEXT | Email subject |
| body_template | TEXT | Email body with {{variables}} |
| skip_if_replied | BOOL | Stop if they replied |

### `lead_sequence_progress`
Tracks each lead's position in their sequence.

| Column | Type | Description |
|--------|------|-------------|
| lead_id | UUID | FK to leads |
| sequence_id | UUID | FK to sequences |
| current_step | INT | Where they are |
| status | TEXT | active/paused/completed/stopped |
| next_step_at | TIMESTAMP | When to send next |

## Default Sequences

### 🔥 Hot Lead Fast Track
For leads asking about pricing or wanting calls.
- Day 0: Dashboard + offer call
- Day 1: Quick follow-up
- Day 3: Last check

### 🌡️ Warm Lead Nurture
Standard follow-up for interested leads.
- Day 0: Dashboard link
- Day 3: Did you see it?
- Day 7: These won't last
- Day 14: Last note

### ❄️ Cool Lead Long Nurture
Slow drip for "not now" leads.
- Day 0: No rush, here's your dashboard
- Day 14: Checking in
- Day 30: New podcasts added
- Day 60: Still interested?

## Key Functions

### `classify_and_assign_lead(lead_id, temperature, intent, confidence)`
Sets classification and assigns to appropriate sequence.

### `get_followups_due(limit)`
Returns leads that need follow-up emails sent now.

### `record_followup_sent(lead_id, sequence_id, message_id)`
Marks a follow-up as sent, advances sequence.

### `handle_inbound_reply(lead_id, new_temperature, new_intent)`
Processes a reply - stops sequence, updates classification.

## Views

### `leads_followup_due`
Leads with follow-ups due now, with templates ready to send.

### `pipeline_summary`
Counts by stage and temperature.

### `recent_activity`
Last 100 activities across all leads.

## Template Variables

Available in sequence templates:
```
{{first_name}}     - Lead's first name
{{last_name}}      - Lead's last name  
{{full_name}}      - Combined name
{{company}}        - Company name
{{title}}          - Job title
{{dashboard_url}}  - GOAP dashboard link
{{top_podcasts}}   - List of top matched podcasts
{{sender_name}}    - Your name
{{industry}}       - Lead's industry
```

## Integration Points

### Bison → Leads
Webhook creates/updates lead record, stores original reply.

### Triage → Classification
Returns temperature, intent, confidence → updates lead.

### GOAP → Dashboard
create_prospect returns prospect_id → stored as goap_prospect_id.

### Cron → Follow-ups
Daily job queries `get_followups_due()`, sends emails, calls `record_followup_sent()`.

### Inbound Reply → Stop Sequence
New reply triggers `handle_inbound_reply()`, pauses automation.
