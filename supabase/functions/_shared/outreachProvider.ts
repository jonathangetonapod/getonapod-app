/**
 * The outreach provider a workspace sends through: Instantly or Email Bison.
 *
 * Everything above this interface speaks one vocabulary — the shapes below,
 * with campaign and lead statuses in Instantly's numeric codes, because those
 * are what the database CHECKs, the RPCs and the UI already understand. Each
 * adapter translates its provider into that vocabulary and nothing else leaks
 * through. See docs/outreach-providers.md.
 */

export type OutreachProviderKind = "instantly" | "emailbison" | "reachinbox";

export const OUTREACH_PROVIDER_KINDS: readonly OutreachProviderKind[] = [
  "instantly",
  "emailbison",
  "reachinbox",
];

export function outreachProviderLabel(kind: OutreachProviderKind): string {
  if (kind === "emailbison") return "Email Bison";
  if (kind === "reachinbox") return "ReachInbox";
  return "Instantly";
}

/**
 * Base for every provider failure. `status` is the provider's HTTP status (0
 * when it could not be reached); `code` is the app-facing error code.
 */
export class OutreachProviderError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "OutreachProviderError";
    this.status = status;
    this.code = code;
  }
}

export interface ProviderWorkspace {
  id: string;
  name: string;
}

export interface AccountStatusMessage {
  code: string | null;
  command: string | null;
  response: string | null;
  e_message: string | null;
  response_code: number | null;
}

export interface AccountTag {
  id: string;
  label: string;
  description: string | null;
}

/**
 * A sending mailbox. `status` uses Instantly's account codes: 1 active,
 * 2 paused, negative values are connection or sending errors.
 */
export interface AccountSummary {
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: number;
  status_message: AccountStatusMessage | null;
  warmup_status: number | null;
  daily_limit: number | null;
  warmup_limit: number | null;
  stat_warmup_score: number | null;
  has_signature: boolean;
  tags: AccountTag[];
}

export interface AccountSendDay {
  /** Calendar day, YYYY-MM-DD. */
  date: string;
  sent: number;
}

export interface WarmupAccountAnalytics {
  sent: number | null;
  health_score: number | null;
}

export interface AnalyticsSummary {
  emails_sent_count: number;
  contacted_count: number;
  open_count_unique: number;
  reply_count_unique: number;
  bounced_count: number;
  unsubscribed_count: number;
  total_interested: number;
  total_meeting_booked: number;
}

export interface CampaignAnalytics {
  campaignId: string;
  status: number | null;
  analytics: AnalyticsSummary;
}

/**
 * The sending window a provider actually holds for a campaign. `days` is
 * indexed 0..6 with 0 = Sunday.
 */
export interface ProviderSchedule {
  name: string | null;
  from: string | null;
  to: string | null;
  timezone: string | null;
  days: boolean[];
}

export interface ProviderCampaign {
  id: string;
  /** Instantly campaign code: 0 draft, 1 active, 2 paused, 3 completed, negative attention. */
  status: number;
  /**
   * The opening step reads the pitch variables this app writes. False when the
   * sequence could not be read: unknown is not a licence to send.
   */
  rendersOurPitch: boolean;
  name: string;
  senderAccounts: string[];
  timezone: string;
  /** New hosts per day. */
  dailyLimit: number;
  emailGap: number | null;
  notSendingStatus: number | null;
  schedule: ProviderSchedule | null;
  timestampCreated: string | null;
  timestampUpdated: string | null;
}

export interface ProviderLead {
  id: string;
  email: string;
  /** Instantly lead code: 1 active, 2 paused, 3 completed, -1 bounced, -2 unsubscribed, -3 skipped. */
  status: number | null;
  email_open_count: number;
  email_reply_count: number;
  timestamp_updated: string | null;
  email_click_count: number;
  last_step_id: string | null;
  email_opened_step: number | null;
  email_replied_step: number | null;
  lt_interest_status: number | null;
  verification_status: number | null;
  timestamp_last_contact: string | null;
  timestamp_last_open: string | null;
  timestamp_last_reply: string | null;
  timestamp_last_click: string | null;
}

/** What this app writes into a provisioned campaign: settings and a 3-step sequence. */
export interface CampaignSpec {
  name: string;
  timezone: string;
  /** New hosts per day. */
  dailyLimit: number;
  senderAccounts: string[];
  /** 0 = Sunday. Empty means Monday to Friday. */
  sendDays?: number[];
  windowStart?: string;
  windowEnd?: string;
  followUpOneDelayDays?: number;
  followUpTwoDelayDays?: number;
}

/** The copy and context one lead's sequence renders. */
export interface PitchVariables {
  pitchSubject: string;
  pitchBody: string;
  followUpOneSubject: string;
  followUpOneBody: string;
  followUpTwoSubject: string;
  followUpTwoBody: string;
  clientName: string;
  podcastName: string;
  targetId: string;
}

export interface NewLead {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  website?: string;
  /** Instantly's personalization field; ignored where a provider has none. */
  personalization?: string;
  variables: PitchVariables;
}

export interface SendingStatus {
  status: string | null;
  status_message: string | null;
  issue_started_at: string | null;
  last_healthy_send_at: string | null;
  in_schedule: boolean | null;
  accounts: {
    total_connected: number | null;
    available: number | null;
    daily_limit_hit: number | null;
    disconnected: number | null;
    slow_ramp_limit_hit: number | null;
  } | null;
  daily_limit: { limit: number | null; sent: number | null; limit_hit: boolean } | null;
  follow_ups_waiting: { count: number | null; earliest_wait_seconds: number | null } | null;
}

