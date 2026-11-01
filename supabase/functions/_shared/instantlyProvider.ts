/**
 * Instantly behind the outreach provider interface.
 *
 * The request code here moved out of workspace-client-campaigns unchanged:
 * same endpoints, same payloads, same parsing. What moved is where it lives,
 * so Email Bison can sit beside it behind the same operations.
 */

import {
  getInstantlyAccountSendHistory,
  getInstantlyWarmupAnalytics,
  getInstantlyWorkspace,
  InstantlyApiError,
  instantlyCampaignStatus,
  instantlyRequest,
  listInstantlyAccounts,
  listInstantlyCampaignAnalytics,
  safeInstantlyAnalytics,
  addInstantlyBlockListEntry,
  removeInstantlyBlockListEntry,
} from "./instantly.ts";
import type {
  AccountSummary,
  CampaignSpec,
  NewLead,
  OutreachProvider,
  PitchVariables,
  ProviderCampaign,
  ProviderLead,
  ProviderSchedule,
  SendingStatus,
} from "./outreachProvider.ts";

const MAX_PROVIDER_CAMPAIGN_PAGES = 10;
const MAX_LEAD_PAGES = 10;

/** US Eastern, chosen because Instantly has no America/New_York. */
export const INSTANTLY_DEFAULT_TIMEZONE = "America/Detroit";

/** The pitch and its two follow-ups: what one new host costs in sends. */
export const EMAILS_PER_HOST = 3;

/** Instantly's schedule is keyed "0".."6" starting at Sunday. */
const SEND_DAY_KEYS = ["0", "1", "2", "3", "4", "5", "6"] as const;

/** The goap* variables the three steps read. Registering them is what makes a
 * written pitch render; a campaign without them sends its own copy. */
export const PROVISIONED_CAMPAIGN_VARIABLES = [
  "goapPitchSubject",
  "goapPitchBody",
  "goapFollowUpOneSubject",
  "goapFollowUpOneBody",
  "goapFollowUpTwoSubject",
  "goapFollowUpTwoBody",
  "clientName",
  "podcastName",
  "goapTargetId",
] as const;

function providerUuid(value: unknown): string | null {
  return typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      )
    ? value.toLowerCase()
    : null;
}

function wholeCount(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.max(0, value)
    : 0;
}

