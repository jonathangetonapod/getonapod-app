# Leads Page Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three issues: separate AI reason from notes, fix campaign_name label, debounce notes saves.

**Architecture:** Add `ai_reason` column, update two edge functions to write to it, update the frontend to display it separately, relabel the subject field, and debounce notes with local state + useRef timer.

**Tech Stack:** Supabase (Postgres migrations, edge functions), React/TypeScript, TanStack Query

---

### Task 1: Add ai_reason column migration

**Files:**
- Create: `supabase/migrations/20260307_add_ai_reason.sql`

**Step 1: Create migration file**

```sql
-- Add ai_reason column to separate AI classification reasoning from user notes
ALTER TABLE campaign_replies
ADD COLUMN IF NOT EXISTS ai_reason TEXT;
```

**Step 2: Apply migration**

Run: `cd supabase && supabase db push` or apply via Supabase dashboard.

**Step 3: Commit**

```bash
git add supabase/migrations/20260307_add_ai_reason.sql
git commit -m "Add ai_reason column to campaign_replies"
```

---

### Task 2: Update classify-reply edge function

**Files:**
- Modify: `supabase/functions/classify-reply/index.ts:199-207`

**Step 1: Change the update call to write to ai_reason instead of notes**

Find this block (lines 199-207):
```typescript
    const { error: updateError } = await supabase
      .from('campaign_replies')
      .update({
        lead_type: classification,
        ai_confidence: confidence,
        ai_classified_at: new Date().toISOString(),
        notes: reply.notes
          ? `${reply.notes}\n\n[AI] ${reason}`
          : `[AI] ${reason}`,
      })
      .eq('id', reply_id)
```

Replace with:
```typescript
    const { error: updateError } = await supabase
      .from('campaign_replies')
      .update({
        lead_type: classification,
        ai_confidence: confidence,
        ai_classified_at: new Date().toISOString(),
        ai_reason: reason,
      })
      .eq('id', reply_id)
```

**Step 2: Commit**

```bash
git add supabase/functions/classify-reply/index.ts
git commit -m "Write AI reason to ai_reason column instead of notes"
```

---

### Task 3: Update fetch-and-classify-replies edge function

**Files:**
- Modify: `supabase/functions/fetch-and-classify-replies/index.ts:267-278` and `329-340`

**Step 1: Update the "exists but not classified" update block (lines 267-278)**

Find:
```typescript
        await supabase
          .from('campaign_replies')
          .update({
            lead_type: result.classification,
            ai_confidence: result.confidence,
            ai_classified_at: new Date().toISOString(),
            awaiting_reply: threadStatus.awaiting_reply,
            last_reply_from: threadStatus.last_reply_from,
            thread_checked_at: new Date().toISOString(),
            thread_message_count: threadStatus.thread_message_count,
            notes: `[AI] ${result.reason}`,
          })
          .eq('id', existing.id)
```

Replace `notes: \`[AI] ${result.reason}\`` with `ai_reason: result.reason`

**Step 2: Update the "brand new reply" update block (lines 329-340)**

Find:
```typescript
      await supabase
        .from('campaign_replies')
        .update({
          lead_type: result.classification,
          ai_confidence: result.confidence,
          ai_classified_at: new Date().toISOString(),
          awaiting_reply: threadStatus.awaiting_reply,
          last_reply_from: threadStatus.last_reply_from,
          thread_checked_at: new Date().toISOString(),
          thread_message_count: threadStatus.thread_message_count,
          notes: `[AI] ${result.reason}`,
        })
        .eq('id', inserted.id)
```

Replace `notes: \`[AI] ${result.reason}\`` with `ai_reason: result.reason`

**Step 3: Commit**

```bash
git add supabase/functions/fetch-and-classify-replies/index.ts
git commit -m "Write AI reason to ai_reason column in fetch-and-classify"
```

---

### Task 4: Update frontend — add ai_reason to type, show callout, fix label, debounce notes

**Files:**
- Modify: `src/pages/admin/LeadsManagement.tsx`

**Step 1: Add `ai_reason` to the CampaignReply interface (line 66)**

After `ai_confidence: 'high' | 'medium' | 'low' | null` add:
```typescript
  ai_reason: string | null
```

**Step 2: Fix campaign_name label in the detail panel (around line 874)**

Find the campaign name display section and change the `Mail` icon to show "Subject:" text:

```typescript
                  {selectedReply.campaign_name && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      Subject: {selectedReply.campaign_name}
                    </span>
                  )}
```

**Step 3: Add AI reason callout above the notes textarea (around line 1103)**

Before the notes `<div>`, insert:
```tsx
                {selectedReply.ai_reason && (
                  <div className="flex items-start gap-2 rounded-lg bg-purple-50 border border-purple-200 p-3">
                    <Sparkles className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-purple-800">{selectedReply.ai_reason}</p>
                  </div>
                )}
```

**Step 4: Debounce notes — add local state and useRef timer**

Add these imports at the top (line 1, alongside existing imports):
```typescript
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
```

After the existing state declarations (around line 187), add:
```typescript
  const [localNotes, setLocalNotes] = useState('')
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

Add an effect to sync local notes when selected reply changes (after the state block):
```typescript
  useEffect(() => {
    setLocalNotes(selectedReply?.notes || '')
  }, [selectedReply?.id, selectedReply?.notes])

  useEffect(() => {
    return () => {
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    }
  }, [])
```

Add a debounced notes handler:
```typescript
  const handleNotesChange = useCallback(
    (id: string, value: string) => {
      setLocalNotes(value)
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
      notesTimerRef.current = setTimeout(() => {
        updateReply(id, { notes: value } as any)
      }, 500)
    },
    [updateReply]
  )
```

Update the notes Textarea (around line 1105-1111) — change `value` and `onChange`:

From:
```tsx
                  <Textarea
                    placeholder="Add notes..."
                    value={selectedReply.notes || ''}
                    onChange={(e) => updateReply(selectedReply.id, { notes: e.target.value } as any)}
                    rows={2}
                    className="text-sm"
                  />
```

To:
```tsx
                  <Textarea
                    placeholder="Add notes..."
                    value={localNotes}
                    onChange={(e) => handleNotesChange(selectedReply.id, e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
```

**Step 5: Commit**

```bash
git add src/pages/admin/LeadsManagement.tsx
git commit -m "Separate AI reason from notes, fix subject label, debounce notes"
```

---

### Task 5: Deploy edge functions

**Step 1: Deploy updated functions**

```bash
supabase functions deploy classify-reply
supabase functions deploy fetch-and-classify-replies
```

**Step 2: Verify by testing in the UI**

- Open /admin/leads
- Click a reply — verify AI reason callout appears (purple box) separately from notes
- Verify "Subject:" label shows instead of campaign icon
- Type in notes — verify no rapid flicker/saves, only saves after 500ms pause
- Click "AI Reclassify" on a reply — verify new reason appears in callout, notes untouched
