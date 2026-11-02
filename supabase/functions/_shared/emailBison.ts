/**
 * Email Bison behind the outreach provider interface.
 *
 * Built against the OpenAPI spec at
 * https://dedi.emailbison.com/api/reference.openapi (fetched 2026-11-01). Each
 * customer runs their own instance, so the origin comes from the workspace's
 * connection and is validated by providerHttp before anything is sent.
 *
 * Three things differ from Instantly and shape this file:
 *
 * 1. Statuses are words ("Active", "Paused"); they are translated into
 *    Instantly's numeric codes, which is the app's vocabulary.
 * 2. Custom variables live on the contact across the whole workspace, not on
 *    the lead-in-campaign. Two clients pitching one host would overwrite each
 *    other's copy, so each provisioned campaign reads its own variable names:
 *    goap_c<campaignId>_pitch_body, referenced as {GOAP_C<ID>_PITCH_BODY}.
 * 3. A campaign is several resources (settings, schedule, sequence, sender
 *    list), so reading or writing one is several requests.
 */

import {
  type AccountSendDay,
  type AccountSummary,
  type AnalyticsSummary,
  type CampaignAnalytics,
  type CampaignSpec,
  type NewLead,
  type OutreachProvider,
  OutreachProviderError,
  type PitchVariables,
  type ProviderCampaign,
  type ProviderLead,
  type ProviderSchedule,
  type ProviderWorkspace,
  type SendingStatus,
  unsupportedFeature,
  type WarmupAccountAnalytics,
} from "./outreachProvider.ts";
import { providerRequest, type ProviderRequestTarget } from "./providerHttp.ts";

const LABEL = "Email Bison";
const CODE = "EMAILBISON";
const EMAILS_PER_HOST = 3;
// Bison pages are 15 rows and the docs list no page-size parameter; per_page
// is still sent in case an instance honours it. 100 pages is 1,500 rows at
// the documented size.
const MAX_PAGES = 100;
const PAGE_SIZE = 100;
// At or below this many ids, bulk analytics reads each campaign directly
// rather than paging the whole list.
const DIRECT_ANALYTICS_LIMIT = 15;
export const EMAILBISON_DEFAULT_TIMEZONE = "America/New_York";
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

type Json = Record<string, unknown>;

function record(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
}

/** Most Bison responses wrap the payload in { data }. */
function dataOf(value: unknown): unknown {
  const wrapper = record(value);
  return wrapper && "data" in wrapper ? wrapper.data : value;
}

function invalid(what: string): OutreachProviderError {
  return new OutreachProviderError(502, `${CODE}_RESPONSE_INVALID`, `${LABEL} returned an invalid ${what}`);
}

/** Bison ids are integers; anything past 2^53 would round when sent as a number. */
function bisonId(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9][0-9]{0,15}$/.test(value.trim()) && Number.isSafeInteger(Number(value.trim()))) {
    return value.trim();
  }
  return null;
}