/** Kept null rather than defaulted: "not reported" is not the same as zero. */
function nullableWhole(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Does this sequence send the copy we write, or copy of its own?
 *
 * Checks the opening step for the pitch-body variable. Naming and provenance
 * both lie — a campaign can be renamed in Instantly, and one created here can
 * have its sequence replaced there — so the only trustworthy answer comes from
 * the sequence itself. Anything unrecognised reads as false, because a wrong
 * "yes" sends a host the wrong email while reporting success.
 */
export function sequenceRendersOurPitch(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const first = value[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) return false;
  const steps = (first as Record<string, unknown>).steps;
  if (!Array.isArray(steps) || steps.length === 0) return false;
  const opening = steps[0];
  if (!opening || typeof opening !== "object" || Array.isArray(opening)) return false;
  const variants = (opening as Record<string, unknown>).variants;
  if (!Array.isArray(variants)) return false;
  return variants.some((variant) => (
    variant && typeof variant === "object" && !Array.isArray(variant) &&
    typeof (variant as Record<string, unknown>).body === "string" &&
    ((variant as Record<string, unknown>).body as string).includes("{{goapPitchBody}}")
  ));
}

export function instantlyProviderCampaign(value: unknown): ProviderCampaign {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InstantlyApiError(
      502,
      "INSTANTLY_RESPONSE_INVALID",
      "Instantly returned an invalid campaign",
    );
  }
  const item = value as Record<string, unknown>;
  const id = providerUuid(item.id);
  const status = instantlyCampaignStatus(item.status);
  const name = typeof item.name === "string" ? item.name.trim() : "";
  if (!id || status === null || !name) {
    throw new InstantlyApiError(
      502,
      "INSTANTLY_RESPONSE_INVALID",
      "Instantly returned an invalid campaign",
    );
  }
  const senderAccounts = Array.isArray(item.email_list)
    ? Array.from(new Set(item.email_list.flatMap((candidate) => {
      if (typeof candidate !== "string") return [];
      const email = candidate.trim().toLowerCase();
      return email && email.length <= 254 ? [email] : [];
    })))
    : [];
  const rendersOurPitch = sequenceRendersOurPitch(item.sequences);
  const schedule = item.campaign_schedule &&
      typeof item.campaign_schedule === "object" &&
      !Array.isArray(item.campaign_schedule)
    ? item.campaign_schedule as Record<string, unknown>
    : null;
  const firstSchedule = Array.isArray(schedule?.schedules) &&
      schedule.schedules[0] &&
      typeof schedule.schedules[0] === "object" &&
      !Array.isArray(schedule.schedules[0])
    ? schedule.schedules[0] as Record<string, unknown>
    : null;
  const timezone = typeof firstSchedule?.timezone === "string" &&
      firstSchedule.timezone.trim() && firstSchedule.timezone.length <= 100
    ? firstSchedule.timezone.trim()
    // US Eastern, and a zone Instantly actually carries. America/New_York is
    // not in its enum, so falling back to that produced a value we could read
    // but never send back.
    : INSTANTLY_DEFAULT_TIMEZONE;
  // The local daily_limit is new hosts per day, which Instantly calls
  // daily_max_leads. A hand-built campaign may only carry the total email cap,
  // so that is read as hosts by dividing out the sequence; taking it as-is
  // would triple the campaign's volume on its first settings save.
  const wholeLimit = (candidate: unknown): number | null =>
    typeof candidate === "number" && Number.isInteger(candidate) &&
      candidate >= 1
      ? candidate
      : null;
  const maxLeads = wholeLimit(item.daily_max_leads);
  const totalLimit = wholeLimit(item.daily_limit);
  const dailyLimit = Math.min(
    1_000,
    maxLeads ?? (totalLimit ? Math.ceil(totalLimit / EMAILS_PER_HOST) : 30),
  );
  const emailGap = typeof item.email_gap === "number" &&
      Number.isFinite(item.email_gap) && item.email_gap >= 0 &&
      item.email_gap <= 1_440
    ? Math.round(item.email_gap)
    : null;
  const scheduleDays = firstSchedule?.days &&
      typeof firstSchedule.days === "object" && !Array.isArray(firstSchedule.days)
    ? firstSchedule.days as Record<string, unknown>
    : null;
  const timeOfDay = (candidate: unknown): string | null => (
    typeof candidate === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(candidate)
      ? candidate
      : null
  );
  const timing = firstSchedule?.timing &&
      typeof firstSchedule.timing === "object" && !Array.isArray(firstSchedule.timing)
    ? firstSchedule.timing as Record<string, unknown>
    : null;
  const providerSchedule: ProviderSchedule | null = firstSchedule
    ? {
      name: typeof firstSchedule.name === "string"
        ? firstSchedule.name.slice(0, 120)
        : null,
      from: timeOfDay(timing?.from),
      to: timeOfDay(timing?.to),
      timezone: typeof firstSchedule.timezone === "string"
        ? firstSchedule.timezone.slice(0, 100)
        : null,
      days: scheduleDays
        ? Array.from({ length: 7 }, (_value, index) => scheduleDays[String(index)] === true)
        : [],
    }
    : null;
  const timestamp = (candidate: unknown): string | null => (
    typeof candidate === "string" && !Number.isNaN(Date.parse(candidate))
      ? candidate
      : null
  );
  // Answers "active, but why is nothing going out". Kept as the provider's own
  // integer rather than a phrase, so a code this build does not recognise
  // still arrives instead of being dropped in translation.
  const notSendingStatus = typeof item.not_sending_status === "number" &&
      Number.isInteger(item.not_sending_status)
    ? item.not_sending_status
    : null;
  return {
    id,
    status,
    rendersOurPitch,
    name: name.slice(0, 500),
    senderAccounts,
    timezone,
    dailyLimit,
    emailGap,
    notSendingStatus,
    schedule: providerSchedule,
    timestampCreated: timestamp(item.timestamp_created),
    timestampUpdated: timestamp(item.timestamp_updated),
  };
}

