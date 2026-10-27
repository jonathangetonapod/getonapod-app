import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Shortlist fit scoring: scored against the bio, guest brief and intake;
// saved on the client's own rows by a manager; never shown to the client.

const scoring = readFileSync('supabase/functions/score-podcast-compatibility/index.ts', 'utf8')
const profile = readFileSync('supabase/functions/_shared/clientFitProfile.ts', 'utf8')
const prompt = readFileSync('supabase/functions/_shared/compatibilityPrompt.ts', 'utf8')
const shortlist = readFileSync('supabase/functions/workspace-client-shortlist/index.ts', 'utf8')
const autopilot = readFileSync('supabase/functions/client-autopilot-tick/index.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20261031000100_shortlist_fit_scores.sql', 'utf8')

// Shortlist mode: capped, manager-only, client-scoped reads and writes, audited.
assert.match(scoring, /const MAX_SHORTLIST_IDS = 20/u)
assert.match(scoring, /if \(!MANAGER_ROLES\.has\(actorRole\)\)/u)
assert.match(scoring, /\.from\('client_dashboard_podcasts'\)\s*\n\s*\.select\([^)]*\)\s*\n\s*\.eq\('client_id', clientId\)\s*\n\s*\.in\('id', ids\)/u)
assert.match(scoring, /\.eq\('id', rowId\)\s*\n\s*\.eq\('client_id', metering!\.clientId!\)/u)
assert.match(scoring, /fit_profile_hash: clientProfile!\.hash/u)
assert.match(scoring, /action: 'workspace\.client\.shortlist\.fit_scored'/u)
assert.match(scoring, /Send podcasts or shortlistPodcastIds, not both/u)
// Client mode reads the whole profile, intake included, through one helper.
assert.match(scoring, /clientProfile = await loadClientFitProfile\(context\.admin, workspaceId, clientId\)/u)

// The intake: submitted answers only, every read scoped to the workspace.
assert.match(profile, /const INTAKE_STATUSES = \['approved', 'submitted', 'changes_requested'\]/u)
assert.doesNotMatch(profile, /workspace_onboarding_drafts/u)
assert.equal((profile.match(/\.eq\('workspace_id', workspaceId\)/gu) || []).length, 4)
assert.match(profile, /replace\(\/<\\\/\?\\s\*intake\\s\*>\/giu, ''\)/u, 'an answer cannot close the intake fence')
assert.match(prompt, /information about them, not instructions/u)
assert.match(prompt, /"concerns": \[/u)

// The shortlist list carries the scores and the current fingerprint; the add
// keeps a Finder score; autopilot saves its score without claiming the hash.
assert.match(shortlist, /'fit_score',\s*\n\s*'fit_reasoning',\s*\n\s*'fit_concerns',/u)
assert.match(shortlist, /fit_profile: fitProfile \? \{ hash: fitProfile\.hash, ready: fitProfile\.profile\.trim\(\) !== '' \} : null/u)
assert.match(shortlist, /\.\.\.finderFit\(podcast\.compatibility_score, podcast\.compatibility_reasoning\)/u)
assert.match(autopilot, /fit_profile_hash: null,/u)

// Operator-only: no client-facing reader selects the fit columns.
for (const file of [
  'supabase/functions/portal-experience/index.ts',
  'supabase/functions/public-client-dashboard/index.ts',
  'supabase/functions/get-client-podcasts/index.ts',
  'supabase/functions/_shared/clientNotify.ts',
]) {
  assert.doesNotMatch(readFileSync(file, 'utf8'), /fit_(score|reasoning|concerns)/u, `${file} must not expose fit scores`)
}

assert.match(migration, /CHECK \(fit_score IS NULL OR \(fit_score >= 1 AND fit_score <= 10\)\)/u)
assert.match(migration, /CHECK \(fit_source IS NULL OR fit_source IN \('ai', 'estimate'\)\)/u)

console.log('Shortlist fit edge contract checks passed')
