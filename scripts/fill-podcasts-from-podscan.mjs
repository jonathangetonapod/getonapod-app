// Fill the global `podcasts` catalog from Podscan search (service role, bypasses workspaces).
// Usage: node scripts/fill-podcasts-from-podscan.mjs <env-dir> [--dry]
// <env-dir> holds supabase.env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) and podscan.env (PODSCAN_TOKEN);
// keep it outside the repo. Resumable: progress lives in <env-dir>/state.json, log in <env-dir>/fill.log.
import fs from 'node:fs'
import path from 'node:path'

const DIR = path.resolve(process.argv[2] || '.')
const DRY = process.argv.includes('--dry')
const CONCURRENCY = Number(process.env.FILL_CONCURRENCY || 4)
const MAX_PAGES_PER_SLICE = Number(process.env.FILL_MAX_PAGES || 200)

const env = {}
for (const f of ['supabase.env', 'podscan.env']) {
  for (const line of fs.readFileSync(path.join(DIR, f), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
}
const PODSCAN = 'https://podscan.fm/api/v1'
const SB = env.SUPABASE_URL + '/rest/v1'
const SB_HEADERS = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
}

// Podscan category names, in priority order (business/investing/health first).
const WANTED = [
  'business', 'entrepreneurship', 'investing', 'health', 'marketing', 'management', 'leadership',
  'startups', 'careers', 'career-development', 'digital-marketing', 'fintech', 'cryptocurrency',
  'fitness', 'nutrition', 'mental', 'mental-health', 'alternative', 'medicine', 'wellness',
  'self-improvement', 'personal-development', 'productivity', 'non-profit', 'mindfulness',
  'technology', 'artificial-intelligence', 'education', 'how-to', 'relationships', 'parenting',
  'spirituality', 'interviews', 'science', 'society', 'culture',
]
// Everything else that takes guests, run after the core categories.
const EXTRA = [
  'news', 'daily', 'politics', 'government', 'comedy', 'sports', 'history', 'true crime', 'religion',
  'christianity', 'arts', 'food', 'travel', 'music', 'commentary', 'entertainment', 'tv', 'film', 'kids', 'family',
  'leisure', 'philosophy', 'documentary', 'personal', 'books', 'design', 'fashion', 'beauty', 'home', 'garden',
  'automotive', 'gaming-news', 'sustainability', 'climate', 'neuroscience', 'biology', 'space-exploration',
  'programming', 'cyber-security', 'remote-work', 'skill-development', 'online-learning', 'cooking',
  'photography', 'creative-writing', 'running', 'cycling', 'outdoor-sports', 'golf', 'pets', 'animals',
]
// Audience bands keep each query's result set small enough to page through fully.
const BANDS = [[1000, 2000], [2000, 3500], [3500, 6000], [6000, 10000], [10000, 25000], [25000, 100000], [100000, null]]
const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
// Business comes first in every widening step.
const BIZ = [
  'business', 'entrepreneurship', 'investing', 'marketing', 'management', 'leadership', 'startups',
  'careers', 'career-development', 'digital-marketing', 'fintech', 'cryptocurrency', 'non-profit',
]
const NON_BIZ = WANTED.filter((c) => !BIZ.includes(c))
// Keyword searches across every category, for business shows Podscan filed elsewhere.
const BIZ_QUERIES = [
  'business', 'founder OR founders OR cofounder', 'CEO OR CEOs OR executive OR executives',
  'entrepreneur OR entrepreneurs OR entrepreneurship', 'startup OR startups OR "venture capital"',
  'sales OR selling OR B2B', '"small business" OR "business owner" OR "business owners"',
  '"real estate" OR investor OR investors OR investing', 'marketing OR branding OR agency',
  'SaaS OR ecommerce OR "e-commerce" OR franchise', 'leadership OR leaders OR management',
  'finance OR wealth OR money', 'coaching OR consulting OR consultant OR coach',
]
// Industry verticals, searched across every category.
const VERTICAL_QUERIES = [
  'healthcare OR "health care" OR hospital OR hospitals OR "health system"',
  'physician OR physicians OR doctor OR doctors OR clinician OR nurse OR nursing',
  'medtech OR "digital health" OR biotech OR pharma OR "life sciences"',
  '"venture capital" OR VC OR "venture capitalist" OR "angel investor"',
  '"private equity" OR "family office" OR "mergers and acquisitions"',
  'fintech OR banking OR "wealth management" OR "financial advisor" OR RIA',
  'insurance OR insurtech OR "health insurance"',
  '"artificial intelligence" OR AI OR "machine learning"',
  'cybersecurity OR "cyber security" OR infosec',
  '"human resources" OR HR OR recruiting OR "talent acquisition"',
  'lawyer OR lawyers OR attorney OR "law firm" OR legal',
  'manufacturing OR "supply chain" OR logistics OR industrial',
  'construction OR contractor OR contractors OR "home services"',
  'dental OR dentist OR chiropractor OR "private practice"',
  'nonprofit OR philanthropy OR fundraising',
  '"commercial real estate" OR "real estate investing" OR multifamily OR landlord',
  'ecommerce OR Amazon OR Shopify OR DTC OR retail',
  'agency OR agencies OR "marketing agency" OR consulting',
]
const RECENT = { has_guests: 'true', min_last_episode_posted_at: daysAgo(90) }
const OLDER = { has_guests: 'true', min_last_episode_posted_at: daysAgo(180), max_last_episode_posted_at: daysAgo(90) }
const NO_GUEST = { has_guests: 'false', min_last_episode_posted_at: daysAgo(90) }
const SMALL_BANDS = [[500, 700], [700, 1000]]
const OLDER_BANDS = [[500, 1500], [1500, 5000], [5000, null]]
const NO_GUEST_BANDS = [[1000, 1500], [1500, 2500], [2500, 5000], [5000, 15000], [15000, null]]
// Passes run in order; each widens the net. The core passes have no key prefix so saved progress carries over.
const PASSES = [
  { name: 'vert', queries: VERTICAL_QUERIES, bands: [[500, 1000], ...BANDS], params: RECENT },
  { name: '', cats: BIZ, bands: BANDS, params: RECENT },
  { name: 'kw', queries: BIZ_QUERIES, bands: BANDS, params: RECENT },
  { name: 'small', cats: BIZ, bands: SMALL_BANDS, params: RECENT },
  { name: 'kw-small', queries: BIZ_QUERIES, bands: SMALL_BANDS, params: RECENT },
  { name: '90-180d', cats: BIZ, bands: OLDER_BANDS, params: OLDER },
  { name: 'kw-90-180d', queries: BIZ_QUERIES, bands: OLDER_BANDS, params: OLDER },
  { name: 'noguest', cats: BIZ, bands: NO_GUEST_BANDS, params: NO_GUEST },
  { name: '', cats: NON_BIZ, bands: BANDS, params: RECENT },
  { name: 'small', cats: NON_BIZ, bands: SMALL_BANDS, params: RECENT },
  { name: '90-180d', cats: NON_BIZ, bands: OLDER_BANDS, params: OLDER },
  { name: 'extra', cats: EXTRA, bands: [[1000, 3000], [3000, 10000], [10000, null]], params: RECENT },
  { name: 'noguest', cats: NON_BIZ, bands: NO_GUEST_BANDS, params: NO_GUEST },
]

const STATE_FILE = path.join(DIR, DRY ? 'dry-state.json' : 'state.json')
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : { slices: {}, stats: {} }
const saveState = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1))
const stats = Object.assign({ calls: 0, inserted: 0, refreshed: 0, seen: 0, errors: 0 }, state.stats)
state.stats = stats
const log = (...a) => {
  const line = `[${new Date().toISOString()}] ${a.join(' ')}`
  console.log(line)
  fs.appendFileSync(path.join(DIR, 'fill.log'), line + '\n')
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pauseUntil = 0
async function podscan(pathname, params = {}) {
  const url = `${PODSCAN}${pathname}?${new URLSearchParams(params)}`
  for (let attempt = 1; ; attempt++) {
    const wait = pauseUntil - Date.now()
    if (wait > 0) await sleep(wait)
    let res
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${env.PODSCAN_TOKEN}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(45_000),
      })
    } catch (err) {
      if (attempt >= 6) throw err
      await sleep(5000 * attempt)
      continue
    }
    stats.calls++
    const remaining = res.headers.get('x-ratelimit-remaining')
    if (res.status === 429) {
      // Daily or per-minute cap: wait it out (exponential up to 15 min), never skip the slice.
      const body = (await res.text()).slice(0, 200)
      const retry = Number(res.headers.get('retry-after')) || Math.min(60 * 2 ** Math.min(attempt - 1, 4), 900)
      pauseUntil = Math.max(pauseUntil, Date.now() + retry * 1000)
      log(`429 rate limited; pausing ${retry}s (remaining=${remaining}) ${body}`)
      continue
    }
    if (res.status >= 500 && attempt < 6) {
      await sleep(5000 * attempt)
      continue
    }
    if (!res.ok) throw new Error(`Podscan ${res.status}: ${(await res.text()).slice(0, 300)}`)
    if (remaining !== null && Number(remaining) < 3) {
      const reset = Number(res.headers.get('x-ratelimit-reset'))
      const resetMs = reset > 1e9 ? reset * 1000 - Date.now() : (reset || 60) * 1000
      pauseUntil = Date.now() + Math.max(resetMs, 5000)
    }
    return res.json()
  }
}