export function instantlyProviderLead(value: unknown): ProviderLead | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const lead = value as Record<string, unknown>;
  const id = providerUuid(lead.id);
  const email = typeof lead.email === "string"
    ? lead.email.trim().toLowerCase()
    : "";
  if (!id || !email) return null;
  return {
    id,
    email,
    status: typeof lead.status === "number" && Number.isInteger(lead.status)
      ? lead.status
      : null,
    email_open_count: typeof lead.email_open_count === "number" &&
        Number.isInteger(lead.email_open_count)
      ? Math.max(0, lead.email_open_count)
      : 0,
    email_reply_count: typeof lead.email_reply_count === "number" &&
        Number.isInteger(lead.email_reply_count)
      ? Math.max(0, lead.email_reply_count)
      : 0,
    timestamp_updated: typeof lead.timestamp_updated === "string"
      ? lead.timestamp_updated
      : null,
    email_click_count: wholeCount(lead.email_click_count),
    last_step_id: nullableString(lead.last_step_id),
    email_opened_step: nullableWhole(lead.email_opened_step),
    email_replied_step: nullableWhole(lead.email_replied_step),
    lt_interest_status: nullableWhole(lead.lt_interest_status),
    verification_status: nullableWhole(lead.verification_status),
    timestamp_last_contact: nullableString(lead.timestamp_last_contact),
    timestamp_last_open: nullableString(lead.timestamp_last_open),
    timestamp_last_reply: nullableString(lead.timestamp_last_reply),
    timestamp_last_click: nullableString(lead.timestamp_last_click),
  };
}

/**
 * The provider config for a campaign this app owns the sequence of.
 *
 * Shared by the client's own campaign and by the extra campaigns an operator
 * creates from the client card, because "sendable" means exactly this shape:
 * three steps reading the goap* variables. A campaign built by hand in Instantly
 * has its own sequence and none of these, which is why it can be linked for
 * reply attribution but never chosen as a send target.
 */