function count(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function optionalCount(value: unknown): number | null {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function text(value: unknown, max = 500): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function timestamp(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

/** Bison campaign status → Instantly campaign code. Unknown reads as attention. */
/**
 * This campaign's entry in a lead's `lead_campaign_data`, which the API
 * documents only as a list (one entry per campaign) but may return as a single
 * object on a campaign-scoped listing. Matched on the campaign id or not at
 * all: another campaign's entry would report its sends and replies as this
 * one's. A single object without a campaign id is trusted only on a listing
 * already scoped to this campaign.
 */
export function campaignLinkFor(row: Json, campaignId: string): Json | null {
  const data = row.lead_campaign_data;
  const entries = Array.isArray(data) ? data.filter(record) as Json[] : record(data) ? [data as Json] : [];
  const matched = entries.find((entry) => bisonId(entry.campaign_id) === campaignId);
  if (matched) return matched;
  if (!Array.isArray(data) && entries.length === 1 && entries[0].campaign_id === undefined) return entries[0];
  return null;
}

export function bisonCampaignStatus(value: unknown): number {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  switch (status) {
    case "draft":
      return 0;
    case "active":
    case "launching":
    case "queued":
      return 1;
    case "paused":
      return 2;
    case "completed":
      return 3;
    case "archived":
    case "pending deletion":
    case "deleted":
      return -99;
    default:
      // stopped, failed, and anything this build has not seen.
      return -1;
  }
}

/**
 * Bison lead → Instantly lead code. The contact's own status (bounced,
 * unsubscribed) outranks where it sits in the sequence.
 */
export function bisonLeadStatus(leadStatus: unknown, campaignStatus: unknown): number | null {
  const contact = typeof leadStatus === "string" ? leadStatus.trim().toLowerCase() : "";
  if (contact === "bounced") return -1;
  if (contact === "unsubscribed") return -2;
  const inCampaign = typeof campaignStatus === "string" ? campaignStatus.trim().toLowerCase() : "";
  switch (inCampaign) {
    case "":
      return null;
    case "never_contacted":
    case "not_contacted":
    case "pending":
    case "in_sequence":
    case "active":
    case "queued":
      return 1;
    case "paused":
      return 2;
    case "sequence_finished":
    case "finished":
    case "completed":
    case "replied":
    case "stopped":
    case "sequence_stopped":
    case "unsubscribed":
      return 3;
    case "bounced":
      return -1;
    default:
      return 1;
  }
}

/** Sender email → Instantly account code: 1 sendable, -1 disconnected, -3 other. */
export function bisonAccountStatus(value: unknown): number {
  const status = typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, "_") : "";
  if (status === "connected") return 1;
  if (status === "not_connected" || status === "disconnected") return -1;
  return -3;
}

/** The variable names one provisioned campaign reads. */
export function bisonVariableNames(campaignId: string) {
  const base = `goap_c${campaignId}`;
  return {
    pitchSubject: `${base}_pitch_subject`,
    pitchBody: `${base}_pitch_body`,
    followUpOneSubject: `${base}_follow_up_one_subject`,
    followUpOneBody: `${base}_follow_up_one_body`,
    followUpTwoSubject: `${base}_follow_up_two_subject`,
    followUpTwoBody: `${base}_follow_up_two_body`,
    clientName: `${base}_client_name`,
    podcastName: `${base}_podcast_name`,
    targetId: `${base}_target_id`,
  } as const;
}

/** Bison writes custom variables in sequence copy as {UPPERCASE_NAME}. */
function placeholder(name: string): string {
  return `{${name.toUpperCase()}}`;
}

export function bisonPitchPlaceholder(campaignId: string): string {
  return placeholder(bisonVariableNames(campaignId).pitchBody);
}

export function bisonCustomVariables(campaignId: string, variables: PitchVariables) {
  const names = bisonVariableNames(campaignId);
  return (Object.keys(names) as Array<keyof typeof names>).map((key) => ({
    name: names[key],
    value: String(variables[key] ?? ""),
  }));
}

/** Does the opening step read this campaign's pitch-body variable? */
export function bisonStepsRenderOurPitch(campaignId: string, steps: unknown): boolean {
  if (!Array.isArray(steps) || steps.length === 0) return false;
  const ordered = [...steps].filter(record).sort((left, right) =>
    count((left as Json).order) - count((right as Json).order)
  ) as Json[];
  const opening = ordered.find((step) => step.variant !== true) ?? ordered[0];
  const body = typeof opening?.email_body === "string" ? opening.email_body : "";
  return body.toUpperCase().includes(bisonPitchPlaceholder(campaignId));
}

export function bisonSequenceSteps(campaignId: string, spec: CampaignSpec) {
  const names = bisonVariableNames(campaignId);
  // wait_in_days is "how many days before the sequence moves to the next
  // step" (docs.emailbison.com, Creating Campaigns), so each step carries the
  // gap AFTER it: the opening step holds follow-up one's delay, follow-up one
  // holds follow-up two's, and the last step's value is never waited on.
  return [
    {
      order: 1,
      email_subject: placeholder(names.pitchSubject),
      email_body: placeholder(names.pitchBody),
      wait_in_days: spec.followUpOneDelayDays ?? 6,
      variant: false,
      thread_reply: false,
    },
    {
      order: 2,
      email_subject: placeholder(names.pitchSubject),
      email_body: placeholder(names.followUpOneBody),
      wait_in_days: spec.followUpTwoDelayDays ?? 7,
      variant: false,
      // Replies into the opening email's thread, which is what an empty
      // subject does on Instantly.
      thread_reply: true,
    },
    {
      order: 3,
      email_subject: placeholder(names.pitchSubject),
      email_body: placeholder(names.followUpTwoBody),
      wait_in_days: 1,
      variant: false,
      thread_reply: true,
    },
  ];
}

function schedulePayload(spec: CampaignSpec, timezone: string) {
  const days = new Set(spec.sendDays?.length ? spec.sendDays : [1, 2, 3, 4, 5]);
  return {
    ...Object.fromEntries(DAY_NAMES.map((name, index) => [name, days.has(index)])),
    start_time: spec.windowStart ?? "09:00",
    end_time: spec.windowEnd ?? "17:00",
    timezone,
    save_as_template: false,
  };
}

function scheduleFrom(value: unknown): ProviderSchedule | null {
  const schedule = record(dataOf(value));
  if (!schedule) return null;
  const time = (candidate: unknown) => {
    const raw = typeof candidate === "string" ? candidate.slice(0, 5) : "";
    return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(raw) ? raw : null;
  };
  return {
    name: text(schedule.type, 120),
    from: time(schedule.start_time),
    to: time(schedule.end_time),
    timezone: text(schedule.timezone, 100),
    days: DAY_NAMES.map((name) => schedule[name] === true),
  };
}

function analyticsFrom(campaign: Json): AnalyticsSummary {
  return {
    emails_sent_count: count(campaign.emails_sent),
    contacted_count: count(campaign.total_leads_contacted),
    open_count_unique: count(campaign.unique_opens),
    reply_count_unique: count(campaign.unique_replies),
    bounced_count: count(campaign.bounced),
    unsubscribed_count: count(campaign.unsubscribed),
    total_interested: count(campaign.interested),
    // Bison has no meeting-booked counter; the caller carries the stored one.
    total_meeting_booked: 0,
  };
}

/** Same-clock zones Bison's list is known to carry, for zones it may not. */
const TIMEZONE_EQUIVALENTS: Record<string, string> = {
  "America/Detroit": "America/New_York",
  "America/Indiana/Marengo": "America/New_York",
  "America/Toronto": "America/New_York",
  "America/Dawson": "America/Los_Angeles",
  "America/Vancouver": "America/Los_Angeles",
  "America/Boise": "America/Denver",
  "America/Creston": "America/Phoenix",
  "Europe/Isle_of_Man": "Europe/London",
  "Arctic/Longyearbyen": "Europe/Berlin",
  "Europe/Belgrade": "Europe/Belgrade",
  "Asia/Kolkata": "Asia/Kolkata",
  "Australia/Melbourne": "Australia/Melbourne",
};

function utcOffsetMinutes(zone: string, at: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longOffset",
    }).formatToParts(at);
    const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    if (name === "GMT") return 0;
    const match = name.match(/^GMT([+-])(\d{2}):(\d{2})$/);
    if (!match) return null;
    const minutes = Number(match[2]) * 60 + Number(match[3]);
    return match[1] === "-" ? -minutes : minutes;
  } catch {
    return null;
  }
}

