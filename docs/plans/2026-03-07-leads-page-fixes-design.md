# Leads Page Fixes - Design

## Problem

Three issues with the leads management page:

1. AI classification reason gets stored in the `notes` field (prefixed with `[AI]`), so manual notes overwrite it
2. `campaign_name` field actually stores the email subject, but the UI labels it as a campaign
3. Notes auto-save on every keystroke, causing excessive Supabase writes

## Solution: Approach A (Minimal Fixes)

### 1. Separate AI Reason from Notes

**Migration:** Add `ai_reason TEXT` column to `campaign_replies`.

**Backend changes:**
- `fetch-and-classify-replies/index.ts`: Write `result.reason` to `ai_reason` instead of `notes`
- `classify-reply/index.ts`: Write reason to `ai_reason` instead of `notes`

**Frontend changes:**
- Add `ai_reason: string | null` to `CampaignReply` interface
- Show AI reason as a read-only callout with Sparkles icon above the notes textarea in the detail panel
- Only displayed when `ai_reason` is non-null

### 2. Fix Campaign Name Label

**Frontend only** - no data changes:
- Change the label from campaign icon to "Subject:" with an appropriate icon
- Applies to both the detail panel header and list items where `campaign_name` is shown

### 3. Debounce Notes

**Frontend only:**
- Add local state for notes text (for instant typing feedback)
- Use `useRef` + `setTimeout` with 500ms delay before firing Supabase update
- Clear timer on unmount or when selecting a different reply
- Sync local state when `selectedReply` changes

## Files to Change

- `supabase/migrations/2026XXXX_add_ai_reason.sql` (new)
- `supabase/functions/fetch-and-classify-replies/index.ts`
- `supabase/functions/classify-reply/index.ts` (if it exists)
- `src/pages/admin/LeadsManagement.tsx`
