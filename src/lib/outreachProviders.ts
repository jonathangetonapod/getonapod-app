/**
 * What the screens say about each sending platform a workspace can connect.
 *
 * The edge function is the authority on what a provider can do (it returns
 * `capabilities` on the integration); this file is only the words and the
 * defaults for a screen that has not heard back yet.
 */

import type {
  OutreachProviderCapabilities,
  OutreachProviderKind,
  WorkspaceInstantlyIntegration,
} from '@/services/workspaceCampaigns'

export const OUTREACH_PROVIDER_LABELS: Record<OutreachProviderKind, string> = {
  instantly: 'Instantly',
  emailbison: 'Email Bison',
  reachinbox: 'ReachInbox',
}

/** The provider a connection names, reading older responses as Instantly. */
export function integrationProvider(
  integration: Pick<WorkspaceInstantlyIntegration, 'provider'> | null | undefined,
): OutreachProviderKind {
  return integration?.provider ?? 'instantly'
}

export function integrationProviderLabel(
  integration: Pick<WorkspaceInstantlyIntegration, 'provider' | 'provider_label'> | null | undefined,
): string {
  return integration?.provider_label || OUTREACH_PROVIDER_LABELS[integrationProvider(integration)]
}

/**
 * The platform a response names, or null when there is none to name.
 *
 * Responses written before other providers existed omit the field and could
 * only mean Instantly. The server sends null when no platform is connected,
 * and a screen still loading has no response at all; both read as null so the
 * copy says "your sending platform" instead of naming a brand that may be wrong.
 */
export function responseProviderLabel(
  response: { provider_label?: string | null } | null | undefined,
): string | null {
  if (!response) return null
  if (response.provider_label === undefined) return 'Instantly'
  return response.provider_label || null
}

export interface OutreachProviderInfo {
  kind: OutreachProviderKind
  label: string
  /** One line on the picker card. */
  tagline: string
  keyLabel: string
  keyPlaceholder: string
  /** Where the agency finds the key in that product. */
  keyHelp: string
  /** Email Bison runs on the agency's own address. */
  needsBaseUrl: boolean
  /** Shown before connecting, so nobody is surprised afterwards. */
  limitations: string[]
  capabilities: OutreachProviderCapabilities
}

export const OUTREACH_PROVIDERS: OutreachProviderInfo[] = [
  {
    kind: 'instantly',
    label: 'Instantly',
    tagline: 'Campaigns, leads, mailbox pause and daily send history.',
    keyLabel: 'Instantly V2 API key',
    keyPlaceholder: 'Paste the workspace API key',
    keyHelp: 'In Instantly: Settings → Integrations → API keys. Scopes needed: workspace and account read; campaign read/create/update; lead read/create/update.',
    needsBaseUrl: false,
    limitations: [],
    capabilities: { mailboxPause: true, mailboxSendHistory: true, sendingStatus: true, inbox: true },
  },
  {
    kind: 'emailbison',
    label: 'Email Bison',
    tagline: 'Campaigns and leads on your own Email Bison address. Mailboxes are managed there.',
    keyLabel: 'Email Bison API token',
    keyPlaceholder: 'Paste an api-user token',
    keyHelp: 'In Email Bison: Settings → Developer API → New API token. Choose an api-user token, which is tied to one workspace.',
    needsBaseUrl: true,
    limitations: [
      'Mailboxes are paused and resumed in Email Bison, not here.',
      'Mailboxes show totals, not a day-by-day send history.',
    ],
    capabilities: { mailboxPause: false, mailboxSendHistory: false, sendingStatus: false, inbox: false },
  },
  {
    kind: 'reachinbox',
    label: 'ReachInbox',
    tagline: 'Campaigns and leads through ReachInbox. Mailboxes are managed there.',
    keyLabel: 'ReachInbox API key',
    keyPlaceholder: 'Paste the workspace API key',
    keyHelp: 'In ReachInbox: Settings → API. Each ReachInbox workspace has its own key.',
    needsBaseUrl: false,
    limitations: [
      'Mailboxes are paused and resumed in ReachInbox, not here.',
      'Only campaigns created here can carry your written pitch: ReachInbox does not let us read a campaign’s emails back.',
    ],
    capabilities: { mailboxPause: false, mailboxSendHistory: false, sendingStatus: false, inbox: false },
  },
]

export function outreachProviderInfo(kind: OutreachProviderKind | null | undefined): OutreachProviderInfo {
  return OUTREACH_PROVIDERS.find((provider) => provider.kind === kind) ?? OUTREACH_PROVIDERS[0]
}
