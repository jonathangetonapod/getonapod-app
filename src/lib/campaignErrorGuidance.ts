/**
 * What a refused send actually means, and the one thing that resolves it.
 *
 * The edge function refuses with a precise code and a sentence written for the
 * person who has to act. That sentence is accurate but it ends the interaction:
 * "this host has already replied" leaves the operator holding a finished draft
 * with nowhere to take it. Each refusal here carries the move that follows it,
 * so a dead end becomes a next step.
 *
 * An unmapped code returns null on purpose. The raw server message is a better
 * fallback than invented guidance, and a new refusal added to the function
 * should degrade to the honest text rather than to something plausible.
 */

import type { WorkspaceModule } from '@/lib/workspaceRoutes'

export type CampaignErrorRemedy =
  /** Temporary. Running the same action again is the whole fix. */
  | { kind: 'retry'; label: string }
  /** Fixable in this dialog, on the contact step. */
  | { kind: 'contact'; label: string }
  /** The work belongs on another page. */
  | { kind: 'link'; label: string; module: WorkspaceModule }
  /** Nothing to offer: the refusal is final and correct. */
  | { kind: 'none' }

export interface CampaignErrorGuidance {
  title: string
  explanation: string
  remedy: CampaignErrorRemedy
}

const GUIDANCE: Record<string, CampaignErrorGuidance> = {
  CAMPAIGN_CONTACT_REQUIRED: {
    title: 'This podcast has no contact email yet',
    explanation: 'The pitch is written and saved. It needs an address to send to before it can join the campaign.',
    remedy: { kind: 'contact', label: 'Add a contact email' },
  },
  CAMPAIGN_CONTACT_SUPPRESSED: {
    title: 'This host asked not to be contacted',
    explanation: 'The block covers every client in this workspace, not just this one, so the pitch cannot be added for anybody. If it was set by mistake, it can be lifted in Relationships.',
    remedy: { kind: 'link', label: 'Open Relationships', module: 'relationships' },
  },
  CAMPAIGN_CONTACT_IN_CONVERSATION: {
    title: 'A conversation with this host is already open',
    explanation: 'Cold outreach on top of a live thread reads as a different agency writing twice. Continue the existing conversation instead.',
    remedy: { kind: 'link', label: 'Open Relationships', module: 'relationships' },
  },
  CAMPAIGN_CONTACT_ALREADY_IN_OUTREACH: {
    title: 'This address is already in the campaign',
    explanation: 'The same contact is in outreach under another show. One person receiving two pitches from the same campaign experiences both, whatever the shows are called here.',
    remedy: { kind: 'link', label: 'Open the campaign', module: 'client-campaigns' },
  },
  CAMPAIGN_PITCH_LOCKED: {
    title: 'This pitch can no longer be edited',
    explanation: 'The host has already been sent a step of the sequence, or has replied. What they read cannot be unsent, so the copy is frozen to keep our record matching their inbox.',
    remedy: { kind: 'link', label: 'Open the campaign', module: 'client-campaigns' },
  },
  CAMPAIGN_SETUP_IN_PROGRESS: {
    title: 'The campaign is still being created',
    explanation: 'The sending platform is setting this campaign up. Nothing was lost — the draft is intact and sending it again in a moment will work.',
    remedy: { kind: 'retry', label: 'Try again' },
  },
  CAMPAIGN_RELATIONSHIP_CHECK_FAILED: {
    title: 'The outreach history could not be checked',
    explanation: 'This check is what stops a pitch reaching someone who opted out, so the send stops rather than skipping it. Nothing was sent.',
    remedy: { kind: 'retry', label: 'Try again' },
  },
  CAMPAIGN_CONTACT_DEDUPE_FAILED: {
    title: 'The contact could not be checked for duplicates',
    explanation: 'The send stopped before creating anything, so this podcast is not in the campaign and no email went out.',
    remedy: { kind: 'retry', label: 'Try again' },
  },
  INSTANTLY_LEAD_NOT_CREATED: {
    title: 'The sending platform did not add this contact',
    explanation: 'The campaign is connected but the contact was not accepted. Nothing was sent to the host. If this repeats, the address may be on the sending platform’s block list — a retry cannot clear that; check the list in the sending platform.',
    remedy: { kind: 'retry', label: 'Try again' },
  },
  INSTANTLY_NOT_CONNECTED: {
    title: 'No sending platform is connected',
    explanation: 'Pitches can be written and saved without it, but joining a campaign needs the workspace API key. The workspace owner can add it on Client Campaigns.',
    remedy: { kind: 'link', label: 'Open Client Campaigns', module: 'client-campaigns' },
  },
  CAMPAIGN_SENDER_REQUIRED: {
    title: 'The campaign has no sending account',
    explanation: 'A campaign needs at least one active sending mailbox before it can send anything.',
    remedy: { kind: 'link', label: 'Open Mailboxes', module: 'mailboxes' },
  },
  CAMPAIGN_TARGET_NOT_APPROVED: {
    title: 'This podcast is not approved yet',
    explanation: 'Only podcasts the client has approved can join a campaign. The pitch stays saved until approval arrives.',
    remedy: { kind: 'none' },
  },
  CAMPAIGN_NOT_SENDABLE: {
    title: 'That campaign sends copy of its own',
    explanation: 'Its opening email does not read the pitch written here, so sending into it would deliver whatever copy is already in the sending platform — not this one. Campaigns created from the client page carry the right sequence. The draft is saved and nothing was sent.',
    remedy: { kind: 'link', label: 'Open Clients', module: 'clients' },
  },
  CAMPAIGN_LINK_DELETED: {
    title: 'That campaign was deleted in the sending platform',
    explanation: 'It has been dropped as a send target, so it will not be offered again. The pitch and the podcast list are untouched — pick another campaign, or create one from the client page.',
    remedy: { kind: 'link', label: 'Open Clients', module: 'clients' },
  },
  CAMPAIGN_NOT_LINKED: {
    title: 'That campaign is not linked to this client',
    explanation: 'Only campaigns linked to this client can receive their pitches, which is what keeps replies attributed to the right person. Linking happens on the client page.',
    remedy: { kind: 'link', label: 'Open Clients', module: 'clients' },
  },
  CAMPAIGN_LINKS_UNAVAILABLE: {
    title: 'The linked campaigns could not be checked',
    explanation: 'The send stopped before creating anything rather than guessing which campaign was meant. Nothing was sent.',
    remedy: { kind: 'retry', label: 'Try again' },
  },
  CAMPAIGN_LINK_FAILED: {
    title: 'The campaign was created but not linked',
    explanation: 'It exists in the sending platform with the right sequence, but the link to this client was not saved, so it cannot receive pitches yet. Linking it on the client page finishes the job — do not create a second one.',
    remedy: { kind: 'link', label: 'Open Clients', module: 'clients' },
  },
  CAMPAIGN_NOT_ASSIGNED: {
    title: 'This client has no campaign at the sending platform yet',
    explanation: 'Pitches can be written and saved before a campaign exists, but joining one needs the campaign created first. Setup happens on Client Campaigns.',
    remedy: { kind: 'link', label: 'Open Client Campaigns', module: 'client-campaigns' },
  },

  // The provider family. Instantly answers for itself here, and the difference
  // between "your key is wrong" and "the thing your key points at is gone"
  // decides who fixes it, so they do not share one message.
  INSTANTLY_RESOURCE_NOT_FOUND: {
    title: 'The campaign for this client no longer exists',
    explanation: 'This client is mapped to a campaign that has since been deleted in the sending platform, so nothing can be added to it. Re-running setup on Client Campaigns builds a new one. The pitch and the podcast list here are unaffected.',
    remedy: { kind: 'link', label: 'Open Client Campaigns', module: 'client-campaigns' },
  },
  INSTANTLY_KEY_REJECTED: {
    title: 'The sending platform rejected the workspace API key',
    explanation: 'The stored key is no longer valid — usually revoked or rotated in the sending platform. Nothing was sent. The workspace owner can reconnect on Client Campaigns.',
    remedy: { kind: 'link', label: 'Open Client Campaigns', module: 'client-campaigns' },
  },
  INSTANTLY_SCOPE_REQUIRED: {
    title: 'The key is missing a permission',
    explanation: 'The key authenticates but is not allowed to do this. It needs campaign and lead scopes. Reconnecting with a fully scoped key resolves it.',
    remedy: { kind: 'link', label: 'Open Client Campaigns', module: 'client-campaigns' },
  },
  INSTANTLY_PLAN_REQUIRED: {
    title: 'The workspace has no active plan',
    explanation: 'The sending platform refuses API calls from a workspace without a paid plan. This is resolved in the sending platform, not here.',
    remedy: { kind: 'none' },
  },
  INSTANTLY_WORKSPACE_MISMATCH: {
    title: 'The key points at a different sending-platform workspace',
    explanation: 'The stored campaigns belong to a workspace this key cannot see, so nothing here matches what the sending platform returns. Reconnecting with the right key resolves it.',
    remedy: { kind: 'link', label: 'Open Client Campaigns', module: 'client-campaigns' },
  },
  INSTANTLY_CREDENTIAL_INVALID: {
    title: 'The stored key could not be read',
    explanation: 'The saved credential failed to decrypt, so no call was made and nothing was sent. Reconnecting the sending platform stores a fresh one.',
    remedy: { kind: 'link', label: 'Open Client Campaigns', module: 'client-campaigns' },
  },
  INSTANTLY_SENDER_UNAVAILABLE: {
    title: 'The sending account is not available',
    explanation: 'The mailbox this campaign sends from is disconnected or no longer active in the sending platform.',
    remedy: { kind: 'link', label: 'Open Mailboxes', module: 'mailboxes' },
  },
  INSTANTLY_RATE_LIMITED: {
    title: 'The sending platform is rate limiting this workspace',
    explanation: 'Too many requests in a short window. This clears on its own within a minute or so. If the campaign was already live, retry rather than assume: the send may have partially gone through before the limit hit.',
    remedy: { kind: 'retry', label: 'Try again' },
  },
  INSTANTLY_REQUEST_FAILED: {
    title: 'The sending platform could not complete the request',
    explanation: 'The provider returned an error we do not have a specific handler for. The send stopped before anything reached a host.',
    remedy: { kind: 'retry', label: 'Try again' },
  },
  INSTANTLY_RESPONSE_INVALID: {
    title: 'The sending platform returned something unreadable',
    explanation: 'The response did not match the shape we expect, so it was rejected rather than acted on half-understood. Nothing was sent.',
    remedy: { kind: 'retry', label: 'Try again' },
  },
  PROVIDER_FEATURE_UNSUPPORTED: {
    title: 'Your sending platform does not offer this',
    explanation: 'The connected sending platform has no API for this action, so it is not available here. It can still be done in the platform itself.',
    remedy: { kind: 'none' },
  },
  INSTANTLY_WORKSPACE_ALREADY_CONNECTED: {
    title: 'That account is connected to another workspace',
    explanation: 'Each sending-platform account can be connected to one Get On A Pod workspace. Use a different account, or disconnect it from the other workspace first.',
    remedy: { kind: 'none' },
  },
  CAMPAIGN_PROVIDER_SETUP_FAILED: {
    title: 'Campaign setup could not be completed',
    explanation: 'The campaign could not be created or recovered at the sending platform. Nothing was sent and the draft is intact.',
    remedy: { kind: 'retry', label: 'Try again' },
  },
  CAMPAIGN_LOOKUP_FAILED: {
    title: 'The client campaign could not be loaded',
    explanation: 'The campaign record could not be read, so the send stopped before it began. Nothing was sent.',
    remedy: { kind: 'retry', label: 'Try again' },
  },
  CAMPAIGN_TARGET_LOOKUP_FAILED: {
    title: 'The campaign podcasts could not be loaded',
    explanation: 'The podcast list could not be read, so the send stopped before it began. Nothing was sent.',
    remedy: { kind: 'retry', label: 'Try again' },
  },
}