/**
 * A zone Bison's schedule accepts, keeping the same clock.
 *
 * The app's picker offers Instantly's zone list, which lacks New York and Los
 * Angeles; Bison's list is the reverse. A known equivalent is preferred, then
 * any listed zone with the same offset in both January and July (so daylight
 * saving moves together), then the zone unchanged for Bison to accept or
 * refuse in its own words.
 */
export function resolveBisonTimezone(zone: string, available: string[]): string {
  if (available.length === 0 || available.includes(zone)) return zone;
  const equivalent = TIMEZONE_EQUIVALENTS[zone];
  if (equivalent && available.includes(equivalent)) return equivalent;
  const january = new Date(Date.UTC(2026, 0, 15, 12));
  const july = new Date(Date.UTC(2026, 6, 15, 12));
  const wanted = [utcOffsetMinutes(zone, january), utcOffsetMinutes(zone, july)];
  if (wanted[0] === null || wanted[1] === null) return zone;
  return available.find((candidate) =>
    utcOffsetMinutes(candidate, january) === wanted[0] &&
    utcOffsetMinutes(candidate, july) === wanted[1]
  ) ?? zone;
}

export class EmailBisonProvider implements OutreachProvider {
  readonly kind = "emailbison" as const;
  readonly label = LABEL;
  readonly capabilities = {
    mailboxPause: false,
    mailboxSendHistory: false,
    sendingStatus: false,
    inbox: false,
  };

  private readonly target: ProviderRequestTarget;
  private senderIdsByEmail: Map<string, string> | null = null;
  private timezones: string[] | null = null;
  private knownVariables: Set<string> | null = null;

  constructor(origin: string, apiKey: string) {
    this.target = { origin, prefix: "/api", apiKey, label: LABEL, codePrefix: CODE };
  }

  private request<T>(path: string, options?: Parameters<typeof providerRequest>[2]) {
    return providerRequest<T>(this.target, path, options);
  }

  /** Every page of a paginated list, bounded. */
  private async pages(
    path: string,
    query?: URLSearchParams,
    enough?: (items: Json[]) => boolean,
  ): Promise<{ items: Json[]; complete: boolean }> {
    const items: Json[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const params = new URLSearchParams(query);
      params.set("page", String(page));
      params.set("per_page", String(PAGE_SIZE));
      const response = record(await this.request<unknown>(path, { query: params }));
      const data = response?.data;
      if (!Array.isArray(data)) throw invalid("list");
      items.push(...data.filter(record) as Json[]);
      const meta = record(response?.meta);
      const lastPage = optionalCount(meta?.last_page);
      const next = record(response?.links)?.next;
      const done = lastPage !== null ? page >= lastPage : !next || data.length === 0;
      if (done) return { items, complete: true };
      // The caller has what it came for; the rest of the list is not needed.
      if (enough?.(items)) return { items, complete: false };
    }
    return { items, complete: false };
  }

  async verifyConnection(): Promise<{ workspace: ProviderWorkspace; accounts: AccountSummary[] }> {
    const [user, accounts] = await Promise.all([
      this.request<unknown>("/users"),
      this.listAccounts(),
      // Read probe: a key that can see its user but not campaigns is useless here.
      this.request<unknown>("/campaigns", { query: new URLSearchParams({ per_page: "1" }) }),
    ]);
    // Live instances (checked 2026-11-01) name it `workspace`; older API
    // references call it `team`. Only id and name are read: the same object
    // carries the workspace's webhooks_secret_key, which must go nowhere.
    const userData = record(dataOf(user));
    const team = record(userData?.workspace) ?? record(userData?.team);
    const id = bisonId(team?.id);
    const name = text(team?.name, 300);
    if (!id || !name) throw invalid("workspace");
    return { workspace: { id, name }, accounts };
  }

  private async senderEmails(): Promise<Json[]> {
    return (await this.pages("/sender-emails")).items;
  }

  async listAccounts(): Promise<AccountSummary[]> {
    const [senders, warmup] = await Promise.all([
      this.senderEmails(),
      this.warmupRows().catch(() => [] as Json[]),
    ]);
    const warmupByEmail = new Map(
      warmup.flatMap((row) => typeof row.email === "string" ? [[row.email.trim().toLowerCase(), row] as const] : []),
    );
    this.senderIdsByEmail = new Map();
    const accounts = new Map<string, AccountSummary>();
    for (const sender of senders) {
      const email = typeof sender.email === "string" ? sender.email.trim().toLowerCase() : "";
      const id = bisonId(sender.id);
      if (!email || email.length > 254 || !id) continue;
      this.senderIdsByEmail.set(email, id);
      const [first, ...rest] = (text(sender.name, 200) ?? "").split(/\s+/);
      const warm = warmupByEmail.get(email);
      const status = bisonAccountStatus(sender.status);
      accounts.set(email, {
        email,
        first_name: first || null,
        last_name: rest.join(" ") || null,
        status,
        status_message: status === 1 ? null : {
          code: text(sender.status, 100),
          command: null,
          response: null,
          e_message: `${LABEL} reports this mailbox as ${text(sender.status, 100) ?? "unavailable"}`,
          response_code: null,
        },
        warmup_status: sender.warmup_enabled === true ? 1 : 0,
        daily_limit: optionalCount(sender.daily_limit),
        warmup_limit: null,
        stat_warmup_score: optionalCount(warm?.warmup_score),
        has_signature: typeof sender.email_signature === "string" &&
          sender.email_signature.replace(/<[^>]*>/g, "").trim().length > 0,
        tags: Array.isArray(sender.tags)
          ? sender.tags.flatMap((value) => {
            const tag = record(value);
            const id = bisonId(tag?.id);
            const label = text(tag?.name, 300);
            return id && label ? [{ id, label, description: null }] : [];
          }).sort((left, right) => left.label.localeCompare(right.label))
          : [],
      });
    }
    return [...accounts.values()].sort((left, right) => left.email.localeCompare(right.email));
  }

