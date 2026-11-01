/**
 * ReachInbox behind the outreach provider interface.
 *
 * Built against https://docs.reachinbox.ai (read and re-checked 2026-11-01).
 * Base URL https://api.reachinbox.ai/api/v1, Bearer auth, 5 requests per
 * second (docs "Others → Rate limit").
 *
 * ReachInbox is shaped much like Instantly — the same schedule object with days
 * keyed "0".."6" from Sunday, {{variable}} placeholders, and lead attributes
 * held per campaign — so the pitch variables keep Instantly's names. It has
 * three gaps this adapter has to work around, each stated where it bites:
 *
 * 1. The connection is identified by the workspaceId that GET /account
 *    ("User Info") returns, so a rotated key for the same workspace is still
 *    the same connection. Only when that answer has no usable workspaceId does
 *    it fall back to a fingerprint of the key.
 * 2. No campaign-by-id or sequence read. A campaign is found in the listing,
 *    and whether it sends our copy is decided by provenance: the GOAP- name
 *    marker this app writes on every campaign it builds.
 * 3. No single-mailbox pause and no per-day mailbox history.
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
  type ProviderWorkspace,
  type SendingStatus,
  unsupportedFeature,
  type WarmupAccountAnalytics,
} from "./outreachProvider.ts";
import { providerRequest, type ProviderRequestTarget } from "./providerHttp.ts";
import { instantlyCustomVariables } from "./instantlyProvider.ts";

const LABEL = "ReachInbox";
const CODE = "REACHINBOX";
const ORIGIN = "https://api.reachinbox.ai";
const EMAILS_PER_HOST = 3;
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
/** Documented limit is 5/s; one request every 220 ms stays under it. */
const MIN_REQUEST_GAP_MS = 220;
/**
 * The gap above only spaces requests from one function run; two runs at once
 * share the same 5/s budget. A 429 is retried once, after the window resets.
 */
const RATE_LIMIT_RETRY_MS = 1_100;
/**
 * GET/DELETE /blocklist/:table. The docs show only the keyword table
 * ("/blocklist/keyword", rows carrying `keyword`), so the email table is taken
 * to be its singular sibling "email", with "emails" tried if that is refused.
 */
const BLOCKLIST_EMAIL_TABLES = ["email", "emails"] as const;
export const REACHINBOX_DEFAULT_TIMEZONE = "America/Detroit";

/** Every campaign this app builds carries this in its name. */
const PROVISION_MARKER = "GOAP-";

type Json = Record<string, unknown>;

function record(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
}

function dataOf(value: unknown): unknown {
  const wrapper = record(value);
  return wrapper && "data" in wrapper ? wrapper.data : value;
}

function invalid(what: string): OutreachProviderError {
  return new OutreachProviderError(502, `${CODE}_RESPONSE_INVALID`, `${LABEL} returned an invalid ${what}`);
}

/** ReachInbox ids are integers; anything past 2^53 would round when sent as a number. */
function riId(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9][0-9]{0,15}$/.test(value.trim()) && Number.isSafeInteger(Number(value.trim()))) {
    return value.trim();
  }
  return null;
}