/**
 * Email Bison and ReachInbox fail with the same family of codes as Instantly,
 * prefixed with their own name (EMAILBISON_KEY_REJECTED). One template per
 * failure keeps the advice identical across providers and names the right one.
 */
const PROVIDER_PREFIXES: Record<string, string> = {
  // Only codes the table above leaves out reach the template (INSTANTLY_UNAVAILABLE).
  INSTANTLY: 'Instantly',
  EMAILBISON: 'Email Bison',
  REACHINBOX: 'ReachInbox',
}

const reconnect = { kind: 'link', label: 'Open Client Campaigns', module: 'client-campaigns' } as const

function providerFamilyGuidance(label: string, failure: string): CampaignErrorGuidance | null {
  switch (failure) {
    case 'KEY_REJECTED':
      return {
        title: `${label} rejected the workspace API key`,
        explanation: `The key is not valid — usually revoked, rotated, or copied incompletely. Nothing was sent. The workspace owner can reconnect on Client Campaigns.`,
        remedy: reconnect,
      }
    case 'SCOPE_REQUIRED':
      return {
        title: `The ${label} key is missing a permission`,
        explanation: `The key authenticates but is not allowed to do this. Create a key with access to campaigns, leads and sending accounts, then reconnect.`,
        remedy: reconnect,
      }
    case 'PLAN_REQUIRED':
      return {
        title: `The ${label} workspace has no plan with API access`,
        explanation: `${label} refuses API calls from this workspace. This is resolved in ${label}, not here.`,
        remedy: { kind: 'none' },
      }
    case 'RESOURCE_NOT_FOUND':
      return {
        title: `The ${label} campaign for this client no longer exists`,
        explanation: `It was deleted in ${label}. Re-running setup on Client Campaigns builds a new one; the pitch and podcast list here are unaffected.`,
        remedy: reconnect,
      }
    case 'RATE_LIMITED':
      return {
        title: `${label} is rate limiting this workspace`,
        explanation: 'Too many requests in a short window. This clears on its own within a minute. If the campaign was live, retry rather than assume: part of the send may have gone through.',
        remedy: { kind: 'retry', label: 'Try again' },
      }
    case 'REQUEST_REJECTED':
      return {
        title: `${label} refused the request`,
        explanation: `${label} gave the reason below. Nothing was sent. Most often a setting it does not accept, such as a timezone or a mailbox it does not know.`,
        remedy: { kind: 'retry', label: 'Try again' },
      }
    case 'URL_INVALID':
      return {
        title: `That ${label} address cannot be used`,
        explanation: `Enter the address you log in to ${label} at, for example https://send.youragency.com — https, no path, a public domain.`,
        remedy: { kind: 'none' },
      }
    case 'REDIRECT_REFUSED':
      return {
        title: `The ${label} address redirected somewhere else`,
        explanation: `Requests are never followed to another address. Use the final address you log in at, exactly as it appears in the browser.`,
        remedy: { kind: 'none' },
      }
    case 'CAMPAIGN_REQUIRED':
    case 'LEAD_INVALID':
      return {
        title: `This lead cannot be removed from ${label} from here`,
        explanation: `The record does not say which ${label} campaign or lead it belongs to, so nothing was removed. Remove it in ${label} directly.`,
        remedy: { kind: 'none' },
      }
    case 'UNAVAILABLE':
    case 'REQUEST_FAILED':
    case 'RESPONSE_INVALID':
      return {
        title: `${label} could not complete the request`,
        explanation: `${label} did not answer as expected, so nothing was acted on and nothing was sent.`,
        remedy: { kind: 'retry', label: 'Try again' },
      }
    default:
      return null
  }
}

