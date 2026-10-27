// Check every podcast inbox address with MillionVerifier's bulk API and store the
// results in podcast_email_verifications (one row per normalized address).
// Usage: node scripts/verify-podcast-emails.mjs <env-dir> [--recheck-days=N] [--dry]
// <env-dir> holds supabase.env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) and
// millionverifier.env (MILLIONVERIFIER_API_KEY); keep it outside the repo.
// Resumable: an uploaded file's id is kept in <env-dir>/verify-state.json, so a rerun
// picks up the same file instead of paying for it twice.
import fs from 'node:fs'
import path from 'node:path'

const DIR = path.resolve(process.argv[2] || '.')
const DRY = process.argv.includes('--dry')
const recheckArg = process.argv.find((a) => a.startsWith('--recheck-days='))
// Addresses checked more recently than this are skipped; by default only never-checked ones run.
const RECHECK_DAYS = recheckArg ? Number(recheckArg.split('=')[1]) : null

const env = {}
for (const f of ['supabase.env', 'millionverifier.env']) {
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
const BULK = 'https://bulkapi.millionverifier.com/bulkapi/v2'
const KEY = env.MILLIONVERIFIER_API_KEY
const STATE_FILE = path.join(DIR, 'verify-state.json')
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u
const STATUSES = new Set(['ok', 'catch_all', 'unknown', 'disposable', 'invalid', 'error'])

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => {
  const line = `[${new Date().toISOString()}] ${a.join(' ')}`
  console.log(line)
  fs.appendFileSync(path.join(DIR, 'verify.log'), line + '\n')
}
const readState = () => (fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {})
const writeState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 1))

async function sbGet(pathname) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${SB}${pathname}`, { headers: SB_HEADERS })
    if (res.ok) return res.json()
    if (attempt >= 6) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`)
    await sleep(3000 * attempt)
  }
}

/** Every address in every podcasts.podscan_email list, normalized and deduplicated. */
async function catalogAddresses() {
  const addresses = new Set()
  for (let cursor = '00000000-0000-0000-0000-000000000000'; ;) {
    const rows = await sbGet(`/podcasts?select=id,podscan_email&podscan_email=not.is.null&id=gt.${cursor}&order=id&limit=1000`)
    for (const r of rows) {
      for (const part of String(r.podscan_email).split(/[,;\s]+/u)) {
        const email = part.trim().toLowerCase()
        if (EMAIL.test(email)) addresses.add(email)
      }
    }
    if (rows.length < 1000) break
    cursor = rows[rows.length - 1].id
  }
  return addresses
}

/** Addresses already checked (recently enough, when re-checking). */
async function checkedAddresses() {
  const checked = new Set()
  const since = RECHECK_DAYS === null ? null : new Date(Date.now() - RECHECK_DAYS * 864e5).toISOString()
  for (let cursor = ''; ;) {
    const filter = `${since ? `&checked_at=gte.${since}` : ''}${cursor ? `&normalized_email=gt.${encodeURIComponent(cursor)}` : ''}`
    const rows = await sbGet(`/podcast_email_verifications?select=normalized_email${filter}&order=normalized_email&limit=1000`)
    rows.forEach((r) => checked.add(r.normalized_email))
    if (rows.length < 1000) break
    cursor = rows[rows.length - 1].normalized_email
  }
  return checked
}

async function upload(emails) {
  const csv = 'email\n' + emails.join('\n') + '\n'
  const form = new FormData()
  form.append('file_contents', new Blob([csv], { type: 'text/csv' }), `podcast-emails-${Date.now()}.csv`)
  const res = await fetch(`${BULK}/upload?key=${encodeURIComponent(KEY)}`, { method: 'POST', body: form })
  const body = await res.json()
  if (!res.ok || !body.file_id || body.error) throw new Error(`MillionVerifier upload failed: ${JSON.stringify(body).slice(0, 300)}`)
  return String(body.file_id)
}

