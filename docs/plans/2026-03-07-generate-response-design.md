# Generate Response - Design

## Problem

When reviewing leads, the user has to manually write every reply. An AI-generated draft would save time.

## Solution

Add a "Generate Response" button in the reply composer that analyzes the full email thread and proposes a reply.

### Edge Function: generate-reply

- Receives: `bison_reply_id`, `name`, `email`, `company`, `lead_type`, `ai_reason`
- Fetches full thread from Bison API
- Sends thread + context to Claude Sonnet to generate an appropriate reply
- Prompt is GOAP-aware (podcast booking agency) and tailored by lead_type
- Returns generated text

### Frontend

- "Generate" button with Sparkles icon in reply composer, between Cancel and Send
- Shows spinner while generating
- Fills the textarea with the generated text
- User can edit before sending

### No database changes needed.