export function campaignErrorGuidance(
  code: string | null | undefined,
): CampaignErrorGuidance | null {
  if (!code) return null
  if (GUIDANCE[code]) return GUIDANCE[code]
  const match = code.match(/^([A-Z]+)_([A-Z_]+)$/)
  const label = match ? PROVIDER_PREFIXES[match[1]] : undefined
  return label && match ? providerFamilyGuidance(label, match[2]) : null
}

/**
 * `toFunctionError` puts the refusal code on `name`, falling back to a marker
 * when the response carried none. That marker is not a code.
 */
export function errorCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  return error.name && error.name !== 'EdgeFunctionError' && error.name !== 'Error'
    ? error.name
    : null
}

/** The HTTP status `toFunctionError` attaches, when the failure reached a response. */
export function errorStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' && Number.isFinite(status) ? status : null
}

export interface CampaignErrorReport {
  code: string | null
  status: number | null
  message: string
  /** What was being acted on. Empty values are dropped rather than printed blank. */
  context?: Record<string, string | null | undefined>
}

/**
 * The refusal as something an operator can hand to somebody else.
 *
 * A code on screen is enough to act on when the guidance above covers it. When
 * it does not — a provider fault, a refusal added to the function since this
 * shipped — the next step is asking someone, and that conversation starts by
 * retyping what the screen said. This builds that text instead: the code, the
 * status, the server's own sentence, and which client, podcast, and campaign
 * it happened on, which is exactly what a reader needs and what a screenshot
 * of a dialog usually crops out.
 */
export function campaignErrorReport(report: CampaignErrorReport): string {
  const lines = [
    `code: ${report.code || 'none'}`,
    `status: ${report.status ?? 'none'}`,
    `message: ${report.message}`,
  ]
  for (const [key, value] of Object.entries(report.context || {})) {
    if (typeof value === 'string' && value.trim()) lines.push(`${key}: ${value.trim()}`)
  }
  return lines.join('\n')
}

/**
 * The toast form of the guidance table, for pages that report campaign errors
 * with a toast rather than an inline panel. The table was written after a dead
 * provider mapping surfaced as a bare 409 sentence with no remedy — and then
 * only the prep dialog ever consulted it, so every mutation on the campaign
 * pages kept surfacing raw server sentences. Falls back to the server's own
 * message when the code has no entry, which is never worse than before.
 */
export function campaignErrorToast(error: unknown, fallback: string): { title: string; description?: string } {
  const guidance = campaignErrorGuidance(errorCode(error))
  if (guidance) {
    return { title: guidance.title, description: guidance.explanation }
  }
  return { title: error instanceof Error ? error.message : fallback }
}
