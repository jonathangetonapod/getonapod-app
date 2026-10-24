import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { HttpError } from '../_shared/httpError.ts'
import {
  createAdminClient,
  errorResponse,
  jsonResponse,
  optionalString,
  optionsResponse,
  parseJsonObject,
  requireEmail,
  requireOnlyKeys,
  requireString,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['POST', 'OPTIONS'] as const

// Five per address per hour: enough for a host who typos their email twice,
// tight enough that a script gains nothing by looping.
const MAX_PER_IP_PER_HOUR = 5

// Requests with no address header share one bucket, and it has to be stricter
// than the identified limit or stripping headers buys a bigger allowance.
const UNIDENTIFIED_BUCKET = 'unidentified'
const MAX_UNIDENTIFIED_PER_HOUR = 3

// The page's own rule: a human needs at least this long to read the headline
// and fill three fields. Anything faster is dropped without a word.
const MIN_TIME_ON_PAGE_MS = 3_000

const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000

const NOTIFY_FALLBACK = 'jonathan@getonapod.com'
const CAL_URL = 'https://cal.com/jonathan-garces-x5v8tl/30minutes'

/**
 * The only place the page's URL rule lives server-side. Channel links, episode
 * links, shorts and youtu.be short links all pass; anything else is not a
 * show we can pull from.
 */
function isYouTubeUrl(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  const host = parsed.hostname.toLowerCase().replace(/\.$/u, '')
  return host === 'youtube.com'
    || host.endsWith('.youtube.com')
    || host === 'youtu.be'
    || host.endsWith('.youtu.be')
}

/**
 * Take a free-cut request from getonapod.com/clips.
 *
 * Nothing here creates a user, a workspace or a session. It records that a host
 * asked, tells the editors, and confirms to the host that the clock started.
 * The submitter is told the same thing whether or not they have asked before.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req, 8_192)
    requireOnlyKeys(body, [
      'name',
      'email',
      'show',
      'website',
      'elapsedMs',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'referrer',
      'landing_path',
    ])

    // Honeypot. A real browser never fills it (it is hidden from sight and from
    // the accessibility tree); a form-filler fills everything. Dropped silently
    // with the same reply a saved lead gets, so the filler learns nothing.
    const honeypot = typeof body.website === 'string' ? body.website.trim() : ''
    const elapsed = typeof body.elapsedMs === 'number' && Number.isFinite(body.elapsedMs) ? body.elapsedMs : 0
    if (honeypot || elapsed < MIN_TIME_ON_PAGE_MS) {
      console.log('[Clips Lead] Dropped a submission that failed the bot checks')
      return jsonResponse(req, METHODS, 200, { received: true, startedAt: new Date().toISOString() })
    }

    const name = requireString(body.name, 'name', { max: 120 })
    const email = requireEmail(body.email)
    const show = requireString(body.show, 'show', { max: 500 })
    if (!isYouTubeUrl(show)) {
      throw new HttpError(400, 'INVALID_FIELD', 'Paste a YouTube channel or episode link')
    }
    const showUrl = show.startsWith('http://') ? `https://${show.slice('http://'.length)}` : show
    const utmSource = optionalString(body.utm_source, 'utm_source', 120)
    const utmMedium = optionalString(body.utm_medium, 'utm_medium', 120)
    const utmCampaign = optionalString(body.utm_campaign, 'utm_campaign', 160)
    const referrer = optionalString(body.referrer, 'referrer', 500)
    const landingPath = optionalString(body.landing_path, 'landing_path', 500)
    const userAgent = req.headers.get('user-agent')?.slice(0, 400) ?? null

    const admin = createAdminClient()
    const ipHash = await hashSourceIp(req) ?? UNIDENTIFIED_BUCKET
    const ceiling = ipHash === UNIDENTIFIED_BUCKET ? MAX_UNIDENTIFIED_PER_HOUR : MAX_PER_IP_PER_HOUR

    const { data: outcome, error: recordError } = await admin.rpc('record_clips_lead', {
      p_name: name,
      p_email: email,
      p_show_url: showUrl,
      p_utm_source: utmSource,
      p_utm_medium: utmMedium,
      p_utm_campaign: utmCampaign,
      p_referrer: referrer,
      p_landing_path: landingPath,
      p_user_agent: userAgent,
      p_source_ip_hash: ipHash,
      p_hourly_ceiling: ceiling,
    })

    if (recordError) {
      console.error('[Clips Lead] Could not record the lead')
      throw new HttpError(500, 'LEAD_NOT_SAVED', 'The request could not be saved. Please try again.')
    }

    if (outcome === 'rate_limited') {
      throw new HttpError(
        429,
        'TOO_MANY_REQUESTS',
        'A few requests have already come from here this hour. Email jonathan@getonapod.com and we will start the clock by hand.',
      )
    }

    if (outcome !== 'recorded') {
      console.error('[Clips Lead] Unexpected record outcome')
      throw new HttpError(500, 'LEAD_NOT_SAVED', 'The request could not be saved. Please try again.')
    }

    const startedAt = new Date()

    // Best effort, and after the row exists: a mail provider having a bad
    // afternoon must not turn a saved lead into an error the host sees.
    await Promise.all([
      notifyEditors({ name, email, showUrl, utmSource, utmMedium, utmCampaign, referrer, landingPath, startedAt }),
      confirmToLead({ name, email, showUrl, startedAt }),
    ])

    return jsonResponse(req, METHODS, 200, { received: true, startedAt: startedAt.toISOString() })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})

/**
 * The caller's address, read the same way request-workspace-access reads it.
 * `cf-connecting-ip` is set by the edge, not the caller. `x-forwarded-for` is a
 * list the client can prepend to, so only its last entry is trusted.
 */
function callerAddress(req: Request): string | null {
  const direct = req.headers.get('cf-connecting-ip')?.trim()
  if (direct) return direct
  const chain = req.headers.get('x-forwarded-for')?.split(',').map((part) => part.trim()).filter(Boolean)
  return chain?.length ? chain[chain.length - 1] : null
}

/** Salted with the service role key, so a stored hash cannot be reversed. */
async function hashSourceIp(req: Request): Promise<string | null> {
  const address = callerAddress(req)
  if (!address) return null
  const salt = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${address}`))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

interface MailSettings {
  apiKey: string
  from: string
}

function mailSettings(): MailSettings | null {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim()
  const from = Deno.env.get('RESEND_FROM_EMAIL')?.trim()
  if (!apiKey || !from) return null
  return { apiKey, from }
}

async function sendMail(
  settings: MailSettings,
  message: { to: string; subject: string; text: string; html?: string; replyTo?: string },
): Promise<void> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: settings.from,
        to: [message.to],
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
      // A hung provider must not hold the host's request open; the lead row is
      // already stored, so a missed mail loses nothing that cannot be resent.
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) console.error('[Clips Lead] A notification was rejected by the provider')
  } catch (_error) {
    console.error('[Clips Lead] Notification provider was unavailable')
  }
}

function formatStartedAt(startedAt: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  }).format(startedAt)
}

async function notifyEditors(lead: {
  name: string
  email: string
  showUrl: string
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  referrer: string | null
  landingPath: string | null
  startedAt: Date
}): Promise<void> {
  const settings = mailSettings()
  if (!settings) return
  const to = Deno.env.get('CLIPS_LEAD_NOTIFY_EMAIL')?.trim() || NOTIFY_FALLBACK
  const due = new Date(lead.startedAt.getTime() + SEVENTY_TWO_HOURS_MS)

  const rows: Array<[string, string]> = [
    ['Name', lead.name],
    ['Email', lead.email],
    ['Show', lead.showUrl],
    ['Clock started', formatStartedAt(lead.startedAt)],
    ['Due', formatStartedAt(due)],
    ['utm_source', lead.utmSource ?? '—'],
    ['utm_medium', lead.utmMedium ?? '—'],
    ['utm_campaign', lead.utmCampaign ?? '—'],
    ['Referrer', lead.referrer ?? '—'],
    ['Landing path', lead.landingPath ?? '—'],
  ]
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#19172d"><h2 style="margin:0 0 12px">Free cut requested</h2><p style="margin:0 0 16px"><a href="${escapeHtml(lead.showUrl)}" style="display:inline-block;background:#c8f542;color:#0a0a0b;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:700">Open the episode on YouTube</a></p><table cellpadding="6" style="border-collapse:collapse">${rows
    .map(([label, value]) => `<tr><td style="color:#77728e">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`)
    .join('')}</table></body></html>`
  const text = `Free cut requested\n\nOpen the episode: ${lead.showUrl}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}`

  await sendMail(settings, {
    to,
    replyTo: lead.email,
    subject: `Free cut — ${lead.name} — ${lead.showUrl}`,
    text,
    html,
  })
}

async function confirmToLead(lead: { name: string; email: string; showUrl: string; startedAt: Date }): Promise<void> {
  const settings = mailSettings()
  if (!settings) return
  const text = [
    `Hi ${lead.name},`,
    '',
    'Thanks. We pulled your episode from here:',
    lead.showUrl,
    '',
    `The clock started at ${formatStartedAt(lead.startedAt)}. Five clips and two thumbnails land in this inbox within 72 hours.`,
    '',
    'If you have favorite moments, reply to this email with timestamps and they jump the queue. No call needed.',
    '',
    `If you would rather talk, fifteen minutes is here: ${CAL_URL}`,
    '',
    'Jonathan',
    'Get On A Pod',
  ].join('\n')

  await sendMail(settings, {
    to: lead.email,
    replyTo: Deno.env.get('CLIPS_LEAD_NOTIFY_EMAIL')?.trim() || NOTIFY_FALLBACK,
    subject: 'Your clips are in the queue',
    text,
  })
}
