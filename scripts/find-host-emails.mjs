// Find hosts' work emails for catalog shows: Serper (Google search) finds the host's personal
// LinkedIn profile, Blitz turns the profile into a verified work email, and the result is saved
// to podcast_direct_contacts the same way an in-app unlock is (source_provider 'blitz', the
// profile URL as provider_reference), so every workspace sees it.
// Usage: node scripts/find-host-emails.mjs <env-dir> [--limit N] [--since YYYY-MM-DD] [--min-fit 2.5] [--dry]
// <env-dir> holds supabase.env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY), serper.env
// (SERPER_API_KEY) and blitz.env (BLITZ_API_KEY); keep it outside the repo. Resumable: every
// show tried is kept in <env-dir>/host-email-state.json and skipped on a rerun. Log in
// <env-dir>/host-email.log; live worker count in <env-dir>/host-email-concurrency.txt; --dry searches and matches but calls neither Blitz nor the database.
// Shows go best first: B2B fit and guest shows ahead, junk never. --min-fit keeps only shows Jev
// rates at least that B2B fit (2.5 = good, 3.5 = strong).
import fs from 'node:fs'
import path from 'node:path'

const DIR = path.resolve(process.argv[2] || '.')
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null }
const LIMIT = Number(arg('--limit')) || Infinity
const SINCE = arg('--since') || '2026-10-28'
const DRY = process.argv.includes('--dry')
const MIN_FIT = arg('--min-fit') === null ? null : Number(arg('--min-fit'))
// Live worker count from <env-dir>/host-email-concurrency.txt (default 6, max 30). Serper allows
// 50 searches a second; each worker makes about one search and one Blitz call a second.
const CONCURRENCY_FILE = path.join(DIR, 'host-email-concurrency.txt')
const target = () => {
  try { return Math.max(1, Math.min(30, parseInt(fs.readFileSync(CONCURRENCY_FILE, 'utf8'), 10) || 6)) } catch { return 6 }
}
// Where in-app unlocks record the workspace that paid; bulk runs are the platform's own.
const PLATFORM_WORKSPACE_ID = 'c8b2ccad-5401-4511-8d27-e3915fcd7ffd'

