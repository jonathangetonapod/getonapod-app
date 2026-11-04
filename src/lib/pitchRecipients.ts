/**
 * Who a pitch goes to: exactly one address, on every platform. Step 1 draws
 * on three sources — the free Podscan inbox, the verified host email and
 * addresses the operator found — and the operator picks one of them.
 *
 * Pure operations for Step 1. The server re-derives the source and status
 * when the choice is saved (supabase/functions/_shared/pitchRecipients.ts), so
 * these rules decide what the screen shows between saves, not what is true.
 */

export type RecipientSource = 'podscan' | 'verified' | 'manual'
export type RecipientStatus = 'verified' | 'unverified' | 'bounced'
export type ContactRole = 'host' | 'producer' | 'booking' | 'other'
export type MxStatus = 'ok' | 'none' | 'unknown'

export interface PitchRecipient {
  email: string
  source: RecipientSource
  sources: RecipientSource[]
  status: RecipientStatus
  /** Always the To: one address per pitch. */
  role: 'to'
  contact_role?: ContactRole
  mx?: MxStatus
}

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  host: 'Host',
  producer: 'Producer',
  booking: 'Booking',
  other: 'Other',
}

export const SOURCE_LABELS: Record<RecipientSource, string> = {
  podscan: 'Podscan',
  verified: 'Verified',
  manual: 'Manual',
}

const SOURCE_PRIORITY: Record<RecipientSource, number> = { verified: 0, manual: 1, podscan: 2 }
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeRecipientEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function isValidRecipientEmail(value: string): boolean {
  const email = normalizeRecipientEmail(value)
  return email.length <= 254 && EMAIL_PATTERN.test(email)
}

/** "Podscan + Verified": every source the address was found through. */
export function sourceBadgeLabel(recipient: PitchRecipient): string {
  // Read in the order a person would say it: the free source first.
  return [...recipient.sources]
    .sort((a, b) => SOURCE_PRIORITY[b] - SOURCE_PRIORITY[a])
    .map((source) => SOURCE_LABELS[source])
    .join(' + ')
}

/** What the screen knows about this podcast's addresses. */
export interface RecipientContext {
  podscanEmails: string[]
  /** The verified host email the platform holds, if any. */
  verifiedEmail: string | null
  /** Addresses a send proved dead. */
  bounced?: string[] | null
}

/**
 * Picks one address, replacing whatever was chosen. An address that appears
 * in several sources (a Podscan inbox that is also the verified contact) is
 * one recipient with every badge, however it was picked.
 */
export function chooseRecipient(
  context: RecipientContext,
  email: string,
  source: RecipientSource,
  options: { contactRole?: ContactRole } = {},
): PitchRecipient[] {
  const address = normalizeRecipientEmail(email)
  const sources = new Set<RecipientSource>([source])
  if (context.podscanEmails.some((item) => normalizeRecipientEmail(item) === address)) sources.add('podscan')
  if (context.verifiedEmail && normalizeRecipientEmail(context.verifiedEmail) === address) sources.add('verified')
  const sorted = [...sources].sort((a, b) => SOURCE_PRIORITY[a] - SOURCE_PRIORITY[b])
  const bounced = (context.bounced ?? []).some((item) => normalizeRecipientEmail(item) === address)
  const contactRole = options.contactRole ?? (sorted.includes('manual') || sorted.includes('verified') ? 'host' : undefined)
  return [{
    email: address,
    source: sorted[0],
    sources: sorted,
    status: bounced ? 'bounced' : sorted.includes('verified') ? 'verified' : 'unverified',
    role: 'to',
    ...(contactRole ? { contact_role: contactRole } : {}),
  }]
}

/** The address the pitch will go to, or null when none can receive it. */
export function recipientTo(list: PitchRecipient[]): PitchRecipient | null {
  const recipient = list[0]
  return recipient && recipient.status !== 'bounced' ? recipient : null
}

export function setContactRole(list: PitchRecipient[], contactRole: ContactRole): PitchRecipient[] {
  return list.map((recipient) => ({ ...recipient, contact_role: contactRole }))
}

/** Marks the recipient bounced when the shared network says so. */
export function applyBounces(list: PitchRecipient[], bounced: string[] | null | undefined): PitchRecipient[] {
  if (!bounced?.length) return list
  const dead = new Set(bounced.map(normalizeRecipientEmail))
  return list.map((recipient) => (dead.has(recipient.email) ? { ...recipient, status: 'bounced' } : recipient))
}

export interface RecipientSeedContext extends RecipientContext {
  /** Saved on the shortlist row; null when never chosen. */
  saved: PitchRecipient[] | null | undefined
  /** The single address older pitches kept on the campaign target. */
  legacyContactEmail: string | null | undefined
}

/**
 * What Step 1 opens with. A saved choice wins. An older pitch's address
 * stays its recipient. A fresh pitch gets the address the old flow would have
 * picked — the verified email if there is one, else the first Podscan inbox —
 * so the simple case is no clicks at all.
 */
export function seedRecipients(context: RecipientSeedContext): PitchRecipient[] {
  const saved = Array.isArray(context.saved) ? context.saved.find((item) => item && isValidRecipientEmail(item.email)) : null
  if (saved) {
    const sources = saved.sources?.length ? saved.sources : [saved.source]
    return applyBounces([{
      ...saved,
      email: normalizeRecipientEmail(saved.email),
      sources,
      source: [...sources].sort((a, b) => SOURCE_PRIORITY[a] - SOURCE_PRIORITY[b])[0],
      role: 'to',
    }], context.bounced)
  }
  const legacy = context.legacyContactEmail && isValidRecipientEmail(context.legacyContactEmail) ? context.legacyContactEmail : null
  const first = legacy ?? (context.verifiedEmail && isValidRecipientEmail(context.verifiedEmail) ? context.verifiedEmail : null) ?? context.podscanEmails[0] ?? null
  if (!first) return []
  const address = normalizeRecipientEmail(first)
  const source: RecipientSource = context.verifiedEmail && normalizeRecipientEmail(context.verifiedEmail) === address
    ? 'verified'
    : context.podscanEmails.some((item) => normalizeRecipientEmail(item) === address) ? 'podscan' : 'manual'
  return chooseRecipient(context, address, source)
}

/** Whether two choices would save the same thing, so an unchanged one is not resent. */
export function sameRecipients(a: PitchRecipient[], b: PitchRecipient[]): boolean {
  const key = (list: PitchRecipient[]) => JSON.stringify(list.map((recipient) => [
    recipient.email, [...recipient.sources].sort(), recipient.contact_role ?? null,
  ]))
  return key(a) === key(b)
}
