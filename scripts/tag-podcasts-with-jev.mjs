// Tag catalog shows with Jev (TypeSafe's System One model): B2B fit, takes guests, format,
// intended audiences and junk, stored in the podcasts.jev_* columns (20261104000300).
// Usage: node scripts/tag-podcasts-with-jev.mjs <env-dir> [--limit N] [--retag]
// <env-dir> holds supabase.env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) and typesafe.env
// (TYPESAFE_API_KEY); keep it outside the repo. Resumable: it only takes shows not yet tagged
// (--retag takes every visible show again). Log in <env-dir>/jev.log; live worker count via
// <env-dir>/jev-concurrency.txt.
import fs from 'node:fs'
import path from 'node:path'

const DIR = path.resolve(process.argv[2] || '.')
const LIMIT = Number(process.argv[process.argv.indexOf('--limit') + 1]) || Infinity
const RETAG = process.argv.includes('--retag')
const MODEL = 'jev-latest'
// Audiences at this probability or above go into jev_audiences, the indexed list filters read.
const AUDIENCE_CUTOFF = 0.5

const env = {}
for (const f of ['supabase.env', 'typesafe.env']) {
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
  fs.appendFileSync(path.join(DIR, 'jev.log'), line + '\n')
}

// Each audience is its own yes/no, so several can apply to one show.
const AUDIENCES = {
  founders: 'founders, startup operators, or small and mid-size business owners',
  executives: 'senior executives and C-suite leaders at established companies',
  marketers: 'marketing, brand, or growth professionals',
  sales: 'sales, revenue, or business-development professionals',
  investors: 'investors: venture capital, angel, private equity, real estate, or public-market investors',
  technical: 'software engineers, developers, data or IT professionals',
  healthcare: 'doctors, clinicians, or healthcare business leaders',
  consumers: 'the general public as consumers or hobbyists, not people in a professional role',
}
const FORMATS = {
  interview: 'Host interviews one guest per episode',
  panel: 'Panel or roundtable with several speakers',
  solo: 'Host speaking alone: monologue, teaching, or commentary',
  cohosts: 'Regular co-hosts talking with each other, no guests',
  news: 'News, market updates, or recaps',
  narrative: 'Narrative, documentary, or storytelling',
  brand: 'A company\'s own marketing podcast about its products or customers',
  other: 'Something else, or the description does not say',
}
// Reviewed on a 500-show sample (2026-11-04) before the backfill.
const QUESTIONS = {
  ...Object.fromEntries(Object.entries(AUDIENCES).map(([key, who]) => [`audience_${key}`, {
    type: 'noul',
    instructions: `Is a main intended audience of this podcast ${who}? Judge from the show's name, description, categories, host and publisher.`,
  }])),
  interviews_guests: {
    type: 'noul',
    instructions: 'Do this podcast\'s episodes regularly feature an interview or conversation with a guest from outside the regular host team?',
  },
  b2b_fit: {
    type: 'score',
    instructions: 'How good a fit is this podcast for booking a B2B guest (a founder, executive, or professional expert) who wants to reach business decision-makers?',
    criteria: [
      'No fit: entertainment, fiction, religion, kids, sports chat, or another topic with no business audience',
      'Weak fit: a general or lifestyle show that only occasionally touches work or money',
      'Some fit: personal development, careers, or general entrepreneurship for a broad audience',
      'Good fit: a business, leadership, or industry show whose listeners are professionals',
      'Strong fit: a show built around interviewing business leaders or experts for a decision-maker audience',
    ],
  },
  format: {
    type: 'choice',
    instructions: 'Which best describes how this podcast\'s episodes are usually made?',
    criteria: FORMATS,
  },
  junk: {
    type: 'noul',
    instructions: 'Is this feed junk rather than a real podcast: spam, piracy or download listings, keyword stuffing, auto-generated content farm, audiobook or radio re-uploads, or a placeholder with no real show?',
  },
}

let pauseUntil = 0
async function systemOne(state) {
  for (let attempt = 1; ; attempt++) {
    const wait = pauseUntil - Date.now()
    if (wait > 0) await sleep(wait)
    let res
    try {
      res = await fetch('https://api.typesafe.ai/v1/systemone', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, state, questions: QUESTIONS }),
        signal: AbortSignal.timeout(60_000),
      })
    } catch (err) {
      if (attempt >= 6) throw err
      await sleep(3000 * attempt)
      continue
    }
    if (res.ok) return res.json()
    const text = (await res.text()).slice(0, 300)
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after')) || Math.min(15 * 2 ** Math.min(attempt - 1, 5), 600)
      pauseUntil = Math.max(pauseUntil, Date.now() + retry * 1000)
      log(`429 from TypeSafe; pausing ${retry}s ${text}`)
      continue
    }
    if (res.status >= 500 && attempt < 6) {
      stats.retries++
      log(`TypeSafe ${res.status} retry ${attempt}: ${text.slice(0, 120)}`)
      await sleep(3000 * attempt)
      continue
    }
    throw new Error(`TypeSafe ${res.status}: ${text}`)
  }
}

