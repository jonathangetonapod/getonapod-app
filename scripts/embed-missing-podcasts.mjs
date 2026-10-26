// Backfill embeddings for podcasts rows that have none, in batches of 100.
// Same text format and model as scripts/generate-podcast-embeddings.ts / _shared/podcastCache.ts.
// Usage: node scripts/embed-missing-podcasts.mjs <env-dir> [--follow]   (--follow keeps polling for new rows)
// <env-dir> holds supabase.env and openai.env (OPENAI_API_KEY); keep it outside the repo.
import fs from 'node:fs'
import path from 'node:path'

const DIR = path.resolve(process.argv[2] || '.')
const FOLLOW = process.argv.includes('--follow')
const env = {}
for (const f of ['supabase.env', 'openai.env']) {
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
const MODEL = 'text-embedding-3-small'
const BATCH = 100
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => {
  const line = `[${new Date().toISOString()}] ${a.join(' ')}`
  console.log(line)
  fs.appendFileSync(path.join(DIR, 'embed.log'), line + '\n')
}

function podcastText(p) {
  const parts = []
  if (p.podcast_name) parts.push(`Title: ${p.podcast_name}`)
  if (p.podcast_description) parts.push(`Description: ${p.podcast_description.substring(0, 500)}`)
  if (Array.isArray(p.podcast_categories)) {
    const cats = p.podcast_categories.map((c) => c.category_name).filter(Boolean).join(', ')
    if (cats) parts.push(`Categories: ${cats}`)
  }
  if (p.host_name) parts.push(`Host: ${p.host_name}`)
  if (p.publisher_name) parts.push(`Publisher: ${p.publisher_name}`)
  if (p.language) parts.push(`Language: ${p.language}`)
  if (p.region) parts.push(`Region: ${p.region}`)
  return parts.join('. ')
}

async function retry(fn, label) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= 6) throw err
      log(`${label} failed (attempt ${attempt}): ${err.message}`)
      await sleep(Math.min(5000 * 2 ** attempt, 120_000))
    }
  }
}

async function embed(texts) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: texts, dimensions: 1536 }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
}

async function update(id, body) {
  const res = await fetch(`${SB}/podcasts?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`)
}

const skipped = new Set()
let done = 0
async function sweep() {
  let cursor = '00000000-0000-0000-0000-000000000000'
  let found = 0
  for (;;) {
    const cols = 'id,podcast_name,podcast_description,podcast_categories,publisher_name,host_name,language,region'
    const rows = await retry(async () => {
      const res = await fetch(`${SB}/podcasts?select=${cols}&embedding=is.null&id=gt.${cursor}&order=id&limit=${BATCH}`, { headers: SB_HEADERS })
      if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`)
      return res.json()
    }, 'fetch')
    if (!rows.length) return found
    cursor = rows[rows.length - 1].id
    const work = rows
      .filter((r) => !skipped.has(r.id))
      .map((r) => ({ id: r.id, text: podcastText(r) }))
      .filter((w) => (w.text.trim().length >= 10 ? true : (skipped.add(w.id), false)))
    if (!work.length) continue
    found += work.length
    const vectors = await retry(() => embed(work.map((w) => w.text)), 'embed')
    const now = new Date().toISOString()
    for (let i = 0; i < work.length; i += 10) {
      await Promise.all(work.slice(i, i + 10).map((w, j) => retry(() => update(w.id, {
        embedding: vectors[i + j],
        embedding_generated_at: now,
        embedding_model: MODEL,
        embedding_text_length: w.text.length,
      }), 'update')))
    }
    done += work.length
    log(`embedded ${work.length} (total ${done})`)
  }
}

async function main() {
  for (;;) {
    const found = await sweep()
    log(`sweep complete: ${found} embedded this sweep, ${done} total, ${skipped.size} skipped (too little text)`)
    if (!FOLLOW) return
    await sleep(5 * 60_000)
  }
}

main().catch((err) => { log(`FATAL ${err.stack || err}`); process.exit(1) })