async function waitForFile(fileId) {
  for (;;) {
    let info
    try {
      const res = await fetch(`${BULK}/fileinfo?key=${encodeURIComponent(KEY)}&file_id=${fileId}`, { signal: AbortSignal.timeout(60_000) })
      info = await res.json()
    } catch (err) {
      // The job keeps running on MillionVerifier's side; a dropped status poll is not a failure.
      log(`file ${fileId}: status check failed (${err.message}), retrying`)
      await sleep(30_000)
      continue
    }
    if (info.error) throw new Error(`MillionVerifier fileinfo: ${info.error}`)
    log(`file ${fileId}: ${info.status} ${info.percent}% (${info.verified ?? 0} verified, eta ${info.estimated_time_sec ?? '?'}s)`)
    if (info.status === 'finished') return info
    if (['canceled', 'error'].includes(info.status)) throw new Error(`MillionVerifier file ${fileId} ${info.status}`)
    await sleep(30_000)
  }
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/u).filter(Boolean)
  const split = (line) => line.match(/("([^"]|"")*"|[^,]*)(,|$)/gu).map((c) => c.replace(/,$/u, '').replace(/^"|"$/gu, '').replace(/""/gu, '"'))
  const header = split(lines[0]).map((h) => h.trim().toLowerCase())
  return lines.slice(1).map((line) => Object.fromEntries(split(line).map((v, i) => [header[i], v])))
}

async function download(fileId) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${BULK}/download?key=${encodeURIComponent(KEY)}&file_id=${fileId}&filter=all`, { signal: AbortSignal.timeout(300_000) })
      if (!res.ok) throw new Error(`MillionVerifier download ${res.status}`)
      return parseCsv(await res.text())
    } catch (err) {
      if (attempt >= 5) throw err
      log(`download failed (${err.message}), retrying`)
      await sleep(15_000 * attempt)
    }
  }
}

const yesNo = (v) => (v === 'yes' ? true : v === 'no' ? false : null)

async function save(results, checkedAt) {
  const rows = results
    .map((r) => ({
      normalized_email: String(r.email || '').trim().toLowerCase(),
      status: STATUSES.has(r.result) ? r.result : 'unknown',
      quality: r.quality || null,
      is_free: yesNo(r.free),
      is_role: yesNo(r.role),
      provider: 'millionverifier',
      checked_at: checkedAt,
      updated_at: new Date().toISOString(),
    }))
    .filter((r) => EMAIL.test(r.normalized_email))
  for (let i = 0; i < rows.length; i += 1000) {
    const batch = rows.slice(i, i + 1000)
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`${SB}/podcast_email_verifications?on_conflict=normalized_email`, {
        method: 'POST',
        headers: { ...SB_HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(batch),
      })
      if (res.ok) break
      if (attempt >= 6) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`)
      await sleep(3000 * attempt)
    }
    log(`saved ${Math.min(i + 1000, rows.length)}/${rows.length}`)
  }
  return rows.length
}

async function main() {
  const state = readState()
  if (!state.fileId) {
    const [all, checked] = await Promise.all([catalogAddresses(), checkedAddresses()])
    const pending = [...all].filter((e) => !checked.has(e)).sort()
    log(`${all.size} catalog addresses, ${checked.size} already checked, ${pending.length} to verify${DRY ? ' (dry run)' : ''}`)
    if (DRY || pending.length === 0) return
    state.fileId = await upload(pending)
    state.count = pending.length
    state.uploadedAt = new Date().toISOString()
    writeState(state)
    log(`uploaded ${pending.length} addresses as file ${state.fileId}`)
  } else {
    log(`resuming file ${state.fileId} (${state.count} addresses)`)
  }
  const info = await waitForFile(state.fileId)
  const results = await download(state.fileId)
  const saved = await save(results, info.updated_at ? new Date(`${info.updated_at}Z`).toISOString() : new Date().toISOString())
  log(`done: ${saved} results saved (ok ${info.ok}, catch_all ${info.catch_all}, unknown ${info.unknown}, disposable ${info.disposable}, invalid ${info.invalid})`)
  fs.renameSync(STATE_FILE, `${STATE_FILE}.${state.fileId}.done`)
}

main().catch((err) => { log(`FATAL ${err.stack || err}`); process.exit(1) })