// Database load is transient: back off and keep going rather than crash.
async function sb(method, pathname, body) {
  for (let attempt = 1; ; attempt++) {
    let res, text
    try {
      res = await fetch(`${SB}${pathname}`, {
        method,
        headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(120_000),
      })
      if (res.ok) return res
      text = await res.text()
    } catch (err) {
      text = err.message
    }
    if (res && res.status >= 400 && res.status < 500) throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`)
    stats.retries++
    if (attempt === 1 || attempt % 5 === 0) log(`Supabase ${res?.status ?? 'network'} retry ${attempt}: ${String(text).slice(0, 160)}`)
    await sleep(Math.min(2000 * 2 ** attempt, 120_000))
  }
}

// Feed text arrives with tags and entities; the model reads it as plain text.
const plain = (s, n) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, '\'')
  .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim().slice(0, n)
const round = (n, d = 3) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null)
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

function stateFor(show) {
  return {
    podcast: {
      name: plain(show.podcast_name, 300),
      publisher: plain(show.publisher_name, 200),
      host: plain(show.host_name, 200),
      categories: (Array.isArray(show.podcast_categories) ? show.podcast_categories : [])
        .map((c) => (typeof c === 'string' ? c : c?.category_name)).filter(Boolean),
      description: plain(show.podcast_description, 1500),
    },
  }
}

function columnsFrom(answers, model) {
  const audience = Object.fromEntries(Object.keys(AUDIENCES).map((key) => [key, round(answers[`audience_${key}`].noul)]))
  const format = answers.format.choice
  return {
    jev_b2b_fit: round(clamp(answers.b2b_fit.score, 0, 4)),
    jev_takes_guests: round(clamp(answers.interviews_guests.noul, 0, 1)),
    jev_format: format in FORMATS ? format : 'other',
    jev_audience: audience,
    jev_audiences: Object.keys(audience).filter((key) => audience[key] >= AUDIENCE_CUTOFF),
    jev_junk: round(clamp(answers.junk.noul, 0, 1)),
    jev_model: model || MODEL,
    jev_tagged_at: new Date().toISOString(),
  }
}

const stats = { tagged: 0, failed: 0, inputTokens: 0, modelMs: 0, writeMs: 0, retries: 0 }
const started = Date.now()
const CONCURRENCY_FILE = path.join(DIR, 'jev-concurrency.txt')
const target = () => {
  try { return Math.max(1, Math.min(16, parseInt(fs.readFileSync(CONCURRENCY_FILE, 'utf8'), 10) || 6)) } catch { return 6 }
}

async function tag(show) {
  try {
    const t0 = Date.now()
    const response = await systemOne(stateFor(show))
    const t1 = Date.now()
    stats.inputTokens += response.usage?.input_tokens || 0
    await sb('PATCH', `/podcasts?id=eq.${show.id}`, columnsFrom(response.answers, response.model))
    stats.modelMs += t1 - t0
    stats.writeMs += Date.now() - t1
    stats.tagged++
  } catch (err) {
    stats.failed++
    log(`failed ${show.podscan_id}: ${err.message}`)
    // A bad key or a refused request stops the run instead of failing every show.
    if (/TypeSafe 40[0-3]/.test(err.message)) throw err
  }
}

async function main() {
  const cols = 'id,podscan_id,podcast_name,publisher_name,host_name,podcast_description,podcast_categories'
  const untagged = RETAG ? '' : '&jev_tagged_at=is.null'
  let cursor = '00000000-0000-0000-0000-000000000000'
  let queued = 0
  let lastReport = Date.now()
  log(`tagging ${RETAG ? 'every visible show' : 'untagged shows'} with ${MODEL}${Number.isFinite(LIMIT) ? `, limit ${LIMIT}` : ''}`)
  const running = new Set()
  for (;;) {
    if (queued >= LIMIT) break
    const res = await sb('GET', `/podcasts?select=${cols}&hidden_reason=is.null${untagged}&id=gt.${cursor}&order=id&limit=500`)
    const rows = await res.json()
    if (!rows.length) break
    cursor = rows[rows.length - 1].id
    for (const show of rows) {
      if (queued >= LIMIT) break
      while (running.size >= target()) await Promise.race(running)
      const job = tag(show).finally(() => running.delete(job))
      running.add(job)
      queued++
      if (Date.now() - lastReport > 60_000) {
        lastReport = Date.now()
        const perSecond = stats.tagged / ((Date.now() - started) / 1000)
        const avg = (ms) => Math.round(ms / Math.max(stats.tagged, 1))
        log(`progress: ${stats.tagged} tagged, ${stats.failed} failed, ${stats.retries} retries, ${stats.inputTokens} input tokens, ${perSecond.toFixed(1)}/s, ${target()} workers, model ${avg(stats.modelMs)}ms + write ${avg(stats.writeMs)}ms`)
      }
    }
  }
  await Promise.all(running)
  log(`DONE: ${JSON.stringify({ ...stats, est_cost_usd: +(stats.inputTokens * 0.042 / 1e6).toFixed(2), seconds: Math.round((Date.now() - started) / 1000) })}`)
}

main().catch((err) => { log(`FATAL ${err.stack || err}`); process.exit(1) })