export interface ProviderCapabilities {
  /** Pause or resume one sending mailbox. */
  mailboxPause: boolean;
  /** Per-day send counts per mailbox. */
  mailboxSendHistory: boolean;
  /** The provider's own "why is nothing sending" diagnosis. */
  sendingStatus: boolean;
  /** The inbox actions (list, thread, lead detail, interest). */
  inbox: boolean;
}

export interface OutreachProvider {
  readonly kind: OutreachProviderKind;
  readonly label: string;
  readonly capabilities: ProviderCapabilities;

  /** Identity of the provider workspace the key belongs to, plus a read probe. */
  verifyConnection(): Promise<{ workspace: ProviderWorkspace; accounts: AccountSummary[] }>;
  listAccounts(): Promise<AccountSummary[]>;
  accountSendHistory(
    emails: string[],
    options: { days: number; timeZone: string },
  ): Promise<Map<string, AccountSendDay[]>>;
  warmupAnalytics(emails: string[]): Promise<Map<string, WarmupAccountAnalytics>>;
  /** `providerEmail` is the address as the provider spells it. */
  setAccountPaused(providerEmail: string, paused: boolean): Promise<void>;

  /** Every campaign, and whether the listing reached the end. */
  listCampaigns(): Promise<{ campaigns: ProviderCampaign[]; complete: boolean }>;
  /** Campaigns whose name matches a search term (provider-side search). */
  searchCampaigns(term: string, limit: number): Promise<ProviderCampaign[]>;
  /** Throws OutreachProviderError with status 404 when the campaign is gone. */
  getCampaign(id: string): Promise<ProviderCampaign>;
  /** Creates the campaign with this app's settings and sequence. May come back active. */
  createCampaign(spec: CampaignSpec): Promise<ProviderCampaign>;
  /**
   * Makes a just-created (or adopted) campaign ready to receive leads: paused,
   * with the pitch variables registered. Returns the campaign as it now stands.
   *
   * `adopted` means the campaign was found by its name marker rather than
   * created by this call — possibly left half-built by a setup that failed
   * part-way. Providers whose campaign is several resources (Email Bison,
   * ReachInbox) rewrite every one of them from `spec` in that case.
   */
  finishProvisioning(
    campaign: ProviderCampaign,
    spec: CampaignSpec,
    options: { adopted: boolean },
  ): Promise<ProviderCampaign>;
  /** Pushes settings; the sequence only when `includeSequence`. */
  updateCampaign(
    id: string,
    spec: CampaignSpec,
    options: { includeSequence: boolean },
  ): Promise<ProviderCampaign>;
  pauseCampaign(id: string): Promise<ProviderCampaign>;
  activateCampaign(id: string): Promise<ProviderCampaign>;
  /**
   * Deletes the campaign on the platform, with its leads and sequence. Not
   * reversible. Throws OutreachProviderError with status 404 when already gone.
   * "paused" when the platform has no delete (ReachInbox): it is stopped there
   * instead, and stays for someone to delete by hand.
   */
  deleteCampaign(id: string): Promise<"deleted" | "paused">;
  campaignAnalytics(id: string): Promise<AnalyticsSummary>;
  /** Missing ids are absent from the map (usually deleted upstream). */
  bulkCampaignAnalytics(ids: string[]): Promise<Map<string, CampaignAnalytics>>;
  campaignSendingStatus(id: string): Promise<SendingStatus>;

  /** Leads in a campaign, optionally narrowed to one address. */
  listLeads(campaignId: string, email?: string): Promise<ProviderLead[]>;
  /** Null when the provider answered but the lead could not be read. Throws 404 when gone. */
  getLead(leadId: string, campaignId: string | null): Promise<ProviderLead | null>;
  updateLeadVariables(
    lead: ProviderLead,
    campaignId: string,
    variables: PitchVariables,
  ): Promise<ProviderLead | null>;
  /**
   * Adds a lead to a campaign. Returns null when the provider accepted the
   * request but returned no lead; the caller recovers it by listing.
   */
  addLead(
    campaignId: string,
    lead: NewLead,
    options: { skipIfInCampaign: boolean },
  ): Promise<ProviderLead | null>;
  /** Removes the lead from the campaign. Throws 404 when already gone. */
  removeLead(campaignId: string | null, leadId: string): Promise<void>;

  /** The provider's own do-not-contact list. */
  blockAddress(email: string): Promise<void>;
  /** False when no exact entry existed. */
  unblockAddress(email: string): Promise<boolean>;
}

/** A provider id as stored: an Instantly UUID or an Email Bison integer. */
export function isProviderId(value: unknown): value is string {
  return typeof value === "string" &&
    (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ||
      /^[1-9][0-9]{0,17}$/.test(value));
}

export function normalizeProviderId(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return isProviderId(trimmed) ? trimmed.toLowerCase() : null;
}

export function unsupportedFeature(label: string, feature: string): OutreachProviderError {
  return new OutreachProviderError(
    409,
    "PROVIDER_FEATURE_UNSUPPORTED",
    `${label} does not support ${feature}.`,
  );
}