const env = {}
// A dry run never calls Blitz, so it can run before blitz.env exists.
for (const f of ['supabase.env', 'serper.env', ...(DRY ? [] : ['blitz.env'])]) {
  for (const line of fs.readFileSync(path.join(DIR, f), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
}
const SB = env.SUPABASE_URL + '/rest/v1'
const SB_HEADERS = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => {
  const line = `[${new Date().toISOString()}] ${a.join(' ')}`
  console.log(line)
  fs.appendFileSync(path.join(DIR, 'host-email.log'), line + '\n')
}
const STATE_FILE = path.join(DIR, DRY ? 'host-email-dry-state.json' : 'host-email-state.json')
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {}
let dirty = 0
const remember = (id, result) => {
  state[id] = result
  if (++dirty % 25 === 0) fs.writeFileSync(STATE_FILE, JSON.stringify(state))
}

async function retrying(label, fn) {
  for (let attempt = 1; ; attempt++) {
    let res
    try {
      res = await fn()
    } catch (err) {
      if (attempt >= 5) throw err
      await sleep(2000 * attempt)
      continue
    }
    if (res.ok) return res
    const text = (await res.text()).slice(0, 300)
    // A bad key or an empty account stops the run rather than marking every show not found.
    if ([401, 402, 403].includes(res.status)) throw Object.assign(new Error(`${label} ${res.status}: ${text}`), { fatal: true })
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await sleep(Math.min(5000 * 2 ** (attempt - 1), 120_000))
      continue
    }
    throw new Error(`${label} ${res.status}: ${text}`)
  }
}

// Only personal profiles, normalized the way the app stores them (hostContactDiscovery.ts).
function linkedinProfileUrl(value) {
  try {
    const url = new URL(String(value).trim())
    if (url.protocol !== 'https:' || !/^(?:www\.|[a-z]{2}\.)?linkedin\.com$/u.test(url.hostname)) return null
    if (!/^\/in\/[a-zA-Z0-9_%-]+\/?$/u.test(url.pathname)) return null
    return `https://www.linkedin.com${url.pathname.replace(/\/$/u, '')}`
  } catch { return null }
}

const fold = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
const words = (s) => fold(s).replace(/[^a-z0-9]+/g, ' ').trim()
// The show's distinctive name: no "podcast"/"show"/episode noise or a subtitle after a colon.
function coreName(name) {
  const main = String(name || '').split(/\s[|:–—-]\s|:\s/)[0]
  return words(main).replace(/\b(the|podcast|show|radio|official|with)\b/g, ' ').replace(/\s+/g, ' ').trim()
}
// A host named in the description: "hosted by Jane Doe", "your host Jane Doe", "I'm Jane Doe".
const NAME = String.raw`([A-Z][a-zA-Z'’.-]+(?:\s[A-Z][a-zA-Z'’.-]+){1,2})`
const HOST_PATTERNS = [
  new RegExp(String.raw`\b[Hh]osted by\s+(?:[a-zA-Z-]+\s+){0,3}?${NAME}`, 'u'),
  new RegExp(String.raw`\byour host[s]?,?\s+(?:is\s+)?(?:dr\.?\s+)?${NAME}`, 'iu'),
  new RegExp(String.raw`\b(?:i'?m|i am|my name is)\s+(?:dr\.?\s+)?${NAME}`, 'u'),
  new RegExp(String.raw`\bwith (?:your )?host\s+(?:dr\.?\s+)?${NAME}`, 'iu'),
]
const NOT_NAMES = /\b(the|and|podcast|show|episode|every|this|our|your|today|weekly|join)\b/i
function hostFromDescription(text) {
  const plain = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  for (const pattern of HOST_PATTERNS) {
    const m = plain.match(pattern)
    if (m && !NOT_NAMES.test(m[1])) return m[1].replace(/[.’']+$/u, '').trim()
  }
  return null
}

async function serper(q) {
  const res = await retrying('Serper', () => fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': env.SERPER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, num: 10 }),
    signal: AbortSignal.timeout(30_000),
  }))
  stats.searches++
  const body = await res.json()
  return (body.organic || []).map((r) => ({ url: linkedinProfileUrl(r.link), title: r.title || '', snippet: r.snippet || '' }))
    .filter((r) => r.url)
}

// LinkedIn result titles read "Jane Doe - Host - The Show | LinkedIn".
// Names keep letters, spaces and . ' - only: profiles add emoji and invisible direction marks.
const personFromTitle = (title) => title.split(/\s[-–|]\s/)[0].replace(/,.*$/, '')
  .replace(/[^\p{L}\s.'’-]/gu, '').replace(/\s+/g, ' ').trim()

/*
 * A profile is accepted only on evidence tying the person to this show, because each one
 * sent to Blitz spends a credit:
 * - with a host named in the description, the profile's name must be that host and the
 *   result must mention the show or podcasting. If that host is not found the show is
 *   skipped: falling back to the show's name finds guests and staff instead.
 * - without one, the result must call the person the host of this show ("host of The Show"),
 *   or the person's surname must appear in the show's own name or description.
 * A match on the show's name alone is never enough.
 */
async function findProfile(show) {
  const core = coreName(show.podcast_name)
  const host = hostFromDescription(show.podcast_description)
  const mentionsShow = (r) => core.length >= 6 && words(`${r.title} ${r.snippet}`).includes(core)
  if (host) {
    const results = await serper(`site:linkedin.com/in "${host}" ${show.podcast_name.slice(0, 80)}`)
    const hostWords = words(host).split(' ')
    const match = results.find((r) => {
      const person = words(personFromTitle(r.title))
      return hostWords.every((w) => person.includes(w))
        && (mentionsShow(r) || /\b(podcast|host|show)\b/i.test(`${r.title} ${r.snippet}`))
    })
    if (match) return { profile: match.url, host: personFromTitle(match.title), via: 'host' }
    return { profile: null, reason: 'host_not_found' }
  }
  if (core.split(' ').length < 2 || core.length < 8) return { profile: null, reason: 'name_too_generic' }
  const results = await serper(`site:linkedin.com/in "${core}" podcast host`)
  const showText = words(`${show.podcast_name} ${show.podcast_description}`)
  const surnameInShow = (r) => {
    const surname = words(personFromTitle(r.title)).split(' ').filter((w) => w.length > 2).pop()
    return Boolean(surname) && new RegExp(`\\b${surname}\\b`).test(showText)
  }
  // "Host of The Show" or "The Show host", not "host" anywhere near the show's name.
  const hostsShow = (r) => {
    const text = words(`${r.title} ${r.snippet}`)
    return [`host of ${core}`, `host of the ${core}`, `${core} host`, `${core} podcast host`, `cohost of ${core}`, `co host of ${core}`]
      .some((phrase) => text.includes(phrase))
  }
  const match = results.find((r) => mentionsShow(r) && (hostsShow(r) || surnameInShow(r)))
  if (match) return { profile: match.url, host: personFromTitle(match.title), via: 'show' }
  return { profile: null, reason: 'no_profile' }
}

// One Blitz credit per person: profiles already looked up, in this run or an earlier one, reuse
// the answer. Catalog duplicates and co-hosted networks share hosts.
const known = new Map()
async function blitzEmail(profile) {
  if (known.has(profile)) { stats.reused++; return known.get(profile) }
  const pending = lookupBlitz(profile)
  known.set(profile, pending)
  return pending
}
async function lookupBlitz(profile) {
  const res = await retrying('Blitz', () => fetch('https://api.blitz-api.ai/v2/enrichment/email', {
    method: 'POST',
    headers: { 'x-api-key': env.BLITZ_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ person_linkedin_url: profile }),
    signal: AbortSignal.timeout(30_000),
  }))
  stats.blitz++
  const body = await res.json()
  if (body.found !== true || typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(body.email)) return null
  return body.email.trim().toLowerCase()
}

async function save(show, email, profile, host) {
  const now = new Date().toISOString()
  // A show that gained a contact since the candidates were read keeps it.
  await retrying('Supabase', () => fetch(`${SB}/podcast_direct_contacts?on_conflict=podcast_id`, {
    method: 'POST',
    headers: { ...SB_HEADERS, Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({
      podcast_id: show.id, email, host_name: host || null, source_provider: 'blitz', provider_reference: profile,
      verification_status: 'verified', verified_at: now, last_verified_at: now,
      first_paid_unlock_workspace_id: PLATFORM_WORKSPACE_ID, first_paid_unlock_at: now,
    }),
    signal: AbortSignal.timeout(60_000),
  }))
}

const stats = { tried: 0, profiles: 0, emails: 0, searches: 0, blitz: 0, reused: 0, failed: 0 }

async function candidates() {
  const cols = 'id,podscan_id,podcast_name,podcast_description,jev_b2b_fit,jev_takes_guests,podcast_direct_contacts(id)'
  const rows = []
  let cursor = '00000000-0000-0000-0000-000000000000'
  for (;;) {
    const res = await retrying('Supabase', () => fetch(`${SB}/podcasts?select=${cols}&hidden_reason=is.null&created_at=gte.${SINCE}`
      + `&or=(jev_junk.is.null,jev_junk.lt.0.8)${MIN_FIT === null ? '' : `&jev_b2b_fit=gte.${MIN_FIT}`}&id=gt.${cursor}&order=id&limit=1000`, { headers: SB_HEADERS }))
    const page = await res.json()
    if (!page.length) break
    cursor = page[page.length - 1].id
    for (const r of page) if (![r.podcast_direct_contacts].flat().filter(Boolean).length && !state[r.id]) rows.push(r)
  }
  // Best first: strong B2B fit, then guest shows.
  const score = (r) => (r.jev_b2b_fit ?? 0) + ((r.jev_takes_guests ?? 0) >= 0.5 ? 1 : 0)
  return rows.sort((a, b) => score(b) - score(a))
}

async function work(show) {
  try {
    const found = await findProfile(show)
    if (!found.profile) return remember(show.id, { r: found.reason })
    stats.profiles++
    if (DRY) return remember(show.id, { r: 'dry', profile: found.profile, host: found.host, via: found.via })
    const email = await blitzEmail(found.profile)
    if (!email) return remember(show.id, { r: 'no_email', profile: found.profile })
    await save(show, email, found.profile, found.host)
    stats.emails++
    remember(show.id, { r: 'saved', profile: found.profile })
  } catch (err) {
    if (err.fatal) throw err
    stats.failed++
    log(`failed ${show.podscan_id}: ${err.message}`)
  } finally {
    stats.tried++
  }
}

async function main() {
  const res = await retrying('Supabase', () => fetch(`${SB}/podcast_direct_contacts?select=email,provider_reference&source_provider=eq.blitz&provider_reference=not.is.null`, { headers: { ...SB_HEADERS, Range: '0-99999' } }))
  for (const c of await res.json()) known.set(c.provider_reference, Promise.resolve(c.email))
  for (const x of Object.values(state)) if (x.r === 'no_email' && x.profile) known.set(x.profile, Promise.resolve(null))
  const shows = (await candidates()).slice(0, LIMIT)
  log(`${shows.length} shows to try (added since ${SINCE}${MIN_FIT === null ? '' : `, B2B fit ${MIN_FIT}+`})${DRY ? ', dry run' : ''}`)
  const started = Date.now()
  let lastReport = Date.now()
  const running = new Set()
  for (const show of shows) {
    while (running.size >= target()) await Promise.race(running)
    const job = work(show).finally(() => running.delete(job))
    running.add(job)
    if (Date.now() - lastReport > 60_000) {
      lastReport = Date.now()
      log(`progress: ${JSON.stringify(stats)}, ${target()} workers`)
    }
  }
  await Promise.all(running)
  fs.writeFileSync(STATE_FILE, JSON.stringify(state))
  log(`DONE: ${JSON.stringify({ ...stats, seconds: Math.round((Date.now() - started) / 1000) })}`)
}

main().catch((err) => {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state))
  log(`FATAL ${err.message}`)
  process.exit(1)
})
