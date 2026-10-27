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

// Category names we want (matched case-insensitively against Podscan's list).
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
  '"private equity" OR "family office" OR acquisitions',
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
// B2B: the client focus. Run first, down to small niche audiences.
const B2B_QUERIES = [
  'B2B OR "business to business" OR "B2B marketing" OR "B2B sales"',
  'SaaS OR "software as a service" OR "enterprise software" OR "tech sales"',
  '"revenue operations" OR RevOps OR "demand generation" OR "demand gen" OR pipeline',
  '"account based marketing" OR ABM OR "go to market" OR GTM',
  '"customer success" OR "customer experience" OR CX OR retention',
  'CFO OR CMO OR CTO OR CRO OR COO OR CIO OR "chief revenue officer"',
  '"sales leader" OR "sales leadership" OR "sales team" OR prospecting OR "cold outreach"',
  '"growth marketing" OR "content marketing" OR "LinkedIn" OR "thought leadership"',
  'procurement OR operations OR "operational excellence" OR "process improvement"',
  '"professional services" OR "managed services" OR MSP OR "IT services"',
  '"private equity" OR "venture capital" OR "family office" OR "investment banking"',
  '"healthcare industry" OR "healthcare leaders" OR "health tech" OR healthtech',
  'manufacturing OR "supply chain" OR logistics OR "industrial"',
  '"commercial real estate" OR proptech OR "real estate investing"',
  '"executive leadership" OR "C-suite" OR "board of directors" OR "CEO"',
  'founder OR founders OR startup OR startups OR scaleup',
  '"small business" OR "business owner" OR "business owners" OR SMB',
  'consulting OR consultants OR agency OR agencies',
  'fintech OR "financial services" OR banking OR insurance OR insurtech',
  '"human resources" OR HR OR "people operations" OR recruiting OR "talent acquisition"',
  '"artificial intelligence" OR AI OR automation OR "data analytics"',
  'cybersecurity OR "cyber security" OR CISO OR infosec',
  'ecommerce OR "e-commerce" OR retail OR "consumer brands" OR CPG',
  'legal OR lawyers OR attorney OR "law firm" OR accounting OR CPA',
]
// Narrower B2B niches: job functions and industries, each a likely guest market.
const B2B_QUERIES_2 = [
  '"product management" OR "product manager" OR "product leaders" OR "product-led growth"',
  '"sales enablement" OR "sales ops" OR "sales operations" OR "inside sales" OR SDR',
  'partnerships OR "channel sales" OR "channel partners" OR alliances OR "ecosystem"',
  '"marketing leaders" OR "marketing leadership" OR "marketing strategy" OR "brand strategy"',
  'SEO OR "paid ads" OR "performance marketing" OR "PPC" OR "paid media"',
  '"public relations" OR PR OR communications OR "corporate communications"',
  '"marketing automation" OR HubSpot OR Salesforce OR CRM OR martech',
  '"cloud computing" OR DevOps OR "software engineering" OR "engineering leaders" OR CTO',
  '"data engineering" OR "data science" OR "business intelligence" OR analytics',
  '"payments" OR "payment processing" OR "embedded finance" OR "open banking"',
  '"accounting firm" OR accountants OR "tax strategy" OR bookkeeping OR "fractional CFO"',
  '"wealth management" OR "financial advisors" OR "financial planning" OR advisors',
  '"insurance agents" OR "insurance agency" OR "insurance industry"',
  'mortgage OR lending OR "loan officers" OR "credit union" OR "community bank"',
  '"medical device" OR "medtech" OR "clinical research" OR "clinical trials"',
  '"pharma" OR "pharmaceutical" OR "life science" OR biotechnology',
  '"dental practice" OR "practice owners" OR "private practice" OR "practice management"',
  '"veterinary" OR "veterinarians" OR "vet practice"',
  '"legal tech" OR "law practice" OR "law firm owners" OR "legal industry"',
  '"HR tech" OR "workplace culture" OR "employee engagement" OR "future of work"',
  '"edtech" OR "higher education" OR "university leaders" OR "K-12 leaders"',
  '"government contracting" OR "public sector" OR "federal contractors" OR GovCon',
  '"construction industry" OR "construction tech" OR "general contractors" OR trades',
  '"franchise" OR franchising OR franchisees OR "franchise owners"',
  '"Amazon sellers" OR "Amazon FBA" OR "ecommerce brands" OR "DTC brands" OR Shopify',
  '"restaurant industry" OR "hospitality industry" OR "hotel industry"',
  '"energy industry" OR "oil industry" OR "gas industry" OR "renewable energy" OR "clean energy"',
  '"automotive industry" OR "car dealers" OR dealerships OR "fleet management"',
  '"nonprofit leaders" OR "nonprofit leadership" OR "executive directors" OR "social impact"',
  '"customer service" OR "contact center" OR "call center" OR "support teams"',
  'acquisitions OR "exit planning" OR "selling your business" OR "business brokers"',
  '"executive coach" OR "executive coaching" OR "leadership coach" OR "leadership development"',
  '"marketing agency owners" OR "agency growth" OR "agency owners"',
  '"real estate agents" OR realtors OR "real estate brokers" OR brokerage',
  '"property management" OR "multifamily" OR "self storage" OR "commercial property"',
  '"logistics industry" OR trucking OR freight OR "3PL" OR warehousing',
  '"telecom" OR "telecommunications" OR "IT leaders" OR CIO OR "IT management"',
  '"compliance" OR "risk management" OR governance OR "regulatory"',
  '"workplace" OR "operations leaders" OR "chief operating officer" OR "scaling a business"',
  '"bootstrapped" OR "solopreneur" OR "indie hackers" OR "micro SaaS"',
]
// Finance and real estate: investor and operator audiences.
const FINANCE_RE_QUERIES = [
  '"real estate investing" OR "real estate investor" OR "rental properties" OR landlords OR BRRRR',
  '"real estate syndication" OR syndication OR "passive investing" OR "accredited investors" OR LP',
  '"house flipping" OR "flipping houses" OR wholesaling OR "short term rentals" OR Airbnb',
  '"commercial real estate" OR CRE OR "industrial real estate" OR "office space" OR "net lease"',
  '"multifamily investing" OR "apartment investing" OR "mobile home parks" OR "self storage investing"',
  '"real estate development" OR "land development" OR homebuilders OR "build to rent"',
  '"real estate agents" OR realtors OR "real estate business" OR "real estate marketing"',
  '"mortgage brokers" OR "loan officers" OR "hard money" OR "private lending" OR "note investing"',
  '"personal finance" OR "financial freedom" OR "financial independence" OR FIRE OR budgeting',
  '"stock market" OR stocks OR trading OR "options trading" OR "day trading" OR "value investing"',
  'crypto OR bitcoin OR blockchain OR web3 OR DeFi OR "digital assets"',
  'economics OR economy OR macro OR "interest rates" OR "monetary policy" OR markets',
  '"retirement planning" OR "estate planning" OR annuities OR "life insurance" OR "retirement income"',
  '"angel investing" OR "startup investing" OR "raising capital" OR fundraising OR "capital raise"',
  '"fund managers" OR "hedge funds" OR "asset management" OR "alternative investments" OR "private credit"',
  '"tax planning" OR "tax strategies" OR "tax strategy" OR "tax savings" OR IRS',
  '"wealth building" OR "generational wealth" OR millionaires OR "net worth" OR "passive income"',
  '"business credit" OR "small business loans" OR "SBA loans" OR "business funding"',
  '"financial advisors" OR "advisor marketing" OR "RIA" OR "wealth advisors" OR "financial planners"',
  '"family office" OR "private wealth" OR "high net worth" OR "ultra high net worth"',
]
const NICHE_BANDS = [[100, 175], [175, 250], [250, 400], [400, 600], [600, 1000]]
const RECENT = { has_guests: 'true', min_last_episode_posted_at: daysAgo(90) }
const OLDER = { has_guests: 'true', min_last_episode_posted_at: daysAgo(180), max_last_episode_posted_at: daysAgo(90) }
const NO_GUEST = { has_guests: 'false', min_last_episode_posted_at: daysAgo(90) }
const SMALL_BANDS = [[500, 700], [700, 1000]]
const OLDER_BANDS = [[500, 1500], [1500, 5000], [5000, null]]
const NO_GUEST_BANDS = [[1000, 1500], [1500, 2500], [2500, 5000], [5000, 15000], [15000, null]]
// Passes run in order; each widens the net. The core passes have no key prefix so saved progress carries over.
// More B2B niches: roles, service businesses, industries and founder communities.
const B2B_QUERIES_3 = [
  '"chief marketing officer" OR "VP of marketing" OR "head of marketing" OR "marketing executives"',
  '"chief financial officer" OR "VP of finance" OR "finance leaders" OR "finance teams"',
  '"chief people officer" OR "HR leaders" OR "people leaders" OR "talent leaders"',
  '"product marketing" OR positioning OR messaging OR "category design"',
  '"lead generation" OR "lead gen" OR "customer acquisition" OR "appointment setting"',
  '"cold email" OR outbound OR "email marketing" OR "outbound sales"',
  '"B2B podcast" OR "brand podcast" OR "podcast marketing" OR "video podcast"',
  '"event marketing" OR "events industry" OR "trade shows" OR "conferences"',
  '"facilities management" OR "property technology" OR "smart buildings"',
  '"medical practice" OR "healthcare administration" OR "hospital executives" OR "health system leaders"',
  '"senior living" OR "home health" OR "long term care" OR "home care"',
  '"behavioral health" OR "therapy practice" OR "mental health professionals" OR "counseling practice"',
  'pharmacy OR pharmacists OR "pharmacy owners"',
  'agriculture OR agtech OR agribusiness OR "farm business"',
  '"food industry" OR "beverage industry" OR "food brands" OR "CPG"',
  'aerospace OR "defense industry" OR "defense contractors" OR "space industry"',
  'mining OR "chemicals industry" OR "metals" OR "heavy industry"',
  'architects OR architecture OR "engineering firms" OR "civil engineering"',
  'HVAC OR plumbing OR roofing OR "home service business" OR electricians',
  '"landscaping business" OR "cleaning business" OR "pest control" OR "janitorial"',
  '"auto repair" OR "collision repair" OR "car wash" OR "auto shop"',
  '"salon owners" OR "spa owners" OR "med spa" OR "aesthetics business"',
  '"gym owners" OR "fitness business" OR "studio owners" OR "fitness professionals"',
  '"video production" OR "creative agency" OR "production company" OR "photography business"',
  '"packaging industry" OR "printing industry" OR "print shop"',
  '"data center" OR "cloud infrastructure" OR "IT infrastructure" OR "network engineering"',
  '"developer tools" OR "developer relations" OR DevRel OR "open source"',
  '"no-code" OR "low-code" OR "workflow automation" OR "business automation"',
  'ESG OR "climate tech" OR "carbon markets" OR "sustainability leaders"',
  '"impact investing" OR "B Corp" OR "social enterprise" OR "purpose-driven business"',
  '"family business" OR "succession planning" OR "next generation leaders"',
  '"women in business" OR "women founders" OR "female entrepreneurs" OR "women leaders"',
  '"Black founders" OR "Latino entrepreneurs" OR "diverse founders" OR "minority-owned business"',
  '"veteran entrepreneurs" OR "veterans in business" OR "military to business"',
  '"faith-driven entrepreneurs" OR "Christian business" OR "kingdom business" OR "faith at work"',
  'payroll OR "employee benefits" OR PEO OR "benefits brokers"',
  '"commercial insurance" OR "insurance brokers" OR "workers compensation" OR "risk managers"',
  '"merchant services" OR "credit card processing" OR "payment processors"',
  '"title insurance" OR escrow OR "real estate closing" OR "title agents"',
  '"investor relations" OR "public companies" OR IPO OR "capital markets"',
  '"venture studio" OR "startup studio" OR accelerator OR incubator',
  '"SaaS founders" OR "SaaS growth" OR ARR OR "recurring revenue"',
  'fractional OR "fractional executive" OR "fractional CMO" OR "fractional COO"',
  '"professional speakers" OR "keynote speakers" OR "speaking business"',
  '"business book" OR "nonfiction authors" OR "self-publishing" OR "book marketing"',
  '"course creators" OR "online courses" OR "coaching business" OR "info products"',
  '"personal branding" OR "LinkedIn growth" OR "creator economy" OR "audience building"',
]
// Topics Podscan has no category slug for (folded into technology / self-improvement).
const TOPIC_QUERIES = [
  '"generative AI" OR ChatGPT OR LLM OR "AI agents" OR "AI for business" OR "AI tools"',
  '"machine learning" OR "deep learning" OR MLOps OR "AI engineering"',
  '"software engineering" OR developer OR developers OR programming OR coding',
  'devops OR "cloud computing" OR AWS OR Kubernetes OR "platform engineering"',
  '"team building" OR "company culture" OR "high performing teams" OR "leading teams"',
  '"personal development" OR productivity OR "high performance" OR mindset OR "career growth"',
]
const ALL_B2B_QUERIES = [...TOPIC_QUERIES, ...B2B_QUERIES, ...B2B_QUERIES_2, ...B2B_QUERIES_3, ...FINANCE_RE_QUERIES, ...VERTICAL_QUERIES, ...BIZ_QUERIES]
const YEAR = { has_guests: 'true', min_last_episode_posted_at: daysAgo(365), max_last_episode_posted_at: daysAgo(180) }
// B2B only: every request goes to finding business shows. Passes run in priority order.
// ALL = one block per query, split into audience bands only when Podscan reports over ~9.5K results.
// Most niche queries have a few hundred results, so banding them wasted a request per empty band.
const ALL = [[1, null]]
// B2B only: every request goes to finding business shows. Passes run in priority order.
const PASSES = [
  { name: 'b2b', queries: B2B_QUERIES, bands: [...NICHE_BANDS, ...BANDS], params: RECENT },
  { name: 'b2b2', queries: B2B_QUERIES_2, bands: [...NICHE_BANDS, ...BANDS], params: RECENT },
  { name: 'b2b3a', queries: B2B_QUERIES_3, bands: ALL, params: RECENT },
  { name: 'topics', queries: TOPIC_QUERIES, bands: ALL, params: RECENT },
  { name: 'finre', queries: FINANCE_RE_QUERIES, bands: [...NICHE_BANDS, ...BANDS], params: RECENT },
  { name: 'niche', cats: BIZ, bands: NICHE_BANDS, params: RECENT },
  { name: 'b2b-older', queries: [...B2B_QUERIES, ...B2B_QUERIES_2, ...FINANCE_RE_QUERIES], bands: [[100, 500], [500, 2000], [2000, null]], params: OLDER },
  { name: 'all-older', queries: ALL_B2B_QUERIES, bands: ALL, params: OLDER },
  { name: 'niche-older', cats: BIZ, bands: [[1, 300], [300, 1000]], params: OLDER },
  { name: 'all-year', queries: ALL_B2B_QUERIES, bands: ALL, params: YEAR },
  { name: 'niche-year', cats: BIZ, bands: [[1, 300], [300, null]], params: YEAR },
  { name: '', cats: BIZ, bands: BANDS, params: RECENT },
  { name: 'small', cats: BIZ, bands: SMALL_BANDS, params: RECENT },
  { name: '90-180d', cats: BIZ, bands: OLDER_BANDS, params: OLDER },
  { name: 'all-noguest', queries: ALL_B2B_QUERIES, bands: ALL, params: NO_GUEST },
  // Podscan floors small shows at audience 100, so Business no-guest can't be banded under 10K:
  // split it by how recently the show posted instead.
  { name: 'noguest-biz-0-7d', cats: ['business'], bands: [[100, 101], [101, 300], [300, 1000], [1000, null]], params: { has_guests: 'false', min_last_episode_posted_at: daysAgo(7), ...(0 ? { max_last_episode_posted_at: daysAgo(0) } : {}) } },
  { name: 'noguest-biz-7-14d', cats: ['business'], bands: [[100, 101], [101, 300], [300, 1000], [1000, null]], params: { has_guests: 'false', min_last_episode_posted_at: daysAgo(14), ...(7 ? { max_last_episode_posted_at: daysAgo(7) } : {}) } },
  { name: 'noguest-biz-14-21d', cats: ['business'], bands: [[100, 101], [101, 300], [300, 1000], [1000, null]], params: { has_guests: 'false', min_last_episode_posted_at: daysAgo(21), ...(14 ? { max_last_episode_posted_at: daysAgo(14) } : {}) } },
  { name: 'noguest-biz-21-30d', cats: ['business'], bands: [[100, 101], [101, 300], [300, 1000], [1000, null]], params: { has_guests: 'false', min_last_episode_posted_at: daysAgo(30), ...(21 ? { max_last_episode_posted_at: daysAgo(21) } : {}) } },
  { name: 'noguest-biz-30-45d', cats: ['business'], bands: [[100, 101], [101, 300], [300, 1000], [1000, null]], params: { has_guests: 'false', min_last_episode_posted_at: daysAgo(45), ...(30 ? { max_last_episode_posted_at: daysAgo(30) } : {}) } },
  { name: 'noguest-biz-45-60d', cats: ['business'], bands: [[100, 101], [101, 300], [300, 1000], [1000, null]], params: { has_guests: 'false', min_last_episode_posted_at: daysAgo(60), ...(45 ? { max_last_episode_posted_at: daysAgo(45) } : {}) } },
  { name: 'noguest-biz-60-90d', cats: ['business'], bands: [[100, 101], [101, 300], [300, 1000], [1000, null]], params: { has_guests: 'false', min_last_episode_posted_at: daysAgo(90), ...(60 ? { max_last_episode_posted_at: daysAgo(60) } : {}) } },
  { name: 'noguest-small', cats: [...BIZ.filter((c) => c !== 'business'), 'technology'], bands: [[100, 101], [101, 300], [300, 1000]], params: NO_GUEST },
  { name: 'noguest', cats: BIZ, bands: NO_GUEST_BANDS, params: NO_GUEST },
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

// Database load (autovacuum, timeouts) is transient: back off and keep going rather than crash.
async function sb(method, pathname, body, prefer) {
  for (let attempt = 1; ; attempt++) {
    let res, text
    try {
      res = await fetch(`${SB}${pathname}`, {
        method,
        headers: { ...SB_HEADERS, ...(prefer ? { Prefer: prefer } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(180_000),
      })
      if (res.ok) return res
      text = await res.text()
    } catch (err) {
      text = err.message
    }
    if (res && res.status >= 400 && res.status < 500) throw new Error(`Supabase ${res.status}: ${text.slice(0, 400)}`)
    if (attempt % 5 === 0) log(`Supabase ${res?.status ?? 'network'} retry ${attempt}: ${String(text).slice(0, 160)}`)
    await sleep(Math.min(3000 * 2 ** attempt, 120_000))
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
// Shows refreshed since this cutoff are not rewritten again: every refresh rewrites a wide row
// (embedding included) and fires the shortlist trigger, which is most of the database load.
const REFRESH_CUTOFF = Date.parse(process.env.FILL_SKIP_REFRESH_SINCE || '2026-10-26T22:50:00Z')
const refreshed = new Set()
// Identities a show shares with its other copies: a real Apple ID (Podscan sends '0' for none),
// Spotify ID, RSS feed, and title plus publisher. A new show matching any held one is a duplicate.
const heldIdentities = new Set()
function identityKeys(show) {
  const keys = []
  const itunes = String(show.podcast_itunes_id ?? '').trim()
  if (/^[1-9][0-9]{4,}$/u.test(itunes)) keys.push(`it:${itunes}`)
  const spotify = String(show.podcast_spotify_id ?? '').trim()
  if (spotify.length >= 10) keys.push(`sp:${spotify}`)
  const rss = String(show.rss_url ?? '').trim().toLowerCase().replace(/^https?:\/\//u, '').replace(/\/+$/u, '')
  if (rss.length >= 8) keys.push(`rss:${rss}`)
  const name = String(show.podcast_name ?? '').trim().toLowerCase()
  const publisher = String(show.publisher_name ?? '').trim().toLowerCase()
  if (name && publisher) keys.push(`np:${name}|${publisher}`)
  return keys
}

async function loadKnown() {
  // Keyset paging: offset scans time out on a large table under write load.
  for (let cursor = '00000000-0000-0000-0000-000000000000'; ;) {
    const res = await sb('GET', `/podcasts?select=id,podscan_id,podscan_last_fetched_at,podcast_itunes_id,podcast_spotify_id,rss_url,podcast_name,publisher_name&id=gt.${cursor}&order=id&limit=1000`)
    const rows = await res.json()
    for (const r of rows) {
      known.add(r.podscan_id)
      identityKeys(r).forEach((k) => heldIdentities.add(k))
      if (Date.parse(r.podscan_last_fetched_at) >= REFRESH_CUTOFF) refreshed.add(r.podscan_id)
    }
    if (rows.length < 1000) break
    cursor = rows[rows.length - 1].id
  }
  log(`loaded ${known.size} existing podscan ids (${refreshed.size} already refreshed this session)`)
}

// A keyword slice only keeps shows that actually contain one of its terms, so a query Podscan
// misparses (it then matches nearly everything) can't flood the catalog with unrelated shows.
function queryTerms(query) {
  const terms = []
  for (const m of query.matchAll(/"([^"]+)"|(\S+)/g)) {
    const term = (m[1] || m[2]).toLowerCase()
    if (term !== 'or') terms.push(term)
  }
  return terms
}
function matchesQuery(p, terms) {
  const text = [p.podcast_name, p.podcast_description, p.publisher_name,
    ...(p.podcast_categories || []).map((c) => c.category_name)].filter(Boolean).join(' ').toLowerCase()
  return terms.some((t) => (t.length <= 3
    ? new RegExp(`(^|[^a-z0-9])${t.replace(/[^a-z0-9]/g, '\\$&')}([^a-z0-9]|$)`).test(text)
    : text.includes(t)))
}

async function savePage(podcasts, query) {
  const terms = query ? queryTerms(query) : null
  const valid = podcasts.filter((p) => p.podcast_id && /^[A-Za-z0-9_-]{1,300}$/.test(p.podcast_id) && p.podcast_name)
    .filter((p) => !terms || matchesQuery(p, terms))
  const fresh = [], existing = []
  for (const p of valid) {
    if (!known.has(p.podcast_id)) {
      // A new id for a show we already hold (another feed, a re-upload) or one Podscan
      // itself marks as a duplicate is skipped, so the catalogue does not fill with copies.
      const fields = podscanFields(p)
      const keys = identityKeys(fields)
      if (p.is_duplicate === true || keys.some((k) => heldIdentities.has(k))) {
        stats.duplicatesSkipped = (stats.duplicatesSkipped || 0) + 1
        known.add(p.podcast_id)
        continue
      }
      keys.forEach((k) => heldIdentities.add(k))
      fresh.push(fields)
    }
    else if (!refreshed.has(p.podcast_id)) existing.push(podscanFields(p))
    known.add(p.podcast_id)
    refreshed.add(p.podcast_id)
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


let queue = []
const SPLIT_BANDS = [[1, 100], ...NICHE_BANDS, ...BANDS]

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
    const r = await savePage(podcasts, slice.query)
    // Too many results for one search (Podscan stops at 10K): hand the rest to audience bands.
    if (page === 1 && slice.min === 1 && slice.max == null && s.total > 9500) {
      s.done = true
      s.split = true
      saveState()
      const parts = SPLIT_BANDS.map(([min, max]) => ({ ...slice, key: `${slice.key}>${min}-${max ?? 'up'}`, min, max }))
      queue.unshift(...parts.filter((p) => !state.slices[p.key]?.done))
      log(`${slice.key}: ${s.total} results, split into ${parts.length} audience bands`)
      return
    }
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
  queue = []
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
  // Worker count can be changed live by writing a number to <env-dir>/concurrency.txt.
  const CONCURRENCY_FILE = path.join(DIR, 'concurrency.txt')
  const target = () => {
    try { return Math.max(1, Math.min(15, parseInt(fs.readFileSync(CONCURRENCY_FILE, 'utf8'), 10) || CONCURRENCY)) } catch { return CONCURRENCY }
  }
  let workers = 0
  const running = []
  const worker = async () => {
    workers++
    try {
      while (queue.length && workers <= target()) {
        const slice = queue.shift()
        await runSlice(slice)
        if (!queue.length || !queue[0].key.startsWith(slice.key.split(':')[0])) {
          log(`progress after ${slice.key}: ${JSON.stringify(stats)}`)
        }
      }
    } finally {
      workers--
    }
  }
  const spawn = () => {
    while (queue.length && workers < target()) running.push(worker())
  }
  spawn()
  let lastTarget = target()
  while (workers > 0) {
    await sleep(15_000)
    if (target() !== lastTarget) { lastTarget = target(); log(`concurrency -> ${lastTarget}`) }
    spawn()
  }
  await Promise.all(running)
  log(`DONE: ${JSON.stringify(stats)}`)
}

main().catch((err) => { log(`FATAL ${err.stack || err}`); saveState(); process.exit(1) })
