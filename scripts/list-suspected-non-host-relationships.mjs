// List relationship-book rows that are probably not podcast hosts, for a person to review.
// Read-only: it never changes a row. Remove the ones you agree with from the Relationships
// page ("Not a host, remove"), which hides them and keeps them from coming back.
// Usage: node scripts/list-suspected-non-host-relationships.mjs <env-dir> [--workspace=<uuid>] [--json]
// <env-dir> holds supabase.env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY); keep it outside the repo.
//
// A row is suspect when nothing ties it to a show: it has no catalog id (the inbox gave it a
// generated "manual-" id), its address was never a target of this workspace's own pitches, and
// the shared catalog has no show with that address. Each row lists every reason that applied.
import fs from 'node:fs'
import path from 'node:path'

const DIR = path.resolve(process.argv[2] || '.')
const JSON_OUT = process.argv.includes('--json')
const workspaceArg = process.argv.find((a) => a.startsWith('--workspace='))
const WORKSPACE = workspaceArg ? workspaceArg.split('=')[1].toLowerCase() : null
if (WORKSPACE && !/^[0-9a-f-]{36}$/u.test(WORKSPACE)) throw new Error('--workspace must be a UUID')

const env = {}
for (const line of fs.readFileSync(path.join(DIR, 'supabase.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const SB = env.SUPABASE_URL + '/rest/v1'
const SB_HEADERS = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
}

async function sbGet(pathname) {
  const res = await fetch(`${SB}${pathname}`, { headers: SB_HEADERS })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

/** Every page of a select, keyed on a stable order. */
async function sbAll(table, select, filter = '') {
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const page = await sbGet(`/${table}?select=${select}${filter}&order=workspace_id,podcast_id&limit=1000&offset=${offset}`)
    rows.push(...page)
    if (page.length < 1000) return rows
  }
}

const inList = (values) => `(${values.map((v) => `"${v.replaceAll('"', '')}"`).join(',')})`
const chunks = (values, size = 100) => {
  const out = []
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size))
  return out
}

const workspaceFilter = WORKSPACE ? `&workspace_id=eq.${WORKSPACE}` : ''
const BOOK_COLUMNS = 'workspace_id,podcast_id,podcast_name,host_name,contact_email,manual_stage,created_at'
// Rows already marked not a host are skipped. Before the dismiss migration is applied the
// column does not exist yet, and every row is still in the book.
const book = await sbAll('workspace_host_relationships', BOOK_COLUMNS, `&dismissed_at=is.null${workspaceFilter}`)
  .catch(() => sbAll('workspace_host_relationships', BOOK_COLUMNS, workspaceFilter))
const emails = [...new Set(book.flatMap((r) => (r.contact_email ? [r.contact_email.trim().toLowerCase()] : [])))]

// Which addresses this workspace pitched, and which the shared catalog knows.
const pitched = new Set()
const catalogued = new Set()
for (const batch of chunks(emails)) {
  for (const t of await sbGet(`/workspace_client_campaign_targets?select=workspace_id,normalized_contact_email&normalized_contact_email=in.${inList(batch)}&limit=5000`)) {
    pitched.add(`${t.workspace_id}:${t.normalized_contact_email}`)
  }
  for (const c of await sbGet(`/podcast_direct_contacts?select=normalized_email&normalized_email=in.${inList(batch)}&limit=5000`)) {
    catalogued.add(c.normalized_email)
  }
}

// What the saved conversation was about, so a reviewer can tell a host from a homeowner.
const threadsByRow = new Map()
for (const batch of chunks([...new Set(book.map((r) => r.podcast_id))])) {
  for (const t of await sbGet(`/workspace_host_relationship_threads?select=workspace_id,podcast_id,subject,campaign_name&podcast_id=in.${inList(batch)}${workspaceFilter}&limit=5000`)) {
    const key = `${t.workspace_id}:${t.podcast_id}`
    threadsByRow.set(key, [...(threadsByRow.get(key) ?? []), t])
  }
}

const suspects = []
for (const row of book) {
  const email = row.contact_email?.trim().toLowerCase() ?? null
  const generatedId = row.podcast_id.startsWith('manual-')
  const wasPitched = email ? pitched.has(`${row.workspace_id}:${email}`) : false
  const inCatalog = email ? catalogued.has(email) : false
  if (!generatedId || wasPitched || inCatalog) continue
  const reasons = ['no catalog show id']
  if (!row.podcast_name) reasons.push('no show name')
  reasons.push(email ? 'address never pitched by this workspace' : 'no address')
  if (email) reasons.push('address not in the podcast catalog')
  const threads = threadsByRow.get(`${row.workspace_id}:${row.podcast_id}`) ?? []
  suspects.push({
    workspace_id: row.workspace_id,
    podcast_id: row.podcast_id,
    title: row.podcast_name || row.host_name || email || '(unnamed)',
    contact_email: email,
    created_at: row.created_at,
    reasons,
    thread_subjects: threads.map((t) => t.subject).filter(Boolean),
    campaigns: [...new Set(threads.map((t) => t.campaign_name).filter(Boolean))],
  })
}

if (JSON_OUT) {
  console.log(JSON.stringify(suspects, null, 2))
} else {
  console.log(`${suspects.length} suspected non-host row(s) of ${book.length} in the book${WORKSPACE ? ` for ${WORKSPACE}` : ''}.\n`)
  for (const s of suspects) {
    console.log(`${s.title}  [${s.workspace_id} / ${s.podcast_id}]`)
    console.log(`  added ${s.created_at}; ${s.reasons.join('; ')}`)
    for (const subject of s.thread_subjects) console.log(`  thread: ${subject}`)
    for (const campaign of s.campaigns) console.log(`  campaign: ${campaign}`)
  }
}
