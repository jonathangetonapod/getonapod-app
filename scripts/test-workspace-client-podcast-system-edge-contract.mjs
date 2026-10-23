import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/workspace-client-podcast-system/index.ts', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const service = readFileSync('src/services/clientPodcastSystem.ts', 'utf8')
const page = readFileSync('src/pages/app/WorkspaceClientPodcastSystem.tsx', 'utf8')
const layout = readFileSync('src/components/workspace/WorkspaceLayout.tsx', 'utf8')
const routes = readFileSync('src/App.tsx', 'utf8')

assert.match(edge, /requireAuthenticatedUser\(req\)/u)
assert.match(edge, /requireWorkspaceFeatureAccess\(context, workspaceId\)/u)
assert.match(edge, /requireOnlyKeys\(body, \['action', 'workspace_id', 'client_id'\]\)/u)
assert.match(edge, /from\('clients'\)[\s\S]+?\.eq\('workspace_id', workspaceId\)/u)
assert.match(edge, /from\('workspace_client_campaign_targets'\)[\s\S]+?\.eq\('workspace_id', workspaceId\)/u)
assert.match(edge, /loadForClients<\w+>\('\w+', clientIds, \(ids, from, to\) => \(\s*context\.admin\s*\.from\('client_dashboard_podcasts'\)[\s\S]+?\.in\('client_id', ids\)/u)
assert.match(edge, /loadForClients<\w+>\('\w+', clientIds, \(ids, from, to\) => \(\s*context\.admin\s*\.from\('bookings'\)[\s\S]+?\.in\('client_id', ids\)/u)
assert.match(edge, /from\('workspace_onboarding_instances'\)[\s\S]+?\.eq\('workspace_id', workspaceId\)[\s\S]+?\.in\('client_id', ids\)/u)
assert.match(edge, /const matchedBookingIds = new Set<string>\(\)/u)
assert.match(edge, /id: `booking:\$\{booking\.id\}`/u)
assert.match(edge, /loadForClients<\w+>\('\w+', clientIds, \(ids, from, to\) => \(\s*context\.admin\s*\.from\('client_podcast_analyses'\)[\s\S]+?\.in\('client_id', ids\)/u)
assert.match(edge, /from\('podcast_direct_contacts'\)/u)
assert.match(edge, /\.eq\('verification_status', 'verified'\)/u)
assert.match(edge, /source: analysisSource/u)
assert.match(edge, /email: canManage \? contactEmail : null/u)
assert.match(edge, /has_conflict: hasConflict/u)
assert.match(edge, /const readiness = aiSdrReadiness\(client\.ai_sdr_profile\)/u)
assert.match(edge, /onboarding: access\.role === 'member' \|\| !clientOnboarding \? null/u)
assert.doesNotMatch(edge, /from\('campaign_replies'\)/u)

assert.match(config, /\[functions\.workspace-client-podcast-system\]\s+verify_jwt = true/u)
assert.match(service, /functions\.invoke\('workspace-client-podcast-system'/u)
assert.match(service, /response\.workspace\.id\.toLowerCase\(\) !== canonicalWorkspaceId/u)
// The page is the cross-client work queue now ("Pipeline"); the per-client
// tabs it used to carry live on the client record, and the opportunity sheet
// is shared between the two.
assert.match(page, />Pipeline</u)
assert.match(page, /Needs attention/u)
assert.match(page, /Client record/u)
assert.doesNotMatch(page, /Private workspace overview/u)
assert.match(layout, /id: 'client-podcast-system', name: 'Pipeline'[\s\S]+enabled: true/u)
assert.match(routes, /path="\/app\/client-podcast-system"/u)
assert.match(routes, /path="\/app\/workspaces\/:workspaceId\/client-podcast-system"/u)

// Large workspaces get the newest rows and a truncated flag, never a 409.
assert.doesNotMatch(edge, /CLIENT_PODCAST_SYSTEM_LIMIT/u)
assert.match(edge, /truncated: truncatedSources\.length > 0,\s*truncated_sources: truncatedSources,/u)
assert.match(edge, /\['inbox_threads', Boolean\(threadStateError\) \|\| \(threadStateRows \|\| \[\]\)\.length >= THREAD_LIMIT\]/u)
// Client id filters go out in chunks, so no `in` list outgrows a request line.
assert.match(edge, /for \(const clientIdChunk of chunks\(clientIds\)\)/u)
assert.doesNotMatch(edge, /\.in\('client_id', clientIds\)/u)
// Every source is read newest first, so the first row per key wins.
assert.match(edge, /const targetByShortlistId = firstByKey\(targets, \(row\) => row\.shortlist_podcast_id\)/u)
assert.match(edge, /const directContactByPodcastId = firstByKey\(directContacts, \(row\) => row\.podcast_id\)/u)
assert.doesNotMatch(edge, /new Map\((?:feedback|legacyOutreach|targets|analyses|directContacts)\.map/u)
// One client's pipeline on request, for the client record.
assert.match(edge, /if \(onlyClientId\) query = query\.eq\('id', onlyClientId\)/u)
assert.match(edge, /if \(onlyClientId\) query = query\.eq\('client_id', onlyClientId\)/u)
assert.match(edge, /if \(onlyClientId\) threadQuery = threadQuery\.eq\('client_id', onlyClientId\)/u)
assert.match(service, /\.\.\.\(canonicalClientId \? \{ client_id: canonicalClientId \} : \{\}\)/u)

console.log('workspace pipeline Edge contract passed')

// The command center and Master Inbox now reach each other by host, not just
// by client. A thread records the show it came from at ingestion, so this is a
// join rather than a provider call.
// The Master Inbox is a shell plus its panes, a draft-autosave hook and shared
// thread helpers; the guarantees below may live in any of them.
const masterInbox = [
  'src/components/workspace/MasterInboxPreview.tsx',
  ...readdirSync('src/components/workspace/inbox')
    .filter((name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx'))
    .sort()
    .map((name) => `src/components/workspace/inbox/${name}`),
  'src/hooks/useInboxDraftAutosave.ts',
  'src/lib/inboxThreads.ts',
].map((path) => readFileSync(path, 'utf8')).join('\n')

assert.match(edge, /from\('workspace_inbox_thread_state'\)[\s\S]{0,220}\.eq\('workspace_id', workspaceId\)/u)
assert.match(edge, /\.not\('podcast_id', 'is', null\)/u)
assert.match(edge, /function conversationFor\(/u)
// A reply can be known from a campaign sync before the inbox has read the
// thread, and only one of those can be opened.
assert.match(edge, /thread_key: thread\?\.thread_key \?\? null/u)
assert.match(edge, /replied: replyCount > 0 \|\| Boolean\(thread\)/u)

const sheet = readFileSync('src/components/workspace/OpportunityDetailSheet.tsx', 'utf8')
assert.match(sheet, /function inboxHref\(baseHref: string, item: ClientPodcastSystemItem\)/u)
assert.match(sheet, /params\.set\('thread', item\.conversation\.thread_key\)/u)
assert.match(sheet, /Reply not read in yet/u)
// A deep-linked placement must be closeable, or it reopens on every render.
assert.match(page, /next\.delete\('podcast'\)/u)

assert.match(masterInbox, /searchParams\.get\('thread'\)/u)
assert.match(masterInbox, /thread\.thread_key === requestedThreadKey/u)
assert.match(masterInbox, /Open this placement/u)
assert.match(masterInbox, /client-podcast-system\?client=/u)

// A client's last activity is built from real events only. clients.updated_at
// moves with every edit and backfill, so it must not decide the date.
assert.match(edge, /from\('workspace_client_status_events'\)[\s\S]{0,160}\.eq\('workspace_id', workspaceId\)/u)
assert.match(edge, /from\('outreach_messages'\)[\s\S]{0,200}\.eq\('status', 'sent'\)/u)
assert.match(edge, /\.is\('podcast_id', null\)/u)
assert.match(edge, /last_activity_at: clientActivity\.get\(client\.id\) \|\| null/u)
assert.doesNotMatch(edge, /last_activity_at: latestTimestamp\(\[\s*client\.updated_at/u)