  private async warmupRows(): Promise<Json[]> {
    const end = new Date();
    const start = new Date(end.getTime() - 9 * 86_400_000);
    const query = new URLSearchParams({
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
    });
    return (await this.pages("/warmup/sender-emails", query)).items;
  }

  accountSendHistory(): Promise<Map<string, AccountSendDay[]>> {
    // Bison reports totals per mailbox, not days. An empty map renders as
    // "no daily history" rather than as a row of zeroes that would read as
    // a mailbox that sent nothing.
    return Promise.resolve(new Map());
  }

  async warmupAnalytics(emails: string[]): Promise<Map<string, WarmupAccountAnalytics>> {
    const wanted = new Set(emails.map((email) => email.trim().toLowerCase()));
    const result = new Map<string, WarmupAccountAnalytics>();
    for (const row of await this.warmupRows()) {
      const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
      if (!wanted.has(email)) continue;
      const score = optionalCount(row.warmup_score);
      result.set(email, {
        sent: optionalCount(row.warmup_emails_sent),
        health_score: score !== null && score <= 100 ? score : null,
      });
    }
    return result;
  }

  setAccountPaused(): Promise<void> {
    return Promise.reject(unsupportedFeature(LABEL, "pausing a single mailbox"));
  }

  private async senderIds(emails: string[]): Promise<string[]> {
    if (!this.senderIdsByEmail) await this.listAccounts();
    const ids: string[] = [];
    for (const email of emails) {
      const id = this.senderIdsByEmail?.get(email.trim().toLowerCase());
      if (!id) {
        throw new OutreachProviderError(
          409,
          "INSTANTLY_SENDER_UNAVAILABLE",
          `${email} is not a mailbox in the connected ${LABEL} workspace`,
        );
      }
      ids.push(id);
    }
    return ids;
  }

  /** The campaign row alone, with no sequence or sender detail. */
  private summaryCampaign(row: Json): ProviderCampaign {
    const id = bisonId(row.id);
    const name = text(row.name, 500);
    if (!id || !name) throw invalid("campaign");
    const maxLeads = optionalCount(row.max_new_leads_per_day);
    const maxEmails = optionalCount(row.max_emails_per_day);
    return {
      id,
      status: bisonCampaignStatus(row.status),
      // Not known from a summary. The detail read below answers it from the
      // live sequence; a summary must never claim it.
      rendersOurPitch: false,
      name,
      senderAccounts: [],
      timezone: EMAILBISON_DEFAULT_TIMEZONE,
      dailyLimit: Math.min(
        1_000,
        maxLeads && maxLeads > 0 ? maxLeads : maxEmails ? Math.max(1, Math.ceil(maxEmails / EMAILS_PER_HOST)) : 30,
      ),
      emailGap: null,
      notSendingStatus: null,
      schedule: null,
      timestampCreated: timestamp(row.created_at),
      timestampUpdated: timestamp(row.updated_at),
    };
  }

  private async sequenceSteps(campaignId: string): Promise<{ sequenceId: string | null; steps: Json[] }> {
    const value = record(dataOf(
      await this.request<unknown>(`/campaigns/v1.1/${encodeURIComponent(campaignId)}/sequence-steps`),
    ));
    const steps = Array.isArray(value?.sequence_steps) ? value.sequence_steps.filter(record) as Json[] : [];
    return { sequenceId: bisonId(value?.sequence_id), steps };
  }

  async listCampaigns(): Promise<{ campaigns: ProviderCampaign[]; complete: boolean }> {
    const { items, complete } = await this.pages("/campaigns");
    const campaigns = items.map((row) => this.summaryCampaign(row));
    return {
      campaigns: campaigns.sort((left, right) =>
        (right.timestampUpdated || right.timestampCreated || "").localeCompare(
          left.timestampUpdated || left.timestampCreated || "",
        ) || left.name.localeCompare(right.name)
      ),
      complete,
    };
  }

  async searchCampaigns(term: string, limit: number): Promise<ProviderCampaign[]> {
    // Bison's `search` matches the whole name (SQL LIKE with no wildcards;
    // `%` is ignored, `_` matches any one character), measured live. The
    // marker lookup that adopts a half-built campaign on retry searches for a
    // name prefix, which `search` never found, so every retry built another
    // draft. The listing is read and matched here instead.
    const wanted = term.trim().toLowerCase();
    if (!wanted) return [];
    const { campaigns } = await this.listCampaigns();
    const matches = campaigns.filter((campaign) => campaign.name.toLowerCase().includes(wanted)).slice(0, limit);
    // Listing rows are summaries; callers that need rendersOurPitch read the
    // detail, so resolve it here for the few that match.
    return await Promise.all(matches.map((campaign) => this.getCampaign(campaign.id)));
  }

