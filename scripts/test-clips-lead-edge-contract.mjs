import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * Strip comments before asserting what a file does NOT do. A comment naming a
 * forbidden call is documentation, not a call.
 */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|\s)\/\/[^\n]*/gu, '$1')

const fn = readFileSync('supabase/functions/clips-lead/index.ts', 'utf8')
const code = stripComments(fn)
const migration = readFileSync('supabase/migrations/20261024000100_clips_leads.sql', 'utf8')
const sql = migration.replace(/(^|\s)--[^\n]*/gu, '$1')
const config = readFileSync('supabase/config.toml', 'utf8')
const service = stripComments(readFileSync('src/services/clipsLeads.ts', 'utf8'))
const form = readFileSync('src/components/clips/ClipsForm.tsx', 'utf8')
const content = readFileSync('src/lib/clipsContent.ts', 'utf8')
const page = readFileSync('src/pages/Clips.tsx', 'utf8')

// Strangers post this form; there is no JWT to verify.
assert.match(config, /\[functions\.clips-lead\]\s+verify_jwt = false/u)

// Unauthenticated and public is only safe while the endpoint grants nothing.
for (const forbidden of [/createUser/u, /inviteUserByEmail/u, /generateLink/u, /from\('workspaces'\)/u, /from\('workspace_members'\)/u, /admin_users/u]) {
  assert.doesNotMatch(code, forbidden, `clips-lead must not touch ${forbidden}`)
}

