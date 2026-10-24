import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'
import type { ClipsAttribution } from '@/lib/clipsAnalytics'

export interface ClipsLeadInput {
  name: string
  email: string
  show: string
  /** The honeypot. A person never fills it; it is sent as-is so the function can drop fillers silently. */
  website: string
  /** Milliseconds between the page rendering and the submit. */
  elapsedMs: number
  attribution: ClipsAttribution
}

export interface ClipsLeadReceipt {
  /** When the function stamped the clock, ISO 8601. */
  startedAt: string
}

const SEND_FAILED = "Something broke on our side. Email jonathan@getonapod.com and we'll start the clock by hand."

/**
 * Ask for the free cut.
 *
 * There is no account and no session: the caller is a stranger with a YouTube
 * link, which is why this goes through the edge function and not the table.
 * The function validates everything again, rate-limits per address, stores the
 * row and sends both emails.
 */
export async function requestClipsCut(input: ClipsLeadInput): Promise<ClipsLeadReceipt> {
  const attribution = input.attribution
  const { data, error } = await supabase.functions.invoke('clips-lead', {
    body: {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      show: input.show.trim(),
      website: input.website,
      elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
      // Omitted rather than sent empty: the function rejects unknown fields and
      // stores null for anything absent.
      ...(attribution.utm_source ? { utm_source: attribution.utm_source } : {}),
      ...(attribution.utm_medium ? { utm_medium: attribution.utm_medium } : {}),
      ...(attribution.utm_campaign ? { utm_campaign: attribution.utm_campaign } : {}),
      ...(attribution.referrer ? { referrer: attribution.referrer } : {}),
      ...(attribution.landing_path ? { landing_path: attribution.landing_path } : {}),
    },
  })

  if (error) {
    // No Response means the request never reached the function (a dropped
    // connection, a blocked origin); its wording is for a developer. The host
    // at the form gets the plain version with the fallback address in it.
    const context = (error as { context?: unknown }).context
    if (!(context instanceof Response)) throw new Error(SEND_FAILED)
    throw await toFunctionError(error, SEND_FAILED)
  }

  const startedAt = typeof data?.startedAt === 'string' ? data.startedAt : new Date().toISOString()
  return { startedAt }
}