  async getCampaign(id: string): Promise<ProviderCampaign> {
    const [detail, schedule, sequence, senders] = await Promise.all([
      this.request<unknown>(`/campaigns/${encodeURIComponent(id)}`),
      this.request<unknown>(`/campaigns/${encodeURIComponent(id)}/schedule`).catch((error) => {
        // A campaign with no schedule yet answers 404 here, which is not the
        // campaign being gone.
        if (error instanceof OutreachProviderError && error.status === 404) return null;
        throw error;
      }),
      this.sequenceSteps(id).catch((error) => {
        if (error instanceof OutreachProviderError && error.status === 404) {
          return { sequenceId: null, steps: [] as Json[] };
        }
        throw error;
      }),
      // Only a 404 means "no senders". Reading any other failure as an empty
      // list would make a later save compute nothing to remove, report
      // success, and leave an unassigned mailbox sending.
      this.pages(`/campaigns/${encodeURIComponent(id)}/sender-emails`).catch((error) => {
        if (error instanceof OutreachProviderError && error.status === 404) {
          return { items: [] as Json[], complete: true };
        }
        throw error;
      }),
    ]);
    const row = record(dataOf(detail));
    if (!row) throw invalid("campaign");
    const campaign = this.summaryCampaign(row);
    const providerSchedule = schedule ? scheduleFrom(schedule) : null;
    return {
      ...campaign,
      rendersOurPitch: bisonStepsRenderOurPitch(campaign.id, sequence.steps),
      senderAccounts: [...new Set(senders.items.flatMap((sender) =>
        typeof sender.email === "string" ? [sender.email.trim().toLowerCase()] : []
      ))],
      timezone: providerSchedule?.timezone ?? EMAILBISON_DEFAULT_TIMEZONE,
      schedule: providerSchedule,
    };
  }

  private async availableTimezones(): Promise<string[]> {
    if (this.timezones) return this.timezones;
    try {
      const value = dataOf(await this.request<unknown>("/campaigns/schedule/available-timezones"));
      this.timezones = Array.isArray(value)
        ? value.flatMap((row) => typeof record(row)?.id === "string" ? [String(record(row)!.id)] : [])
        : [];
    } catch {
      this.timezones = [];
    }
    return this.timezones;
  }

  private async ensureVariables(campaignId: string): Promise<void> {
    const wanted = Object.values(bisonVariableNames(campaignId));
    const names = (rows: Json[]) =>
      new Set(rows.flatMap((row) => typeof row.name === "string" ? [row.name.trim().toLowerCase()] : []));
    if (!this.knownVariables || !wanted.every((name) => this.knownVariables!.has(name))) {
      // Every provisioned campaign adds nine variables, so the workspace list
      // grows with use. Stop paging once this campaign's names are all seen;
      // any still missing are created below, where "already exists" is fine.
      const { items } = await this.pages(
        "/custom-variables",
        undefined,
        (rows) => {
          const seen = names(rows);
          return wanted.every((name) => seen.has(name));
        },
      );
      this.knownVariables = new Set([...(this.knownVariables ?? []), ...names(items)]);
    }
    for (const name of wanted) {
      if (this.knownVariables.has(name)) continue;
      try {
        await this.request<unknown>("/custom-variables", { method: "POST", body: { name } });
      } catch (error) {
        // Names are unique per workspace; a concurrent create is success.
        if (!(error instanceof OutreachProviderError && error.status === 422)) throw error;
      }
      this.knownVariables.add(name);
    }
  }

  /**
   * `ours` is false for a campaign the agency built in Email Bison and mapped
   * here: it keeps its own name, schedule and delivery settings, and only the
   * limits this app manages are written.
   */
  private async writeSettings(id: string, spec: CampaignSpec, ours = true): Promise<void> {
    // Every email, follow-ups included, against new hosts per day; see the
    // Instantly adapter for why these are two different numbers.
    const limits = {
      max_emails_per_day: spec.dailyLimit * EMAILS_PER_HOST,
      max_new_leads_per_day: spec.dailyLimit,
    };
    await this.request<unknown>(`/campaigns/${encodeURIComponent(id)}/update`, {
      method: "PATCH",
      body: ours
        ? {
          name: spec.name,
          ...limits,
          plain_text: true,
          open_tracking: true,
          can_unsubscribe: true,
          sequence_prioritization: "new_leads",
        }
        : limits,
    });
  }

  private async writeSchedule(id: string, spec: CampaignSpec, exists: boolean): Promise<void> {
    const available = await this.availableTimezones();
    const timezone = resolveBisonTimezone(spec.timezone, available);
    // Bison answers a zone it lacks with a bare 422; say which and why.
    if (available.length && !available.includes(timezone)) {
      throw new OutreachProviderError(
        422,
        `${CODE}_TIMEZONE_UNSUPPORTED`,
        `${LABEL} has no time zone on the same clock as ${spec.timezone}; choose another for this campaign`,
      );
    }
    await this.request<unknown>(`/campaigns/${encodeURIComponent(id)}/schedule`, {
      method: exists ? "PUT" : "POST",
      body: schedulePayload(spec, timezone),
    });
  }