export function provisionedCampaignConfiguration(
  input: CampaignSpec,
): Record<string, unknown> {
  // Monday to Friday. This used to be written as days 0 through 4 under the
  // name "Weekdays", but 0 is Sunday, so every campaign built here sent on
  // Sunday and never on Friday.
  const sendDays = new Set(input.sendDays?.length ? input.sendDays : [1, 2, 3, 4, 5]);
  const days = Object.fromEntries(
    SEND_DAY_KEYS.map((key) => [key, sendDays.has(Number(key))]),
  );
  const followUpOneDelay = input.followUpOneDelayDays ?? 6;
  const followUpTwoDelay = input.followUpTwoDelayDays ?? 7;
  return {
    name: input.name,
    is_evergreen: true,
    campaign_schedule: {
      schedules: [{
        name: "Sending window",
        timing: {
          from: input.windowStart ?? "09:00",
          to: input.windowEnd ?? "17:00",
        },
        days,
        timezone: input.timezone,
      }],
    },
    sequences: [{
      steps: [
        {
          type: "email",
          // Instantly reads a step's delay as the wait before the NEXT email,
          // so the opening step carries the gap to follow-up one. Default six
          // days: under three reads as pestering, and each follow-up has to
          // add something new.
          delay: followUpOneDelay,
          delay_unit: "days",
          variants: [{
            subject: "{{goapPitchSubject}}",
            body: "{{goapPitchBody}}",
            v_disabled: false,
          }],
        },
        {
          type: "email",
          delay: followUpTwoDelay,
          delay_unit: "days",
          variants: [{
            // Empty on purpose. Instantly threads a step with no subject as a
            // reply to the opening email; giving it one starts a separate
            // conversation, so a host who ignored the pitch got three unrelated
            // emails instead of one thread they could scroll back through.
            subject: "",
            body: "{{goapFollowUpOneBody}}",
            v_disabled: false,
          }],
        },
        {
          type: "email",
          delay: 0,
          delay_unit: "days",
          variants: [{
            // Empty for the same reason as the step above: this one replies
            // into the thread rather than opening a third.
            subject: "",
            body: "{{goapFollowUpTwoBody}}",
            v_disabled: false,
          }],
        },
      ],
    }],
    email_list: input.senderAccounts,
    // Two different caps. daily_max_leads is how many new hosts start the
    // sequence each day; daily_limit is every email, follow-ups included.
    // Setting both to the same number let new hosts use up the day and push
    // follow-ups back, since new leads go first.
    daily_limit: input.dailyLimit * EMAILS_PER_HOST,
    daily_max_leads: input.dailyLimit,
    email_gap: 15,
    random_wait_max: 10,
    text_only: true,
    first_email_text_only: true,
    stop_on_reply: true,
    stop_on_auto_reply: false,
    open_tracking: true,
    link_tracking: false,
    prioritize_new_leads: true,
    insert_unsubscribe_header: true,
    allow_risky_contacts: false,
    disable_bounce_protect: false,
  };
}

/** The variables the Instantly sequence renders. */
export function instantlyCustomVariables(variables: PitchVariables): Record<string, unknown> {
  return {
    goapPitchSubject: variables.pitchSubject,
    goapPitchBody: variables.pitchBody,
    goapFollowUpOneSubject: variables.followUpOneSubject,
    goapFollowUpOneBody: variables.followUpOneBody,
    goapFollowUpTwoSubject: variables.followUpTwoSubject,
    goapFollowUpTwoBody: variables.followUpTwoBody,
    clientName: variables.clientName,
    podcastName: variables.podcastName,
    goapTargetId: variables.targetId,
  };
}

function invalidList(what: string): InstantlyApiError {
  return new InstantlyApiError(
    502,
    "INSTANTLY_RESPONSE_INVALID",
    `Instantly returned an invalid ${what}`,
  );
}

function itemsOf(value: unknown, what: string): unknown[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidList(what);
  const items = (value as Record<string, unknown>).items;
  if (!Array.isArray(items)) throw invalidList(what);
  return items;
}