/** A ReachInbox id as the number its JSON bodies carry; never NaN or null. */
function numericId(value: string, what: "campaign" | "lead" = "campaign"): number {
  const id = riId(value);
  if (!id) {
    throw new OutreachProviderError(
      400,
      what === "lead" ? `${CODE}_LEAD_INVALID` : `${CODE}_REQUEST_REJECTED`,
      `${LABEL} ${what} id is invalid`,
    );
  }
  return Number(id);
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

/** ReachInbox campaign → Instantly campaign code. */
export function reachInboxCampaignStatus(row: Json): number {
  if (row.isArchived === true || row.deletedAt) return -99;
  if (row.completed === true) return 3;
  const status = typeof row.status === "string" ? row.status.trim().toLowerCase() : "";
  if (status === "completed") return 3;
  // Instantly's -2 is "paused by bounce protection". ReachInbox reports that
  // as a flag beside an ordinary paused/started state, so it is read first.
  if (row.pausedByBounceProtection === true) return -2;
  if (status === "paused") return 2;
  if (status === "draft") return 0;
  if (row.isActive === true || status === "active" || status === "currently_sending_emails" || status === "offschedule") {
    return 1;
  }
  if (row.hasStarted === true) return 2;
  // Includes "not_sending_emails", the state a new campaign is created in.
  return 0;
}

/** ReachInbox lead → Instantly lead code. */
export function reachInboxLeadStatus(row: Json): number | null {
  const status = typeof row.status === "string" ? row.status.trim().toUpperCase() : "";
  // Live rows carry isBlocked as 0/1 (checked 2026-11-01); a boolean is still read.
  if (row.isBlocked === true || row.isBlocked === 1) return -3;
  if (status.includes("BOUNCE")) return -1;
  if (status.includes("UNSUBSCRIB")) return -2;
  if (
    row.completed === true || status === "COMPLETED" || count(row.sequenceStopped) > 0 || row.manuallyStopped === true
  ) {
    return 3;
  }
  // Live (2026-11-01): `isPaused` mirrors the CAMPAIGN — every lead of a
  // draft or paused campaign carries isPaused: true — so it is not read here.
  // Reading it locked every pitch staged into a not-yet-launched campaign.
  // The lead's own pause is `paused`.
  if (row.paused === true || status === "PAUSED") return 2;
  if (!status && row.completed === undefined) return null;
  return 1;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The workspace id GET /account returns (a UUID-like string), kept only when
 * it fits the stored identity column (1–100 chars) and carries no surprises.
 */
export function reachInboxWorkspaceId(value: unknown): string | null {
  const id = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(id) ? id : null;
}

/** The fallback identity when ReachInbox names no workspace: a fingerprint of the key. */
export async function reachInboxKeyFingerprint(apiKey: string): Promise<string> {
  return `key-${(await sha256Hex(apiKey)).slice(0, 32)}`;
}

/** A campaign's own IANA zone when the listing row carries one. */
function campaignTimezone(row: Json): string | null {
  const schedule = record(row.schedule) ?? record(row.campaignSchedule) ??
    (Array.isArray(row.schedules) ? record(row.schedules[0]) : null);
  for (const value of [row.timezone, row.timeZone, schedule?.timezone, schedule?.timeZone]) {
    const zone = text(value, 100);
    if (!zone) continue;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone });
      return zone;
    } catch {
      // Not an IANA name; keep looking.
    }
  }
  return null;
}

/**
 * set-schedule refuses a body without both dates ("startDate and endDate are
 * required.", live 2026-11-01; null is refused too). Instantly has no end
 * date, so the window opens now and runs five years: in effect, open-ended.
 */
const SCHEDULE_SPAN_MS = 5 * 365 * 24 * 60 * 60 * 1000;

function scheduleBody(campaignId: number, spec: CampaignSpec, now = Date.now()) {
  const days = new Set(spec.sendDays?.length ? spec.sendDays : [1, 2, 3, 4, 5]);
  return {
    campaignId,
    startDate: new Date(now).toISOString(),
    endDate: new Date(now + SCHEDULE_SPAN_MS).toISOString(),
    schedules: [{
      name: "Sending window",
      timing: { from: spec.windowStart ?? "09:00", to: spec.windowEnd ?? "17:00" },
      days: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((day) => [String(day), days.has(day)])),
      timezone: spec.timezone,
    }],
  };
}