  private async writeSenders(id: string, wanted: string[], current: string[]): Promise<void> {
    // Removing needs ids too. The map is filled by listAccounts, which a
    // remove-only save never reached, so the DELETE was silently skipped and
    // Bison kept sending from a mailbox the app showed as unassigned.
    if (!this.senderIdsByEmail) await this.listAccounts();
    const wantedSet = new Set(wanted.map((email) => email.toLowerCase()));
    const currentSet = new Set(current.map((email) => email.toLowerCase()));
    const add = [...wantedSet].filter((email) => !currentSet.has(email));
    const remove = [...currentSet].filter((email) => !wantedSet.has(email));
    if (add.length) {
      await this.request<unknown>(`/campaigns/${encodeURIComponent(id)}/attach-sender-emails`, {
        method: "POST",
        body: { sender_email_ids: (await this.senderIds(add)).map(Number) },
      });
    }
    if (remove.length) {
      const ids = remove.flatMap((email) => {
        const senderId = this.senderIdsByEmail?.get(email);
        return senderId ? [Number(senderId)] : [];
      });
      if (ids.length !== remove.length) {
        throw new OutreachProviderError(
          409,
          "INSTANTLY_SENDER_UNAVAILABLE",
          `A mailbox to remove is no longer in the connected ${LABEL} workspace; remove it in ${LABEL} directly`,
        );
      }
      if (ids.length) {
        await this.request<unknown>(`/campaigns/${encodeURIComponent(id)}/remove-sender-emails`, {
          method: "DELETE",
          body: { sender_email_ids: ids },
        });
      }
    }
  }

  private async writeSequence(id: string, spec: CampaignSpec): Promise<void> {
    await this.ensureVariables(id);
    // Only a 404 means there is no sequence yet. A rate limit or outage read as
    // "none" would POST a second sequence onto the campaign.
    const read = () =>
      this.sequenceSteps(id).catch((error) => {
        if (error instanceof OutreachProviderError && error.status === 404) {
          return { sequenceId: null, steps: [] as Json[] };
        }
        throw error;
      });
    // Variants share their parent's order and must never be matched to a
    // primary step's slot.
    const primariesOf = (rows: Json[]) =>
      rows
        .filter((step) => step.variant !== true && bisonId(step.id))
        .sort((left, right) => count(left.order) - count(right.order));
    let existing = await read();
    const steps = bisonSequenceSteps(id, spec);
    let primaries = primariesOf(existing.steps);
    if (existing.sequenceId && primaries.length > 0 && primaries.length < steps.length) {
      // Short of steps (one was deleted in Bison). Measured live: Bison refuses
      // to delete a sequence's last step (400), and a POST onto an existing
      // sequence appends rather than replaces, so "clear and rewrite" either
      // fails or leaves the old follow-up sending as the opening email. Append
      // the missing count, then the in-place update below rewrites every step.
      await this.request<unknown>(`/campaigns/v1.1/${encodeURIComponent(id)}/sequence-steps`, {
        method: "POST",
        body: { title: "Get On A Pod pitch", sequence_steps: steps.slice(primaries.length) },
      });
      existing = await read();
      primaries = primariesOf(existing.steps);
    }
    // The update call needs the id of every step it names and cannot add one.
    if (existing.sequenceId && primaries.length >= steps.length) {
      await this.request<unknown>(
        `/campaigns/v1.1/sequence-steps/${encodeURIComponent(existing.sequenceId)}`,
        {
          method: "PUT",
          body: {
            title: "Get On A Pod pitch",
            sequence_steps: steps.map((step, index) => ({ ...step, id: Number(primaries[index].id) })),
          },
        },
      );
      // Anything else on the sequence (extra steps, A/B variants) would keep
      // sending its old copy alongside ours.
      const kept = new Set(primaries.slice(0, steps.length).map((step) => bisonId(step.id)));
      await this.deleteSteps(existing.steps.filter((step) => !kept.has(bisonId(step.id))));
      return;
    }
    // No sequence, or one with no primary step: write it fresh. Anything left
    // (only variants) is cleared first; the append above covers every case
    // with a primary step to keep.
    await this.deleteSteps(existing.steps);
    await this.request<unknown>(`/campaigns/v1.1/${encodeURIComponent(id)}/sequence-steps`, {
      method: "POST",
      body: { title: "Get On A Pod pitch", sequence_steps: steps },
    });
  }

  private async deleteSteps(steps: Json[]): Promise<void> {
    for (const step of steps) {
      const stepId = bisonId(step.id);
      if (!stepId) continue;
      await this.request<unknown>(`/campaigns/sequence-steps/${encodeURIComponent(stepId)}`, { method: "DELETE" })
        .catch((error) => {
          // Already gone is the state wanted.
          if (!(error instanceof OutreachProviderError && error.status === 404)) throw error;
        });
    }
  }

  async createCampaign(spec: CampaignSpec): Promise<ProviderCampaign> {
    const created = record(dataOf(await this.request<unknown>("/campaigns", {
      method: "POST",
      body: { name: spec.name, type: "outbound" },
    })));
    const id = bisonId(created?.id);
    if (!id) throw invalid("campaign");
    // Settings, schedule, senders, then the sequence, which needs the id to
    // name its variables. A failure part-way leaves a named draft that the
    // caller's marker search finds and finishes on retry.
    await this.writeSettings(id, spec);
    await this.writeSchedule(id, spec, false);
    await this.writeSenders(id, spec.senderAccounts, []);
    await this.writeSequence(id, spec);
    return await this.getCampaign(id);
  }

  async finishProvisioning(
    campaign: ProviderCampaign,
    spec: CampaignSpec,
    options: { adopted: boolean },
  ): Promise<ProviderCampaign> {
    let current = campaign;
    // A new Bison campaign is a draft and does not send until resumed; one that
    // somehow is live is paused, as on Instantly.
    if (current.status === 1) current = await this.pauseCampaign(current.id);
    await this.ensureVariables(current.id);
    // An adopted campaign may be one a failed setup left part-built: settings,
    // schedule, senders and sequence are all rewritten from the spec, with the
    // client's own follow-up delays, before it can take a lead.
    if (options.adopted || !current.rendersOurPitch) {
      current = await this.updateCampaign(current.id, spec, { includeSequence: true });
    }
    return current;
  }

