import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The pitch recipient: one address per pitch, on every platform, chosen in
// Step 1 from the Podscan inbox, the verified host email or an address the
// operator found. These pin the parts a refactor could quietly undo — the
// server deciding what an address may claim, one address only, and no CC.

const shortlist = readFileSync('supabase/functions/workspace-client-shortlist/index.ts', 'utf8')
const campaigns = readFileSync('supabase/functions/workspace-client-campaigns/index.ts', 'utf8')
const recipients = readFileSync('supabase/functions/_shared/pitchRecipients.ts', 'utf8')
const dialog = readFileSync('src/components/workspace/ClientCampaignPrepDialog.tsx', 'utf8')
const migration = readFileSync('supabase/migrations/20261104000500_pitch_recipients.sql', 'utf8')

// Saving: exact keys, client-scoped row, server-derived source and status, audited.
const save = shortlist.match(/action === 'recipients-save'[\s\S]*?action === 'autopilot-get'/u)?.[0]
assert.ok(save, 'recipients-save action must exist')
assert.match(save, /requireOnlyKeys\(body, \['action', 'workspace_id', 'client_id', 'shortlist_podcast_id', 'recipients'\]\)/u)
assert.match(save, /\.from\('client_dashboard_podcasts'\)[\s\S]*?\.eq\('id', shortlistPodcastId\)\s*\n\s*\.eq\('client_id', clientId\)/u)
assert.match(save, /normalizeRecipients\(body\.recipients, facts\)/u)
assert.match(save, /\.eq\('verification_status', 'verified'\)/u)
assert.match(save, /action: 'workspace\.client_shortlist\.recipients_saved'/u)
// A claim the facts do not back becomes "manual"; status never comes from the request.
assert.match(recipients, /source === "verified" && facts\.verifiedEmail === email/u)
assert.match(recipients, /source === "podscan" && facts\.podscanEmails\.includes\(email\)/u)
assert.doesNotMatch(recipients, /entry\.status/u)

// One address per pitch: refused above one by the server and the database.
assert.match(recipients, /export const MAX_PITCH_RECIPIENTS = 1;/u)
assert.match(migration, /jsonb_array_length\(pitch_recipients\) <= 1/u)

// No CC anywhere: not in the send, not in the provider layer, not in the prompt.
assert.doesNotMatch(campaigns, /cc_emails|ccEmails|leadCc/u)
assert.doesNotMatch(dialog, /ccEmails|leadCc/u)
assert.doesNotMatch(recipients, /CC:/u)

// The writer greets the one recipient; the rules are code, not an editable prompt.
assert.match(shortlist, /recipientsPromptBlock\(pitchRecipients\)/u)
assert.match(recipients, /Never open with "Hi all"/u)
assert.match(shortlist, /!recipientsAffectCopy\(pitchRecipients\)/u)

// The shared network table is platform-wide and service-role only.
assert.match(migration, /ALTER TABLE public\.podcast_contact_emails FORCE ROW LEVEL SECURITY;/u)
assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.podcast_contact_emails FROM PUBLIC, anon, authenticated;/u)
assert.match(campaigns, /async function recordContactOutcome\(/u)

console.log('Pitch recipient edge contract checks passed')