// Shape validation before anything is written, and no field the form does not send.
assert.match(code, /requireOnlyKeys\(body, \[[^\]]*'name'[^\]]*'email'[^\]]*'show'[^\]]*'website'[^\]]*'elapsedMs'[^\]]*\]\)/u)
assert.match(code, /parseJsonObject\(req, 8_192\)/u)
assert.match(code, /requireEmail\(body\.email\)/u)
assert.match(code, /isYouTubeUrl\(show\)/u)
assert.match(code, /'Paste a YouTube channel or episode link'/u)
// The YouTube rule is a hostname check, never a substring one: youtube.com.evil.example must fail.
assert.match(code, /host === 'youtube\.com'/u)
assert.match(code, /host\.endsWith\('\.youtube\.com'\)/u)
assert.doesNotMatch(code, /includes\('youtube/u)

// Honeypot and timer: dropped silently, with the same reply a saved lead gets.
assert.match(code, /MIN_TIME_ON_PAGE_MS = 3_000/u)
assert.match(code, /if \(honeypot \|\| elapsed < MIN_TIME_ON_PAGE_MS\)/u)
const dropIndex = fn.indexOf('elapsed < MIN_TIME_ON_PAGE_MS')
const rpcIndex = fn.indexOf("admin.rpc('record_clips_lead_with_receipt_v1'")
assert.ok(dropIndex > 0 && rpcIndex > dropIndex, 'bot checks run before anything is stored')

// The name is echoed into a mail to an unverified inbox: it may only look like a name.
assert.match(code, /NAME_PATTERN\.test\(name\)/u)
assert.match(code, /requireString\(body\.name, 'name', \{ max: 60 \}\)/u)

// Five per address per hour, held inside one RPC, with no bigger allowance for stripped headers.
assert.match(code, /MAX_PER_IP_PER_HOUR = 5/u)
assert.match(code, /p_source_ip_hash: ipHash/u)
assert.match(code, /p_hourly_ceiling: ceiling/u)
assert.match(code, /outcome === 'rate_limited'/u)
assert.match(code, /new HttpError\(\s*429,\s*'TOO_MANY_REQUESTS'/u)
assert.doesNotMatch(code, /from\('clips_leads'\)/u, 'the lead must go through the atomic RPC, not a direct table write')
const perIp = Number(/MAX_PER_IP_PER_HOUR = (\d+)/u.exec(code)?.[1])
const unidentified = Number(/MAX_UNIDENTIFIED_PER_HOUR = (\d+)/u.exec(code)?.[1])
assert.ok(unidentified <= perIp, 'the unidentified bucket must be no larger than the per-address limit')
assert.match(code, /cf-connecting-ip/u)
assert.match(code, /chain\[chain\.length - 1\]/u)
assert.match(code, /SHA-256/u)
assert.match(sql, /pg_advisory_xact_lock/u)
assert.match(sql, /INTERVAL '1 hour'/u)
assert.match(sql, /recent_count >= p_hourly_ceiling[\s\S]*?RETURN 'rate_limited'/u)
assert.match(sql, /SET search_path = ''/u)
assert.match(sql, /REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC, anon, authenticated/u)
// One confirmation per inbox per day, keyed on the normalized address and under its own lock.
assert.match(sql, /email_key = normalized_key/u)
assert.match(sql, /clips_lead_email:' \|\| normalized_key/u)
assert.match(sql, /RETURN 'recorded_repeat'/u)
assert.match(code, /outcome === 'recorded' \? confirmToLead/u)

// Both mails, after the row exists, best effort. They leave through the n8n
// email workflow, which owns the copy and does the escaping; the function only
// hands over the facts, so no markup may be built here.
assert.match(code, /event: 'clips\.lead_alert'/u)
assert.match(code, /event: 'clips\.lead_confirmation'/u)
assert.doesNotMatch(code, /<html|<td>|api\.resend\.com/u)
const notifyIndex = fn.indexOf('notifyEditors({')
assert.ok(notifyIndex > rpcIndex, 'the lead must be saved before anyone is emailed')

// The UTM trio, referrer and landing path land in the row.
for (const column of ['utm_source', 'utm_medium', 'utm_campaign', 'referrer', 'landing_path', 'user_agent']) {
  assert.match(migration, new RegExp(`^  ${column} TEXT`, 'mu'), `clips_leads must have ${column}`)
  assert.match(sql, new RegExp(`p_${column}`, 'u'), `record_clips_lead must take p_${column}`)
}
assert.match(migration, /ENABLE ROW LEVEL SECURITY/u)
assert.doesNotMatch(sql, /TO anon/u)
assert.match(migration, /USING \(public\.is_platform_admin\(\)\)/u)
assert.doesNotMatch(sql, /admin_users/u)
assert.match(migration, /CREATE POLICY clips_leads_admin_delete/u)

// The browser calls the function, never the table.
assert.match(service, /functions\.invoke\('clips-lead'/u)
assert.doesNotMatch(service, /\.insert\(/u)
for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'referrer', 'landing_path']) {
  assert.match(service, new RegExp(`\\{ ${key}: attribution\\.${key} \\}`, 'u'), `the service forwards ${key}`)
}

// The form: three real labelled inputs, a honeypot out of the tree, inline red errors, the mailto on failure.
assert.match(form, /htmlFor=\{`clips-\$\{name\}`\}/u)
assert.match(form, /id=\{`clips-\$\{name\}`\}/u)
for (const name of ['name', 'email', 'show']) assert.match(form, new RegExp(`field\\('${name}'`, 'u'), `the form renders ${name}`)
assert.match(form, /className="clips-honeypot" aria-hidden="true"/u)
assert.match(form, /tabIndex=\{-1\}/u)
assert.match(form, /isYouTubeUrl\(values\.show\)/u)
assert.match(form, /href=\{`mailto:\$\{CLIPS_CONTACT_EMAIL\}`\}/u)
assert.match(form, /elapsedMs: Date\.now\(\) - renderedAt\.current/u)
assert.match(form, /role="status"/u)
assert.match(content, /errors: \{[\s\S]*?show: 'Paste a YouTube channel or episode link'/u)

// SEO: the brief's title and description, the canonical, both schema blocks, one H1.
assert.match(content, /title: 'Five clips from your last episode, free, in 72 hours \| Get On A Pod'/u)
assert.match(page, /'@type': 'FAQPage'/u)
assert.match(page, /'@type': 'Service'/u)
assert.match(page, /name: 'Get On A Pod LLC'/u)
assert.match(page, /price: '750'/u)
assert.match(page, /rel="preload" as="style"/u)
assert.match(readFileSync('scripts/generate-sitemap.ts', 'utf8'), /url: '\/clips'/u)
assert.match(readFileSync('scripts/serve-production.mjs', 'utf8'), /clips\\\/\?\$\|/u, '/clips is served as an indexable marketing page')
assert.match(readFileSync('src/App.tsx', 'utf8'), /<Route path="\/clips" element=\{<Clips \/>\} \/>/u)

// Nothing invented: no testimonials, logos, view counts, or the research numbers.
const everyWord = [content, page, form, readFileSync('src/components/clips/ClipsStories.tsx', 'utf8')].map(stripComments).join('\n')
assert.doesNotMatch(everyWord, /testimonial|1,500 replies|\d[\d,]* views|view count/iu)
// The bracketed placeholder in the fan caption is not rendered.
assert.doesNotMatch(content, /\[Live client clips/u)
// The retired company name does not reappear.
assert.doesNotMatch(everyWord, /Authority Built/u)

// The stylesheet is bundled into the app's single CSS file and loads on every
// route. Every selector must lead with .clips-; anything else is an app-wide rule.
// Split a selector list on the commas between selectors, not the ones inside
// :where(h1, h2) or :is(a, b).
const splitSelectors = (selector) => {
  const parts = []
  let depth = 0
  let current = ''
  for (const char of selector) {
    if (char === '(') depth += 1
    if (char === ')') depth = Math.max(0, depth - 1)
    if (char === ',' && depth === 0) { parts.push(current); current = ''; continue }
    current += char
  }
  parts.push(current)
  return parts
}

const css = readFileSync('src/styles/clips.css', 'utf8')
const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, '')
const escaped = []
let depth = 0
let buffer = ''
for (const char of withoutComments) {
  if (char === '{') {
    const selector = buffer.trim()
    buffer = ''
    depth += 1
    if (depth === 1 && selector && !selector.startsWith('@')) {
      for (const part of splitSelectors(selector)) {
        const one = part.trim()
        if (one && !/^\.clips-/u.test(one)) escaped.push(one)
      }
    }
    continue
  }
  if (char === '}') { depth = Math.max(0, depth - 1); buffer = ''; continue }
  if (char === ';' && depth > 0) { buffer = ''; continue }
  buffer += char
}
assert.deepEqual(escaped, [], `clips.css selectors must start with .clips-; these escape the page: ${escaped.join(' | ')}`)
// Nested rules (inside @media) get the same check.
for (const block of withoutComments.matchAll(/@media[^{]+\{([\s\S]*?)\n\}/gu)) {
  for (const rule of block[1].matchAll(/([^{}]+)\{/gu)) {
    for (const part of splitSelectors(rule[1])) {
      const one = part.trim()
      if (one && !/^\.clips-/u.test(one)) escaped.push(one)
    }
  }
}
assert.deepEqual(escaped, [], `clips.css nested selectors must start with .clips-: ${escaped.join(' | ')}`)
// The page paints its own ground and declares its own tokens; it does not read the site's.
assert.match(css, /\.clips-page \{[\s\S]*?--bg: #0a0a0b;/u)
assert.doesNotMatch(css, /--dfy-/u)
// Every animation stops under reduced motion and the labels show assembled.
assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.clips-lbl \{ opacity: 1; \}/u)
for (const name of ['clips-rise', 'clips-spin', 'clips-pulse', 'clips-split', 'clips-blade', 'clips-orbit', 'clips-fill', 'clips-track', 'clips-up', 'clips-wave', 'clips-crop', 'clips-blink', 'clips-hover3d', 'clips-edge', 'clips-lbl']) {
  assert.match(css, new RegExp(`@keyframes ${name}\\b`, 'u'), `missing @keyframes ${name}`)
}

process.stdout.write('clips-lead edge contract, /clips page contract and clips.css scoping passed\n')