function sequenceBody(campaignId: number, spec: CampaignSpec) {
  const step = (body: string, subject: string, delay: number) => ({
    variants: [{ subject, body }],
    type: "initial",
    delay,
    ccEnabled: false,
    ccVariables: [],
    bccEnabled: false,
    bccVariables: [],
  });
  return {
    campaignId,
    sequences: [{
      steps: [
        step("{{goapPitchBody}}", "{{goapPitchSubject}}", 0),
        // Empty subjects thread follow-ups under the opening email, as on
        // Instantly; ReachInbox's delay is the wait before this step.
        { ...step("{{goapFollowUpOneBody}}", "", spec.followUpOneDelayDays ?? 6), type: "follow-up" },
        { ...step("{{goapFollowUpTwoBody}}", "", spec.followUpTwoDelayDays ?? 7), type: "follow-up" },
      ],
    }],
  };
}

export class ReachInboxProvider implements OutreachProvider {
  readonly kind = "reachinbox" as const;
  readonly label = LABEL;
  readonly capabilities = {
    mailboxPause: false,
    mailboxSendHistory: false,
    sendingStatus: false,
    inbox: false,
  };

  private readonly target: ProviderRequestTarget;
  private lastRequestAt = 0;
  private campaignCache: Map<string, Json> | null = null;

  constructor(apiKey: string) {
    this.target = { origin: ORIGIN, prefix: "/api/v1", apiKey, label: LABEL, codePrefix: CODE };
  }

