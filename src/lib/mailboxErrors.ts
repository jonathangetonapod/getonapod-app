/**
 * What a mailbox's raw provider error means, in one short label and one line.
 *
 * Instantly hands back the SMTP or OAuth failure verbatim: multi-line Gmail
 * bounce text, stack-ish token errors. Shown raw, 300 of those turned the
 * mailbox list into a wall of text and still did not say what to do. New
 * patterns go in MAILBOX_ERROR_PATTERNS; first match wins.
 */

/** `disconnected` means the mailbox has to be reconnected, not just waited out. */
export type MailboxErrorKind = 'error' | 'disconnected'

export interface MailboxErrorPattern {
  id: string
  test: RegExp
  label: string
  hint: string
  kind: MailboxErrorKind
}

export interface HumanizedMailboxError {
  id: string
  label: string
  hint: string
  kind: MailboxErrorKind
  /** The provider's message as received, for the Details view. */
  raw: string | null
}

export const MAILBOX_ERROR_PATTERNS: MailboxErrorPattern[] = [
  {
    id: 'gmail-daily-limit',
    test: /550[- ]5\.4\.5|daily user sending limit exceeded/i,
    label: 'Gmail daily limit',
    hint: 'Google paused sending for this account until the limit resets.',
    kind: 'error',
  },
  {
    id: 'reconnect',
    test: /can['’]?t create new access token/i,
    label: 'Reconnect needed',
    hint: 'The OAuth token expired. Reconnect this mailbox in Instantly.',
    kind: 'disconnected',
  },
]

const HINT_MAX_LENGTH = 80

/** Fallback labels by Instantly account status when there is no message to match. */
const STATUS_FALLBACK: Record<number, { label: string; kind: MailboxErrorKind }> = {
  [-1]: { label: 'Connection error', kind: 'disconnected' },
  [-2]: { label: 'Soft bounce error', kind: 'error' },
  [-3]: { label: 'Sending error', kind: 'error' },
}

export function truncateHint(raw: string): string {
  const flat = raw.replace(/\s+/g, ' ').trim()
  return flat.length > HINT_MAX_LENGTH ? `${flat.slice(0, HINT_MAX_LENGTH).trimEnd()}…` : flat
}

/**
 * The humanized error for a mailbox, or null when it has none. `status` is
 * Instantly's account status; only a negative status is an error; a stale
 * message left on a recovered account is not.
 */
export function humanizeMailboxError(status: number, rawMessage: string | null | undefined): HumanizedMailboxError | null {
  if (!(status < 0)) return null
  const raw = rawMessage?.trim() || null
  if (raw) {
    const match = MAILBOX_ERROR_PATTERNS.find((pattern) => pattern.test.test(raw))
    if (match) return { id: match.id, label: match.label, hint: match.hint, kind: match.kind, raw }
  }
  const fallback = STATUS_FALLBACK[status] ?? { label: 'Sending error', kind: 'error' as const }
  return {
    id: raw ? 'unmatched' : `status-${status}`,
    label: fallback.label,
    hint: raw ? truncateHint(raw) : 'Instantly did not say why. Open the mailbox in Instantly to check it.',
    kind: fallback.kind,
    raw,
  }
}

export interface TextPart {
  text: string
  href?: string
}

const URL_PATTERN = /https?:\/\/[^\s<>"'()]+/g

/**
 * Splits text into plain runs and http(s) links, so a raw error's "go to
 * https://support.google.com/..." renders as a link. Trailing sentence
 * punctuation stays text, not part of the URL.
 */
export function linkifyText(text: string): TextPart[] {
  const parts: TextPart[] = []
  let cursor = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0
    const url = match[0].replace(/[.,;:!?]+$/, '')
    if (start > cursor) parts.push({ text: text.slice(cursor, start) })
    parts.push({ text: url, href: url })
    cursor = start + url.length
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) })
  return parts
}