async function sb(method, pathname, body, prefer) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${SB}${pathname}`, {
      method,
      headers: { ...SB_HEADERS, ...(prefer ? { Prefer: prefer } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.ok) return res
    const text = await res.text()
    if (attempt >= 4) throw new Error(`Supabase ${res.status}: ${text.slice(0, 400)}`)
    await sleep(3000 * attempt)
  }
}

const num = (v, parse) => (v === undefined || v === null || v === '' ? null : parse(v))
const int = (v) => num(v, (x) => { const n = parseInt(x, 10); return Number.isFinite(n) ? n : null })
const float = (v) => num(v, (x) => { const n = parseFloat(x); return Number.isFinite(n) ? n : null })

// Fields Podscan owns. Counters, embeddings and enrichment columns are left alone.
function podscanFields(p) {
  const reach = p.reach || {}
  return {
    podscan_id: p.podcast_id,
    podcast_name: String(p.podcast_name).slice(0, 500),
    podcast_description: p.podcast_description || null,
    podcast_guid: p.podcast_guid || null,
    podcast_image_url: p.podcast_image_url || null,
    podcast_url: p.podcast_url || null,
    podcast_itunes_id: p.podcast_itunes_id ? String(p.podcast_itunes_id) : null,
    podcast_spotify_id: p.podcast_spotify_id || null,
    rss_url: p.rss_url || null,
    podcast_categories: p.podcast_categories || null,
    language: p.language || null,
    region: p.region || null,
    episode_count: int(p.episode_count),
    last_posted_at: p.last_posted_at || null,
    is_active: p.is_active ?? true,
    podcast_has_guests: p.podcast_has_guests ?? null,
    podcast_has_sponsors: p.podcast_has_sponsors ?? null,
    publisher_name: p.publisher_name || null,
    host_name: p.host_name || null,
    itunes_rating: float(reach.itunes?.itunes_rating_average),
    itunes_rating_count: int(reach.itunes?.itunes_rating_count),
    itunes_rating_count_bracket: reach.itunes?.itunes_rating_count_bracket || null,
    spotify_rating: float(reach.spotify?.spotify_rating_average),
    spotify_rating_count: int(reach.spotify?.spotify_rating_count),
    spotify_rating_count_bracket: reach.spotify?.spotify_rating_count_bracket || null,
    audience_size: int(reach.audience_size),
    podcast_reach_score: int(p.podcast_reach_score ?? reach.reach_score),
    podscan_email: reach.email || null,
    website: reach.website || null,
    social_links: reach.social_links || null,
    podscan_last_fetched_at: new Date().toISOString(),
  }
}

const known = new Set()
async function loadKnown() {
  for (let from = 0; ; from += 1000) {
    const res = await sb('GET', `/podcasts?select=podscan_id&order=id&offset=${from}&limit=1000`)
    const rows = await res.json()
    rows.forEach((r) => known.add(r.podscan_id))
    if (rows.length < 1000) break
  }
  log(`loaded ${known.size} existing podscan ids`)
}

async function savePage(podcasts) {
  const valid = podcasts.filter((p) => p.podcast_id && /^[A-Za-z0-9_-]{1,300}$/.test(p.podcast_id) && p.podcast_name)
  const fresh = [], existing = []
  for (const p of valid) {
    ;(known.has(p.podcast_id) ? existing : fresh).push(podscanFields(p))
    known.add(p.podcast_id)
  }
  stats.seen += valid.length
  if (DRY) return { fresh: fresh.length, existing: existing.length }
  if (fresh.length) {
    const rows = fresh.map((r) => ({ ...r, podscan_fetch_count: 1, cache_hit_count: 0 }))
    await sb('POST', '/podcasts?on_conflict=podscan_id', rows, 'resolution=ignore-duplicates,return=minimal')
    stats.inserted += fresh.length
  }
  if (existing.length) {
    await sb('POST', '/podcasts?on_conflict=podscan_id', existing, 'resolution=merge-duplicates,return=minimal')
    stats.refreshed += existing.length
  }
  return { fresh: fresh.length, existing: existing.length }
}


async function runSlice(slice) {
  const s = (state.slices[slice.key] ||= { page: 0, done: false, total: null, inserted: 0 })
  if (s.done) return
  while (s.page < MAX_PAGES_PER_SLICE) {
    const page = s.page + 1
    const params = {
      query: slice.query || 'the OR podcast OR and',
      ...(slice.categoryId ? { category_ids: slice.categoryId } : {}),
      language: 'en',
      ...slice.params,
      min_audience_size: String(slice.min),
      per_page: '50',
      order_by: 'audience_size',
      order_dir: 'desc',
      page: String(page),
    }
    if (slice.max) params.max_audience_size = String(slice.max)
    let data
    try {
      data = await podscan('/podcasts/search', params)
    } catch (err) {
      stats.errors++
      log(`ERROR ${slice.key} p${page}: ${err.message}`)
      if (/Podscan 4\d\d/.test(err.message)) { s.done = true; s.error = err.message; saveState() }
      return
    }
    const podcasts = data.podcasts || []
    s.total = data.pagination?.total ?? data.total_count ?? s.total
    const r = await savePage(podcasts)
    s.page = page
    s.inserted += r.fresh
    // Saturated slice: 3 pages in a row with under 3 new shows each isn't worth the daily quota.
    s.lowStreak = r.fresh < 3 ? (s.lowStreak || 0) + 1 : 0
    if (podcasts.length < 50) s.done = true
    else if (s.lowStreak >= 3) { s.done = true; s.saturated = true }
    saveState()
    log(`${slice.key} p${page}: ${podcasts.length} results, +${r.fresh} new, ${r.existing} refreshed | total new ${stats.inserted}, calls ${stats.calls}`)
    if (s.done) return
  }
  s.done = true
  s.capped = true
  saveState()
}

async function main() {
  const cats = await podscan('/categories')
  const list = cats.categories || cats.data || cats
  if (process.argv.includes('--categories')) { console.log(JSON.stringify(list, null, 1)); return }
  await loadKnown()
  // One queue across all passes, in priority order, so every worker stays busy at pass boundaries.
  const queue = []
  for (const pass of PASSES) {
    // A pass targets either categories (broad query) or keyword queries (all categories).
    const chosen = pass.queries
      ? pass.queries.map((q) => ({ label: `q=${q}`, query: q }))
      : pass.cats.map((w) => list.find((c) => c.category_name === w)).filter(Boolean)
        .map((c) => ({ label: c.category_name, categoryId: c.category_id }))
    for (const target of chosen) {
      for (const [min, max] of pass.bands) {
        const base = `${target.label}|${min}-${max ?? 'up'}`
        const key = pass.name ? `${pass.name}:${base}` : base
        if (!state.slices[key]?.done && !queue.some((s) => s.key === key)) {
          queue.push({ ...target, key, min, max, params: pass.params })
        }
      }
    }
  }
  log(`${queue.length} slices queued across ${PASSES.length} passes, concurrency ${CONCURRENCY}${DRY ? ' (dry run)' : ''}`)
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const slice = queue.shift()
      await runSlice(slice)
      if (!queue.length || !queue[0].key.startsWith(slice.key.split(':')[0])) {
        log(`progress after ${slice.key}: ${JSON.stringify(stats)}`)
      }
    }
  }))
  log(`DONE: ${JSON.stringify(stats)}`)
}

main().catch((err) => { log(`FATAL ${err.stack || err}`); saveState(); process.exit(1) })