  async updateCampaign(
    id: string,
    spec: CampaignSpec,
    options: { includeSequence: boolean },
  ): Promise<ProviderCampaign> {
    const before = await this.getCampaign(id);
    // A hand-built campaign is never renamed or rescheduled by a settings save.
    const ours = options.includeSequence || before.rendersOurPitch;
    await this.writeSettings(id, spec, ours);
    if (ours) await this.writeSchedule(id, spec, before.schedule !== null);
    await this.writeSenders(id, spec.senderAccounts, before.senderAccounts);
    if (options.includeSequence) await this.writeSequence(id, spec);
    return await this.getCampaign(id);
  }

  async pauseCampaign(id: string): Promise<ProviderCampaign> {
    await this.request<unknown>(`/campaigns/${encodeURIComponent(id)}/pause`, { method: "PATCH" });
    return await this.getCampaign(id);
  }

  async activateCampaign(id: string): Promise<ProviderCampaign> {
    await this.request<unknown>(`/campaigns/${encodeURIComponent(id)}/resume`, { method: "PATCH" });
    return await this.getCampaign(id);
  }

  async campaignAnalytics(id: string): Promise<AnalyticsSummary> {
    const row = record(dataOf(await this.request<unknown>(`/campaigns/${encodeURIComponent(id)}`)));
    if (!row) throw invalid("campaign");
    return analyticsFrom(row);
  }

  async bulkCampaignAnalytics(ids: string[]): Promise<Map<string, CampaignAnalytics>> {
    const wanted = new Set(ids);
    const result = new Map<string, CampaignAnalytics>();
    if (wanted.size === 0) return result;
    if (wanted.size <= DIRECT_ANALYTICS_LIMIT) {
      // A few campaigns: read each directly, so one past the list's page cap
      // is never reported missing. A deleted one is simply absent.
      const rows = await Promise.all([...wanted].map((id) =>
        this.request<unknown>(`/campaigns/${encodeURIComponent(id)}`)
          .then((value) => record(dataOf(value)))
          .catch((error) => {
            if (error instanceof OutreachProviderError && error.status === 404) return null;
            throw error;
          })
      ));
      for (const row of rows) {
        const id = bisonId(row?.id);
        if (!row || !id || !wanted.has(id)) continue;
        result.set(id, { campaignId: id, status: bisonCampaignStatus(row.status), analytics: analyticsFrom(row) });
      }
      return result;
    }
    // The list carries every counter, so one paged listing serves every id.
    for (const row of (await this.pages(
      "/campaigns",
      undefined,
      (rows) => rows.filter((row) => wanted.has(bisonId(row.id) ?? "")).length >= wanted.size,
    )).items) {
      const id = bisonId(row.id);
      if (!id || !wanted.has(id)) continue;
      result.set(id, { campaignId: id, status: bisonCampaignStatus(row.status), analytics: analyticsFrom(row) });
    }
    return result;
  }

  campaignSendingStatus(): Promise<SendingStatus> {
    return Promise.reject(unsupportedFeature(LABEL, "a sending diagnosis"));
  }

  private lead(row: Json, campaignLink?: Json | null): ProviderLead | null {
    const id = bisonId(row.id);
    const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
    if (!id || !email) return null;
    // Per-campaign figures only. overall_stats spans every campaign the contact
    // is in, so a host who replied to another client would read as replied
    // here the moment this pitch launched.
    const link = campaignLink === undefined ? null : campaignLink;
    return {
      id,
      email,
      status: bisonLeadStatus(row.status, link?.status),
      email_open_count: count(link?.opens),
      email_reply_count: count(link?.replies),
      timestamp_updated: timestamp(row.updated_at),
      email_click_count: 0,
      last_step_id: null,
      email_opened_step: null,
      email_replied_step: null,
      lt_interest_status: link?.interested === true ? 1 : null,
      verification_status: null,
      timestamp_last_contact: null,
      timestamp_last_open: null,
      timestamp_last_reply: null,
      timestamp_last_click: null,
    };
  }

  async listLeads(campaignId: string, email?: string): Promise<ProviderLead[]> {
    const query = email ? new URLSearchParams({ search: email }) : undefined;
    const { items } = await this.pages(`/campaigns/${encodeURIComponent(campaignId)}/leads`, query);
    return items.flatMap((row) => {
      const lead = this.lead(row, campaignLinkFor(row, campaignId));
      return lead ? [lead] : [];
    });
  }

  async getLead(leadId: string, campaignId: string | null): Promise<ProviderLead | null> {
    const row = record(dataOf(await this.request<unknown>(`/leads/${encodeURIComponent(leadId)}`)));
    if (!row) return null;
    return this.lead(row, campaignId ? campaignLinkFor(row, campaignId) : null);
  }

  async updateLeadVariables(
    lead: ProviderLead,
    campaignId: string,
    variables: PitchVariables,
  ): Promise<ProviderLead | null> {
    await this.ensureVariables(campaignId);
    // PATCH keeps every variable not named, so another campaign's copy on the
    // same contact is left exactly as it was.
    const row = record(dataOf(await this.request<unknown>(`/leads/${encodeURIComponent(lead.id)}`, {
      method: "PATCH",
      body: { custom_variables: bisonCustomVariables(campaignId, variables) },
    })));
    // The PATCH answer carries no lead_campaign_data, so read as a lead it has
    // a null status, and the caller writes that status back: a null there is
    // what marks a lead as gone. Only variables changed; this campaign's
    // status and counts are the ones the caller already had.
    const updated = row ? this.lead(row, campaignLinkFor(row, campaignId)) : null;
    if (!updated || !campaignLinkFor(row!, campaignId)) {
      return { ...lead, timestamp_updated: updated?.timestamp_updated ?? lead.timestamp_updated };
    }
    return updated;
  }