function nested(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export class InstantlyProvider implements OutreachProvider {
  readonly kind = "instantly" as const;
  readonly label = "Instantly";
  readonly capabilities = {
    mailboxPause: true,
    mailboxSendHistory: true,
    sendingStatus: true,
    inbox: true,
  };

  /** Exposed for the Instantly-only inbox actions, which have no Bison twin. */
  constructor(readonly apiKey: string) {}

  async verifyConnection() {
    const [workspace, accounts] = await Promise.all([
      getInstantlyWorkspace(this.apiKey),
      listInstantlyAccounts(this.apiKey),
      this.verifyReadAccess(),
    ]);
    return { workspace, accounts };
  }

  private async verifyReadAccess(): Promise<void> {
    const [campaigns, leads] = await Promise.all([
      instantlyRequest<unknown>(this.apiKey, "/campaigns", {
        query: new URLSearchParams({ limit: "1" }),
      }),
      instantlyRequest<unknown>(this.apiKey, "/leads/list", {
        method: "POST",
        body: { limit: 1 },
      }),
    ]);
    for (const value of [campaigns, leads]) {
      itemsOf(value, "list response");
    }
  }

  listAccounts(): Promise<AccountSummary[]> {
    return listInstantlyAccounts(this.apiKey);
  }

  accountSendHistory(emails: string[], options: { days: number; timeZone: string }) {
    return getInstantlyAccountSendHistory(this.apiKey, emails, options);
  }

  warmupAnalytics(emails: string[]) {
    return getInstantlyWarmupAnalytics(this.apiKey, emails);
  }

  async setAccountPaused(providerEmail: string, paused: boolean): Promise<void> {
    await instantlyRequest<unknown>(
      this.apiKey,
      `/accounts/${encodeURIComponent(providerEmail)}/${paused ? "pause" : "resume"}`,
      { method: "POST" },
    );
  }

  /**
   * Every campaign, and whether that is genuinely every campaign.
   *
   * The page cap means a long-enough list comes back short, and the difference
   * matters: a campaign missing from a COMPLETE listing has been deleted, while
   * one missing from a truncated listing may be perfectly alive further down.
   */
  async listCampaigns() {
    const campaigns = new Map<string, ProviderCampaign>();
    let startingAfter = "";
    let complete = false;
    for (let page = 0; page < MAX_PROVIDER_CAMPAIGN_PAGES; page += 1) {
      const query = new URLSearchParams({ limit: "100" });
      if (startingAfter) query.set("starting_after", startingAfter);
      const value = await instantlyRequest<unknown>(this.apiKey, "/campaigns", { query });
      for (const item of itemsOf(value, "campaign list")) {
        const campaign = instantlyProviderCampaign(item);
        campaigns.set(campaign.id, campaign);
      }
      const response = value as Record<string, unknown>;
      const next = typeof response.next_starting_after === "string"
        ? response.next_starting_after.trim()
        : "";
      // Running out of pages is the only way to know nothing was left behind.
      if (!next || next === startingAfter) {
        complete = true;
        break;
      }
      startingAfter = next;
    }
    return {
      campaigns: Array.from(campaigns.values()).sort((left, right) => (
        (right.timestampUpdated || right.timestampCreated || "").localeCompare(
          left.timestampUpdated || left.timestampCreated || "",
        ) || left.name.localeCompare(right.name)
      )),
      complete,
    };
  }

  async searchCampaigns(term: string, limit: number): Promise<ProviderCampaign[]> {
    const query = new URLSearchParams({ limit: String(limit), search: term });
    const response = await instantlyRequest<unknown>(this.apiKey, "/campaigns", { query });
    const items = response && typeof response === "object" && !Array.isArray(response)
      ? (response as Record<string, unknown>).items
      : null;
    if (!Array.isArray(items)) return [];
    return items.flatMap((item) => {
      try {
        return [instantlyProviderCampaign(item)];
      } catch {
        return [];
      }
    });
  }

  async getCampaign(id: string): Promise<ProviderCampaign> {
    return instantlyProviderCampaign(
      await instantlyRequest<unknown>(this.apiKey, `/campaigns/${encodeURIComponent(id)}`),
    );
  }

  async createCampaign(spec: CampaignSpec): Promise<ProviderCampaign> {
    return instantlyProviderCampaign(
      await instantlyRequest<unknown>(this.apiKey, "/campaigns", {
        method: "POST",
        body: provisionedCampaignConfiguration(spec),
      }),
    );
  }

  // Instantly creates a campaign in one request, so an adopted one is whole;
  // the spec is not needed here.
  async finishProvisioning(campaign: ProviderCampaign): Promise<ProviderCampaign> {
    let current = campaign;
    // Created paused. A campaign that started sending the moment it existed
    // would reach hosts before anybody chose who belongs in it.
    if (current.status === 1) current = await this.pauseCampaign(current.id);
    await instantlyRequest<unknown>(
      this.apiKey,
      `/campaigns/${encodeURIComponent(current.id)}/variables`,
      {
        method: "POST",
        body: { variables: [...PROVISIONED_CAMPAIGN_VARIABLES] },
      },
    );
    return current;
  }

  async updateCampaign(
    id: string,
    spec: CampaignSpec,
    options: { includeSequence: boolean },
  ): Promise<ProviderCampaign> {
    const configuration = provisionedCampaignConfiguration(spec);
    // Sending the steps keeps an app-built campaign's cadence in step with the
    // form. Sending them to a campaign somebody wrote by hand overwrites their
    // copy, which a daily-limit change must never do.
    if (!options.includeSequence) delete configuration.sequences;
    return instantlyProviderCampaign(
      await instantlyRequest<unknown>(this.apiKey, `/campaigns/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: configuration,
      }),
    );
  }

  async pauseCampaign(id: string): Promise<ProviderCampaign> {
    return instantlyProviderCampaign(
      await instantlyRequest<unknown>(
        this.apiKey,
        `/campaigns/${encodeURIComponent(id)}/pause`,
        { method: "POST" },
      ),
    );
  }

  async activateCampaign(id: string): Promise<ProviderCampaign> {
    return instantlyProviderCampaign(
      await instantlyRequest<unknown>(
        this.apiKey,
        `/campaigns/${encodeURIComponent(id)}/activate`,
        { method: "POST" },
      ),
    );
  }

  async campaignAnalytics(id: string) {
    return safeInstantlyAnalytics(
      await instantlyRequest<unknown>(this.apiKey, "/campaigns/analytics/overview", {
        query: new URLSearchParams({ id }),
      }),
    );
  }

  bulkCampaignAnalytics(ids: string[]) {
    return listInstantlyCampaignAnalytics(this.apiKey, ids);
  }

  async campaignSendingStatus(id: string): Promise<SendingStatus> {
    const raw = await instantlyRequest<unknown>(
      this.apiKey,
      `/campaigns/${encodeURIComponent(id)}/sending-status`,
    );
    const payload = raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : {};
    const summary = nested(payload, "summary");
    const diagnostics = nested(payload, "diagnostics");
    const accounts = nested(diagnostics, "accounts_summary");
    const unavailable = nested(accounts, "unavailable");
    const dailyLimit = nested(diagnostics, "campaign_daily_limit");
    const followUps = nested(diagnostics, "follow_ups_waiting");
    const schedule = nested(diagnostics, "schedule_status");
    return {
      // The provider's own words where it gives them; this app does not
      // paraphrase a diagnosis it did not make.
      status: nullableString(summary?.status),
      status_message: nullableString(summary?.status_message),
      issue_started_at: nullableString(summary?.issue_started_at),
      last_healthy_send_at: nullableString(summary?.last_healthy_send_at),
      in_schedule: typeof schedule?.in_schedule === "boolean" ? schedule.in_schedule : null,
      accounts: accounts
        ? {
          total_connected: nullableWhole(accounts.total_connected),
          available: nullableWhole(accounts.available),
          daily_limit_hit: nullableWhole(unavailable?.daily_limit_hit),
          disconnected: nullableWhole(unavailable?.disconnected),
          slow_ramp_limit_hit: nullableWhole(unavailable?.slow_ramp_limit_hit),
        }
        : null,
      daily_limit: dailyLimit
        ? {
          limit: nullableWhole(dailyLimit.limit),
          sent: nullableWhole(dailyLimit.sent),
          limit_hit: dailyLimit.limit_hit === true,
        }
        : null,
      follow_ups_waiting: followUps
        ? {
          count: nullableWhole(followUps.count),
          earliest_wait_seconds: nullableWhole(followUps.earliest_wait_time_seconds),
        }
        : null,
    };
  }

  async listLeads(campaignId: string, search?: string): Promise<ProviderLead[]> {
    const leads: ProviderLead[] = [];
    let startingAfter = "";
    for (let page = 0; page < MAX_LEAD_PAGES; page += 1) {
      const response = await instantlyRequest<unknown>(this.apiKey, "/leads/list", {
        method: "POST",
        body: {
          campaign: campaignId,
          limit: 100,
          ...(search ? { search } : {}),
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        },
      });
      leads.push(...itemsOf(response, "lead list").flatMap((item) => {
        const parsed = instantlyProviderLead(item);
        return parsed ? [parsed] : [];
      }));
      const record = response as Record<string, unknown>;
      const next = typeof record.next_starting_after === "string"
        ? record.next_starting_after
        : "";
      if (!next || next === startingAfter || search) break;
      startingAfter = next;
    }
    return leads;
  }

  async getLead(leadId: string): Promise<ProviderLead | null> {
    return instantlyProviderLead(
      await instantlyRequest<unknown>(this.apiKey, `/leads/${encodeURIComponent(leadId)}`),
    );
  }

  async updateLeadVariables(
    lead: ProviderLead,
    _campaignId: string,
    variables: PitchVariables,
  ): Promise<ProviderLead | null> {
    const patched = await instantlyRequest<unknown>(
      this.apiKey,
      `/leads/${encodeURIComponent(lead.id)}`,
      { method: "PATCH", body: { custom_variables: instantlyCustomVariables(variables) } },
    );
    return instantlyProviderLead(patched);
  }

  async addLead(
    campaignId: string,
    lead: NewLead,
    options: { skipIfInCampaign: boolean },
  ): Promise<ProviderLead | null> {
    const customVariables = instantlyCustomVariables(lead.variables);
    if (options.skipIfInCampaign) {
      const created = await instantlyRequest<unknown>(this.apiKey, "/leads", {
        method: "POST",
        body: {
          campaign: campaignId,
          email: lead.email,
          first_name: lead.firstName || undefined,
          last_name: lead.lastName || undefined,
          company_name: lead.company,
          website: lead.website || undefined,
          personalization: lead.personalization,
          custom_variables: customVariables,
          // The workspace pitches one show for many clients over time, so a
          // contact known elsewhere is not a reason to skip this one.
          // Duplicates within THIS campaign are refused by the caller, on its
          // own records.
          skip_if_in_workspace: false,
          skip_if_in_campaign: true,
          skip_if_in_list: false,
          verify_leads_on_import: false,
        },
      });
      // skip_if_in_campaign returns no lead when one already existed.
      return instantlyProviderLead(created);
    }
    const importResponse = await instantlyRequest<unknown>(this.apiKey, "/leads/add", {
      method: "POST",
      body: {
        campaign_id: campaignId,
        leads: [{
          email: lead.email,
          first_name: lead.firstName || undefined,
          company_name: lead.company,
          website: lead.website || undefined,
          personalization: lead.personalization,
          custom_variables: customVariables,
        }],
        verify_leads_on_import: false,
        skip_if_in_workspace: false,
        skip_if_in_campaign: false,
        skip_if_in_list: false,
      },
    });
    if (!importResponse || typeof importResponse !== "object" || Array.isArray(importResponse)) {
      throw new InstantlyApiError(
        502,
        "INSTANTLY_RESPONSE_INVALID",
        "Instantly returned an invalid lead result",
      );
    }
    const imported = importResponse as Record<string, unknown>;
    return Array.isArray(imported.created_leads)
      ? imported.created_leads.map(instantlyProviderLead).find(Boolean) || null
      : null;
  }

  async removeLead(_campaignId: string | null, leadId: string): Promise<void> {
    await instantlyRequest<unknown>(
      this.apiKey,
      `/leads/${encodeURIComponent(leadId)}`,
      { method: "DELETE" },
    );
  }

  blockAddress(email: string): Promise<void> {
    return addInstantlyBlockListEntry(this.apiKey, email);
  }

  unblockAddress(email: string): Promise<boolean> {
    return removeInstantlyBlockListEntry(this.apiKey, email);
  }
}