  private async request<T>(path: string, options?: Parameters<typeof providerRequest>[2]): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const wait = this.lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastRequestAt = Date.now();
      try {
        return await providerRequest<T>(this.target, path, options);
      } catch (error) {
        if (attempt > 0 || !(error instanceof OutreachProviderError) || error.status !== 429) throw error;
        this.lastRequestAt = Date.now() + RATE_LIMIT_RETRY_MS - MIN_REQUEST_GAP_MS;
      }
    }
  }

  async verifyConnection(): Promise<{ workspace: ProviderWorkspace; accounts: AccountSummary[] }> {
    let user: Json | null = null;
    try {
      user = record(dataOf(await this.request<unknown>("/account")));
    } catch (error) {
      // Only an absent endpoint falls back; a rejected key must still fail.
      if (!(error instanceof OutreachProviderError && error.status === 404)) throw error;
    }
    const rows = await this.accountRows();
    const accounts = this.accountSummaries(rows);
    await this.request<unknown>("/campaigns/all", { query: new URLSearchParams({ limit: "1", offset: "0" }) });
    const workspaceId = reachInboxWorkspaceId(user?.workspaceId);
    // A mailbox in that workspace names it; the user record does not. A
    // user-level key (live 2026-11-01: workspaceId null, mailboxes from several
    // workspaces) is named for no single one of them.
    const names = new Map<string, string>();
    for (const workspace of rows.map((row) => record(row.workspace))) {
      if (!workspace || (workspaceId && String(workspace.id) !== workspaceId)) continue;
      const name = text(workspace.name, 300);
      if (name) names.set(String(workspace.id), name);
    }
    // The bare name, as Email Bison stores it: the UI prefixes the platform.
    const workspaceName = names.size === 1
      ? [...names.values()][0]
      : names.size > 1
      ? `${names.size} workspaces`
      : "Workspace";
    return {
      workspace: {
        id: workspaceId ?? await reachInboxKeyFingerprint(this.target.apiKey),
        name: workspaceName,
      },
      accounts,
    };
  }

  private async accountRows(): Promise<Json[]> {
    const rows: Json[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const data = record(dataOf(await this.request<unknown>("/account/all", {
        query: new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(rows.length),
          status: "all",
        }),
      })));
      const batch = Array.isArray(data?.emailsConnected) ? data.emailsConnected.filter(record) as Json[] : null;
      if (!batch) throw invalid("account list");
      rows.push(...batch);
      const total = optionalCount(data?.totalCount);
      // totalCount is documented; without it, only an empty page ends the
      // walk, in case the server caps a page below PAGE_SIZE.
      if (batch.length === 0 || (total !== null ? rows.length >= total : false)) break;
    }
    return rows;
  }

  async listAccounts(): Promise<AccountSummary[]> {
    return this.accountSummaries(await this.accountRows());
  }

  private accountSummaries(rows: Json[]): AccountSummary[] {
    const accounts = new Map<string, AccountSummary>();
    for (const row of rows) {
      const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
      if (!email || email.length > 254) continue;
      const broken = row.isDisconnected === true || row.error === true;
      const status = broken ? -1 : row.isActive === false ? 2 : 1;
      accounts.set(email, {
        email,
        first_name: text(row.firstName, 200),
        last_name: text(row.lastName, 200),
        status,
        status_message: broken
          ? {
            code: null,
            command: null,
            response: null,
            e_message: text(row.statusMessage, 1_000) ?? `${LABEL} reports this mailbox as disconnected`,
            response_code: null,
          }
          : null,
        warmup_status: row.warmupEnabled === true ? 1 : 0,
        daily_limit: optionalCount(row.limits),
        warmup_limit: null,
        stat_warmup_score: (() => {
          const score = optionalCount(row.warmupHealthScore);
          return score !== null && score <= 100 ? score : null;
        })(),
        has_signature: typeof row.signature === "string" && row.signature.replace(/<[^>]*>/g, "").trim().length > 0,
        tags: Array.isArray(row.tags)
          ? row.tags.flatMap((value) => {
            const tag = record(value);
            const id = riId(tag?.tagId);
            const label = text(tag?.tagName, 300);
            return id && label ? [{ id, label, description: text(tag?.tagDesc, 1_000) }] : [];
          })
          : [],
      });
    }
    return [...accounts.values()].sort((left, right) => left.email.localeCompare(right.email));
  }

  accountSendHistory(): Promise<Map<string, AccountSendDay[]>> {
    return Promise.resolve(new Map());
  }

  async warmupAnalytics(emails: string[]): Promise<Map<string, WarmupAccountAnalytics>> {
    const wanted = new Set(emails.map((email) => email.trim().toLowerCase()));
    const result = new Map<string, WarmupAccountAnalytics>();
    for (const row of await this.accountRows()) {
      const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
      if (!wanted.has(email)) continue;
      const score = optionalCount(row.warmupHealthScore);
      result.set(email, {
        sent: optionalCount(row.warmupEmailSentPastWeek),
        health_score: score !== null && score <= 100 ? score : null,
      });
    }
    return result;
  }

  setAccountPaused(): Promise<void> {
    return Promise.reject(unsupportedFeature(LABEL, "pausing a single mailbox"));
  }

  private campaign(row: Json, senders?: string[]): ProviderCampaign {
    const id = riId(row.id);
    const name = text(row.name, 500);
    if (!id || !name) throw invalid("campaign");
    const maxLeads = optionalCount(row.maxNewLeads);
    const totalLimit = optionalCount(row.dailyLimit);
    return {
      id,
      status: reachInboxCampaignStatus(row),
      // Provenance, not the live sequence: ReachInbox cannot return a
      // campaign's steps. Only campaigns this app built carry the marker, and
      // every settings save from here re-pushes their sequence.
      rendersOurPitch: name.includes(PROVISION_MARKER),
      name,
      senderAccounts: [...new Set((senders ?? (Array.isArray(row.accountsToUse) ? row.accountsToUse : []))
        .flatMap((value) => typeof value === "string" ? [value.trim().toLowerCase()] : []))],
      // The listing's own zone when it carries one; the default is only a
      // display fallback, and is never pushed to a campaign we did not build.
      timezone: campaignTimezone(row) ?? REACHINBOX_DEFAULT_TIMEZONE,
      dailyLimit: Math.min(
        1_000,
        maxLeads && maxLeads > 0 ? maxLeads : totalLimit ? Math.max(1, Math.ceil(totalLimit / EMAILS_PER_HOST)) : 30,
      ),
      emailGap: optionalCount(row.delay),
      notSendingStatus: null,
      schedule: null,
      timestampCreated: timestamp(row.createdAt),
      timestampUpdated: timestamp(row.updatedAt),
    };
  }

  private async campaignRows(contains?: string): Promise<{ rows: Json[]; complete: boolean }> {
    const rows: Json[] = [];
    const seen = new Set<string>();
    // The offset advances by rows actually returned, so a server that caps a
    // page below PAGE_SIZE is walked without gaps.
    let offset = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        sort: "newest",
        filter: "All",
      });
      if (contains) query.set("contains", contains);
      // The live API (checked 2026-11-01) wraps the page as
      // { totalCount, totalSearchedCount, rows }; a bare array is still read.
      const data = dataOf(await this.request<unknown>("/campaigns/all", { query }));
      const page = record(data);
      const batch = Array.isArray(data) ? data : Array.isArray(page?.rows) ? page.rows : null;
      if (!batch) throw invalid("campaign list");
      const total = optionalCount(contains ? page?.totalSearchedCount : page?.totalCount);
      offset += batch.length;
      // A short page does not prove the end (the server's page cap is
      // undocumented); the total or an empty page does. A page of rows
      // already seen means the offset was ignored, so the listing is
      // truncated, never complete: "absent" would then forget a live mapping.
      const fresh = (batch.filter(record) as Json[]).filter((row) => {
        const id = riId(row.id);
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      if (batch.length === 0) return { rows, complete: true };
      if (fresh.length === 0) return { rows, complete: false };
      rows.push(...fresh);
      if (total !== null && rows.length >= total) return { rows, complete: true };
    }
    return { rows, complete: false };
  }

  async listCampaigns(): Promise<{ campaigns: ProviderCampaign[]; complete: boolean }> {
    const { rows, complete } = await this.campaignRows();
    this.campaignCache = new Map(rows.flatMap((row) => riId(row.id) ? [[riId(row.id)!, row] as const] : []));
    return { campaigns: rows.map((row) => this.campaign(row)), complete };
  }

  async searchCampaigns(term: string, limit: number): Promise<ProviderCampaign[]> {
    const { rows } = await this.campaignRows(term);
    return rows.slice(0, limit).map((row) => this.campaign(row));
  }

  async getCampaign(id: string): Promise<ProviderCampaign> {
    let row = this.campaignCache?.get(id) ?? null;
    if (!row) {
      const { rows, complete } = await this.campaignRows();
      this.campaignCache = new Map(rows.flatMap((item) => riId(item.id) ? [[riId(item.id)!, item] as const] : []));
      row = this.campaignCache.get(id) ?? null;
      if (!row) {
        throw complete
          ? new OutreachProviderError(404, `${CODE}_RESOURCE_NOT_FOUND`, `The mapped ${LABEL} campaign no longer exists`)
          : new OutreachProviderError(
            502,
            `${CODE}_REQUEST_FAILED`,
            `${LABEL} has more campaigns than can be searched here; the campaign could not be found`,
          );
      }
    }
    const accounts = record(dataOf(await this.request<unknown>("/campaigns/accounts", {
      query: new URLSearchParams({ campaignId: id }),
    })));
    const senders = Array.isArray(accounts?.accounts) ? accounts.accounts as string[] : undefined;
    return this.campaign(row, senders);
  }

  /**
   * `ours` is false for an agency's hand-built campaign mapped here. Its name
   * and schedule are its own: renaming it would add the GOAP- marker, which is
   * what makes a campaign count as sending our pitch, and pushing a schedule
   * would move it to a zone it never chose. Only limits and senders change.
   */
  private async writeAll(id: string, spec: CampaignSpec, includeSequence: boolean, ours = true) {
    const campaignId = numericId(id);
    await this.request<unknown>("/campaigns/update-details", {
      method: "POST",
      body: ours || includeSequence
        ? {
          campaignId,
          dailyLimit: spec.dailyLimit * EMAILS_PER_HOST,
          maxNewLeads: spec.dailyLimit,
          tracking: true,
          linkTracking: false,
          stopOnReply: true,
          // Text-only on every step: these are one-to-one pitches.
          deliveryOptimizations: 1,
          unsubscribeHeader: true,
          prioritizeNewLeads: true,
          allowRiskyEmails: false,
          bounceProtection: true,
        }
        // A hand-built campaign keeps its own delivery settings.
        : { campaignId, dailyLimit: spec.dailyLimit * EMAILS_PER_HOST, maxNewLeads: spec.dailyLimit },
    });
    if (ours || includeSequence) {
      await this.request<unknown>("/campaigns/set-name", {
        method: "PUT",
        body: { campaignId: String(campaignId), name: spec.name },
      });
      await this.request<unknown>("/campaigns/set-schedule", { method: "PUT", body: scheduleBody(campaignId, spec) });
    }
    await this.request<unknown>("/campaigns/set-accounts", {
      method: "PUT",
      body: { campaignId, accountsToUse: spec.senderAccounts },
    });
    if (includeSequence) {
      await this.request<unknown>("/campaigns/add-sequence", { method: "POST", body: sequenceBody(campaignId, spec) });
    }
    this.campaignCache = null;
  }

  async createCampaign(spec: CampaignSpec): Promise<ProviderCampaign> {
    const created = record(dataOf(await this.request<unknown>("/campaigns/create", {
      method: "POST",
      body: { name: spec.name },
    })));
    const id = riId(created?.id);
    if (!id) throw invalid("campaign");
    await this.writeAll(id, spec, true);
    return this.campaign({ ...created, name: spec.name, accountsToUse: spec.senderAccounts }, spec.senderAccounts);
  }

  async finishProvisioning(
    campaign: ProviderCampaign,
    spec: CampaignSpec,
    options: { adopted: boolean },
  ): Promise<ProviderCampaign> {
    let current = campaign.status === 1 ? await this.pauseCampaign(campaign.id) : campaign;
    // An adopted campaign may be one whose setup stopped after the name was
    // written, and its sequence cannot be read back to tell. Its settings,
    // schedule, senders and sequence are all rewritten before it can take a
    // lead. The variables need no registration: they arrive with each lead.
    if (options.adopted) current = await this.updateCampaign(current.id, spec, { includeSequence: true });
    return current;
  }

  async updateCampaign(id: string, spec: CampaignSpec, options: { includeSequence: boolean }) {
    const ours = options.includeSequence || (await this.getCampaign(id)).rendersOurPitch;
    await this.writeAll(id, spec, options.includeSequence, ours);
    return await this.getCampaign(id);
  }

  async pauseCampaign(id: string): Promise<ProviderCampaign> {
    await this.request<unknown>("/campaigns/pause", { method: "POST", body: { campaignId: numericId(id) } });
    this.campaignCache = null;
    return await this.getCampaign(id);
  }

  async activateCampaign(id: string): Promise<ProviderCampaign> {
    await this.request<unknown>("/campaigns/start", { method: "POST", body: { campaignId: numericId(id) } });
    this.campaignCache = null;
    return await this.getCampaign(id);
  }

  async campaignAnalytics(id: string): Promise<AnalyticsSummary> {
    const end = new Date();
    const start = new Date(end.getTime() - 365 * 86_400_000);
    const data = record(dataOf(await this.request<unknown>("/analytics", {
      method: "POST",
      query: new URLSearchParams({
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      }),
      body: { campaignId: numericId(id), campaignAnalyticsRequired: true, filter: "none" },
    })));
    if (!data) throw invalid("analytics");
    const sent = Array.isArray(data.result)
      ? data.result.reduce((sum, day) => sum + count(record(day)?.sent), 0)
      : 0;
    return {
      emails_sent_count: sent,
      contacted_count: count(data.leadsContacted),
      open_count_unique: count(data.uniqueEmailOpenedCount ?? data.opened),
      reply_count_unique: count(data.uniqueRepliesCount ?? data.replied),
      bounced_count: count(data.bounced),
      unsubscribed_count: 0,
      total_interested: count(data.positiveReplies),
      total_meeting_booked: 0,
    };
  }

  async bulkCampaignAnalytics(ids: string[]): Promise<Map<string, CampaignAnalytics>> {
    const wanted = new Set(ids);
    const result = new Map<string, CampaignAnalytics>();
    if (wanted.size === 0) return result;
    for (const row of (await this.campaignRows()).rows) {
      const id = riId(row.id);
      if (!id || !wanted.has(id)) continue;
      result.set(id, {
        campaignId: id,
        status: reachInboxCampaignStatus(row),
        analytics: {
          emails_sent_count: count(row.totalEmailSent ?? row.sent),
          contacted_count: count(row.uniqueLeadsReachedOut),
          open_count_unique: count(row.totalUniqueEmailOpened ?? row.totalUniqueOpen),
          reply_count_unique: count(row.totalEmailReplied ?? row.totalReplies),
          bounced_count: count(row.totalEmailBounced),
          unsubscribed_count: 0,
          total_interested: 0,
          total_meeting_booked: 0,
        },
      });
    }
    return result;
  }

  campaignSendingStatus(): Promise<SendingStatus> {
    return Promise.reject(unsupportedFeature(LABEL, "a sending diagnosis"));
  }

  private lead(row: Json): ProviderLead | null {
    const id = riId(row.id);
    const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
    if (!id || !email) return null;
    const activities = Array.isArray(row.allActivities) ? row.allActivities.filter(record) as Json[] : [];
    const latest = (type: string) =>
      activities.filter((activity) => activity.type === type)
        .map((activity) => timestamp(activity.occurredAt))
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;
    const opens = activities.filter((activity) => activity.type === "emailOpened").length;
    const replies = activities.filter((activity) => activity.type === "emailReplied").length;
    return {
      id,
      email,
      status: reachInboxLeadStatus(row),
      email_open_count: opens || (row.emailOpened === true ? 1 : 0),
      email_reply_count: replies || (row.replyReceived === true || row.anyReplyReceived === true ? 1 : 0),
      timestamp_updated: timestamp(row.updatedAt) ?? timestamp(row.createdAt),
      email_click_count: activities.filter((activity) => activity.type === "linkClicked").length,
      last_step_id: optionalCount(row.stepNumber) !== null ? String(row.stepNumber) : null,
      email_opened_step: null,
      email_replied_step: null,
      lt_interest_status: null,
      verification_status: null,
      timestamp_last_contact: latest("emailSent"),
      timestamp_last_open: latest("emailOpened"),
      timestamp_last_reply: latest("emailReplied"),
      timestamp_last_click: latest("linkClicked"),
    };
  }

  async listLeads(campaignId: string, email?: string): Promise<ProviderLead[]> {
    if (email) {
      try {
        const row = record(dataOf(await this.request<unknown>("/leads/details", {
          query: new URLSearchParams({ campaignId, email }),
        })));
        const lead = row ? this.lead(row) : null;
        return lead ? [lead] : [];
      } catch (error) {
        if (error instanceof OutreachProviderError && error.status === 404) return [];
        throw error;
      }
    }
    const leads: ProviderLead[] = [];
    let lastLead = "false";
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const data = record(dataOf(await this.request<unknown>("/leads", {
        query: new URLSearchParams({ campaignId, lastLead }),
      })));
      const batch = Array.isArray(data?.leads) ? data.leads.filter(record) as Json[] : null;
      if (!batch) throw invalid("lead list");
      leads.push(...batch.flatMap((row) => {
        const lead = this.lead(row);
        return lead ? [lead] : [];
      }));
      const lastId = riId(batch.at(-1)?.id);
      if (batch.length === 0 || !lastId || lastId === lastLead) break;
      lastLead = lastId;
    }
    return leads;
  }

  async getLead(leadId: string, campaignId: string | null): Promise<ProviderLead | null> {
    if (!campaignId) return null;
    // A 404 propagates: the interface reads it as "deleted upstream", which
    // is what clears a stale lead status.
    const row = record(dataOf(await this.request<unknown>("/leads/details", {
      query: new URLSearchParams({ id: leadId, campaignId }),
    })));
    return row ? this.lead(row) : null;
  }

  async updateLeadVariables(lead: ProviderLead, campaignId: string, variables: PitchVariables) {
    await this.request<unknown>("/leads", {
      method: "POST",
      body: {
        campaignId: numericId(campaignId),
        leadId: numericId(lead.id, "lead"),
        email: lead.email,
        attributes: instantlyCustomVariables(variables),
      },
    });
    return await this.getLead(lead.id, campaignId) ?? lead;
  }

  async addLead(campaignId: string, lead: NewLead, options: { skipIfInCampaign: boolean }) {
    if (options.skipIfInCampaign) {
      const existing = (await this.listLeads(campaignId, lead.email))[0];
      if (existing) return existing;
    }
    const attributes = instantlyCustomVariables(lead.variables);
    await this.request<unknown>("/leads/add", {
      method: "POST",
      body: {
        campaignId: numericId(campaignId),
        leads: [{
          email: lead.email,
          ...(lead.firstName ? { firstName: lead.firstName } : {}),
          ...(lead.lastName ? { lastName: lead.lastName } : {}),
          ...(lead.company ? { companyName: lead.company } : {}),
          ...(lead.website ? { website: lead.website } : {}),
          ...attributes,
        }],
        newCoreVariables: Object.keys(attributes),
        duplicates: [],
      },
    });
    // The add endpoint returns variable names, not the lead.
    return (await this.listLeads(campaignId, lead.email))[0] ?? null;
  }

  async removeLead(campaignId: string | null, leadId: string): Promise<void> {
    if (!campaignId) {
      throw new OutreachProviderError(
        409,
        `${CODE}_CAMPAIGN_REQUIRED`,
        `${LABEL} removes a lead from a campaign, and this lead has no campaign recorded`,
      );
    }
    // Documented: "If an empty array [] is passed, all leads from the specified
    // campaign will be deleted". So the body is built only from one validated
    // id, and never carries the status/contains/leadStatus filters that would
    // widen it.
    const id = numericId(leadId, "lead");
    await this.request<unknown>("/leads/delete", {
      method: "POST",
      body: { campaignId: numericId(campaignId), leadIds: [id] },
    });
  }

  async blockAddress(email: string): Promise<void> {
    await this.request<unknown>("/blocklist/add", { method: "POST", body: { emails: [email] } });
  }

  async unblockAddress(email: string): Promise<boolean> {
    const wanted = email.trim().toLowerCase();
    if (!wanted) return false;
    for (const table of BLOCKLIST_EMAIL_TABLES) {
      let data: Json | null;
      try {
        data = record(dataOf(await this.request<unknown>(`/blocklist/${table}`, {
          query: new URLSearchParams({ limit: "100", offset: "0", q: wanted }),
        })));
      } catch (error) {
        // A table name the API does not know: try the next spelling.
        if (error instanceof OutreachProviderError && (error.status === 404 || error.status === 400)) continue;
        throw error;
      }
      const rows = Array.isArray(data?.rows) ? data.rows.filter(record) as Json[] : null;
      if (!rows) continue;
      // Exact match only: q is a search, and a near match must never be removed.
      const match = rows.find((row) =>
        [row.email, row.value].some((value) => typeof value === "string" && value.trim().toLowerCase() === wanted)
      );
      const id = riId(match?.id);
      if (!id) return false;
      await this.request<unknown>(`/blocklist/${table}`, { method: "DELETE", body: { ids: [Number(id)] } });
      return true;
    }
    return false;
  }
}