  async addLead(
    campaignId: string,
    lead: NewLead,
    options: { skipIfInCampaign: boolean },
  ): Promise<ProviderLead | null> {
    await this.ensureVariables(campaignId);
    // Bison looks contacts up by address case-sensitively but refuses a second
    // contact that differs only in case (422), so a mixed-case address missed
    // the lookup and then failed the create.
    lead = { ...lead, email: lead.email.trim().toLowerCase() };
    if (options.skipIfInCampaign) {
      const existing = (await this.listLeads(campaignId, lead.email))
        .find((candidate) => candidate.email === lead.email.toLowerCase());
      if (existing) return existing;
    }
    // Contacts are workspace-wide and unique by address. An existing contact
    // gets only this campaign's variables patched on: its name is used by
    // every other campaign it is in, and must not be replaced by a podcast
    // name. A new one is created with the best name known.
    const existingContact = await this.request<unknown>(`/leads/${encodeURIComponent(lead.email)}`)
      .then((value) => record(dataOf(value)))
      .catch((error) => {
        if (error instanceof OutreachProviderError && error.status === 404) return null;
        throw error;
      });
    const variables = bisonCustomVariables(campaignId, lead.variables);
    const row = existingContact && bisonId(existingContact.id)
      ? record(dataOf(await this.request<unknown>(`/leads/${encodeURIComponent(String(existingContact.id))}`, {
        method: "PATCH",
        body: { custom_variables: variables },
      }))) ?? existingContact
      : record(dataOf(await this.request<unknown>("/leads", {
        method: "POST",
        body: {
          email: lead.email,
          first_name: lead.firstName || lead.company || "there",
          ...(lead.lastName ? { last_name: lead.lastName } : {}),
          ...(lead.company ? { company: lead.company } : {}),
          custom_variables: variables,
        },
      })));
    const contact = row ? this.lead(row, null) : null;
    if (!contact) return null;
    await this.request<unknown>(`/campaigns/${encodeURIComponent(campaignId)}/leads/attach-leads`, {
      method: "POST",
      body: { lead_ids: [Number(contact.id)], allow_parallel_sending: true },
    });
    return { ...contact, status: 1 };
  }

  async removeLead(campaignId: string | null, leadId: string): Promise<void> {
    if (!campaignId) {
      throw new OutreachProviderError(
        409,
        `${CODE}_CAMPAIGN_REQUIRED`,
        `${LABEL} removes a contact from a campaign, and this lead has no campaign recorded`,
      );
    }
    const id = bisonId(leadId);
    // A stale or foreign id would serialize as null; never send one.
    if (!id || !Number.isSafeInteger(Number(id))) {
      throw new OutreachProviderError(400, `${CODE}_LEAD_INVALID`, `${LABEL} lead id is invalid`);
    }
    // Removes the contact from this campaign only; the contact and its history
    // stay in the workspace.
    try {
      await this.request<unknown>(`/campaigns/${encodeURIComponent(campaignId)}/leads`, {
        method: "DELETE",
        body: { lead_ids: [Number(id)] },
      });
    } catch (error) {
      // Bison answers 422, not 404, for a contact that is not in the campaign
      // (removed in Bison by hand, or deleted). The interface's "already gone"
      // is a 404, which the caller treats as done; anything else stays an error.
      if (!(error instanceof OutreachProviderError && error.status === 422)) throw error;
      const row = await this.request<unknown>(`/leads/${encodeURIComponent(id)}`)
        .then((value) => record(dataOf(value)))
        .catch((lookup) => {
          if (lookup instanceof OutreachProviderError && lookup.status === 404) return null;
          throw error;
        });
      if (row && campaignLinkFor(row, campaignId)) throw error;
      throw new OutreachProviderError(
        404,
        `${CODE}_RESOURCE_NOT_FOUND`,
        `This contact is no longer in the ${LABEL} campaign`,
      );
    }
  }

  async blockAddress(email: string): Promise<void> {
    try {
      await this.request<unknown>("/blacklisted-emails", { method: "POST", body: { email } });
    } catch (error) {
      if (!(error instanceof OutreachProviderError && error.status === 422)) throw error;
      // 422 is both "already listed" and "invalid". Only the first is the
      // state that was asked for, so it is confirmed rather than assumed.
      if (!await this.blockListEntryId(email)) throw error;
    }
  }

  private async blockListEntryId(email: string): Promise<string | null> {
    const wanted = email.trim().toLowerCase();
    // The single-entry route takes an address as well as an id, so this is an
    // exact lookup; a search returns 15 partial matches a page and could miss
    // the address behind longer ones containing it.
    const row = await this.request<unknown>(`/blacklisted-emails/${encodeURIComponent(wanted)}`)
      .then((value) => record(dataOf(value)))
      .catch((error) => {
        if (error instanceof OutreachProviderError && error.status === 404) return null;
        throw error;
      });
    if (!row || typeof row.email !== "string" || row.email.trim().toLowerCase() !== wanted) return null;
    return bisonId(row.id);
  }

  async unblockAddress(email: string): Promise<boolean> {
    const id = await this.blockListEntryId(email);
    if (!id) return false;
    await this.request<unknown>(`/blacklisted-emails/${encodeURIComponent(id)}`, { method: "DELETE" });
    return true;
  }
}
