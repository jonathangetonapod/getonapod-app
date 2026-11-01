/**
 * Live smoke test for one outreach provider adapter, run against a real account.
 *
 * Not part of check:static: it talks to a live provider and needs a real key.
 * It uses the same adapters the edge functions use, built through
 * supabase/functions/_shared/outreachProviderFactory.ts.
 *
 * Inputs come from the environment only. The key is read from a file and is
 * never printed; it is never accepted on the command line.
 *
 *   OUTREACH_PROVIDER         emailbison | reachinbox | instantly
 *   OUTREACH_API_KEY_FILE     path to a file whose content is the API key
 *   OUTREACH_BASE_URL         Email Bison instance origin, e.g. https://send.example.com
 *   OUTREACH_TEST_LEAD_EMAIL  required with --write: an address you own
 *
 * Read-only (default): verifyConnection, listAccounts, listCampaigns,
 * getCampaign + campaignAnalytics + listLeads on the first campaign, and
 * bulkCampaignAnalytics.
 *
 *   OUTREACH_PROVIDER=emailbison \
 *   OUTREACH_API_KEY_FILE=$HOME/.secrets/bison.key \
 *   OUTREACH_BASE_URL=https://send.example.com \
 *   deno run --allow-net --allow-env --allow-read=$HOME/.secrets/bison.key \
 *     scripts/smoke-outreach-provider.ts
 *
 * Write cycle (--write): creates a throwaway campaign named
 * GOAP-SMOKE-<timestamp> with no sending mailboxes, then runs finishProvisioning,
 * updateCampaign, addLead, getLead, updateLeadVariables, removeLead and
 * pauseCampaign against it. It never activates the campaign and never attaches a
 * mailbox, so nothing can send. Every write is refused unless the campaign id is
 * the one this run created. The adapter interface has no delete, so the paused,
 * empty campaign is left behind; its id is printed so you can delete it in the
 * provider's UI.
 *
 *   ... OUTREACH_TEST_LEAD_EMAIL=you+smoke@yourdomain.com \
 *   deno run --allow-net --allow-env --allow-read=<key file> \
 *     scripts/smoke-outreach-provider.ts --write
 *
 * Exit code: 0 when every step passed, 1 when any failed, 2 on bad input.
 */

import {
  createOutreachProvider,
  providerBaseUrl,
  requireProviderKind,
} from "../supabase/functions/_shared/outreachProviderFactory.ts";
import {
  type CampaignSpec,
  type OutreachProvider,
  OutreachProviderError,
  type PitchVariables,
  type ProviderCampaign,
  type ProviderLead,
} from "../supabase/functions/_shared/outreachProvider.ts";

interface StepResult {
  step: string;
  ok: boolean;
  ms: number;
  detail: string;
}

const results: StepResult[] = [];

function redactEmail(value: string): string {
  const at = value.lastIndexOf("@");
  if (at <= 0) return value;
  return `${value[0]}***${value.slice(at)}`;
}

/** Deep copy with every email-looking string redacted. */
function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (m) => redactEmail(m));
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [redact(k), redact(v)]));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
  }
  return value;
}

/** A compact type sketch: keys and value kinds, first element of arrays. */
function shape(value: unknown, depth = 0): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (value instanceof Map) {
    const first = value.values().next();
    return `Map(${value.size})${first.done ? "" : `<${shape(first.value, depth + 1)}>`}`;
  }
  if (Array.isArray(value)) {
    return `[${value.length}]${value.length && depth < 2 ? shape(value[0], depth + 1) : ""}`;
  }
  if (typeof value === "object") {
    if (depth >= 2) return "{…}";
    const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) =>
      `${k}:${typeof v === "object" && v !== null ? shape(v, depth + 1) : typeof v}`
    );
    return `{${entries.join(",")}}`;
  }
  return typeof value;
}

function describeError(error: unknown): string {
  if (error instanceof OutreachProviderError) {
    return `${error.code} (HTTP ${error.status}): ${redact(error.message)}`;
  }
  return error instanceof Error ? String(redact(`${error.name}: ${error.message}`)) : String(error);
}

async function step<T>(name: string, run: () => Promise<T>, summarize?: (value: T) => string): Promise<T | undefined> {
  const started = performance.now();
  try {
    const value = await run();
    const detail = summarize ? summarize(value) : shape(value);
    results.push({ step: name, ok: true, ms: Math.round(performance.now() - started), detail });
    return value;
  } catch (error) {
    results.push({ step: name, ok: false, ms: Math.round(performance.now() - started), detail: describeError(error) });
    return undefined;
  }
}

function skip(name: string, reason: string) {
  results.push({ step: name, ok: true, ms: 0, detail: `skipped: ${reason}` });
}

function campaignSummary(c: ProviderCampaign): string {
  return `id=${c.id} status=${c.status} rendersOurPitch=${c.rendersOurPitch} senders=${c.senderAccounts.length} ` +
    `tz=${c.timezone} daily=${c.dailyLimit} schedule=${c.schedule ? JSON.stringify(redact(c.schedule)) : "null"}`;
}

function leadSummary(l: ProviderLead | null): string {
  if (!l) return "null (accepted, lead not returned)";
  return `id=${l.id} email=${redactEmail(l.email)} status=${l.status} opens=${l.email_open_count} replies=${l.email_reply_count}`;
}

function printTable() {
  const width = Math.max(...results.map((r) => r.step.length), 4);
  console.log("");
  console.log(`${"step".padEnd(width)}  result  ms      detail`);
  console.log(`${"-".repeat(width)}  ------  ------  ------`);
  for (const r of results) {
    console.log(`${r.step.padEnd(width)}  ${(r.ok ? "PASS" : "FAIL").padEnd(6)}  ${String(r.ms).padEnd(6)}  ${r.detail}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
}

function fail(message: string): never {
  console.error(`smoke-outreach-provider: ${message}`);
  Deno.exit(2);
}

async function loadInputs() {
  const write = Deno.args.includes("--write");
  const unknown = Deno.args.filter((a) => a !== "--write");
  if (unknown.length) fail(`${unknown.length} unknown argument(s) (not echoed). The key is read from OUTREACH_API_KEY_FILE only.`);

  const rawKind = Deno.env.get("OUTREACH_PROVIDER");
  if (!rawKind) fail("OUTREACH_PROVIDER is required (emailbison | reachinbox | instantly)");
  let kind;
  try {
    kind = requireProviderKind(rawKind);
  } catch (error) {
    fail(describeError(error));
  }

  const keyFile = Deno.env.get("OUTREACH_API_KEY_FILE");
  if (!keyFile) fail("OUTREACH_API_KEY_FILE is required: a path to a file containing the API key");
  let apiKey: string;
  try {
    apiKey = (await Deno.readTextFile(keyFile)).trim();
  } catch (error) {
    fail(`could not read OUTREACH_API_KEY_FILE: ${error instanceof Error ? error.name : "error"}`);
  }
  if (!apiKey) fail("OUTREACH_API_KEY_FILE is empty");

  let baseUrl: string | null;
  try {
    baseUrl = providerBaseUrl(kind, Deno.env.get("OUTREACH_BASE_URL") || null);
  } catch (error) {
    fail(describeError(error));
  }
  if (kind === "emailbison" && !baseUrl) fail("OUTREACH_BASE_URL is required for emailbison");

  const testEmail = Deno.env.get("OUTREACH_TEST_LEAD_EMAIL")?.trim() ?? "";
  if (write && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
    fail("--write needs OUTREACH_TEST_LEAD_EMAIL set to an address you own");
  }
  return { kind, apiKey, baseUrl, write, testEmail };
}

async function readOnly(provider: OutreachProvider) {
  await step("verifyConnection", () => provider.verifyConnection(), (v) =>
    `workspace=${JSON.stringify(redact(v.workspace))} accounts=${v.accounts.length}`);

  const accounts = await step("listAccounts", () => provider.listAccounts(), (v) =>
    `${v.length} accounts; first=${v[0] ? JSON.stringify(redact({ email: v[0].email, status: v[0].status, daily_limit: v[0].daily_limit, warmup_status: v[0].warmup_status })) : "none"}; shape=${shape(v)}`);

  if (accounts?.length) {
    const sample = accounts.slice(0, 3).map((a) => a.email);
    await step("warmupAnalytics(3)", () => provider.warmupAnalytics(sample), (v) => shape(redact(v)));
  }

  const listing = await step("listCampaigns", () => provider.listCampaigns(), (v) =>
    `${v.campaigns.length} campaigns complete=${v.complete}; statuses=${JSON.stringify(
      v.campaigns.reduce<Record<string, number>>((acc, c) => ((acc[c.status] = (acc[c.status] ?? 0) + 1), acc), {}),
    )}`);

  const first = listing?.campaigns[0];
  if (!first) {
    skip("getCampaign", "no campaigns");
    skip("campaignAnalytics", "no campaigns");
    skip("listLeads", "no campaigns");
  } else {
    await step(`getCampaign(${first.id})`, () => provider.getCampaign(first.id), campaignSummary);
    await step(`campaignAnalytics(${first.id})`, () => provider.campaignAnalytics(first.id), (v) => JSON.stringify(v));
    await step(`listLeads(${first.id})`, () => provider.listLeads(first.id), (v) =>
      `${v.length} leads; first=${v[0] ? leadSummary(v[0]) : "none"}`);
  }

  if (listing?.campaigns.length) {
    const ids = listing.campaigns.slice(0, 10).map((c) => c.id);
    await step(`bulkCampaignAnalytics(${ids.length})`, () => provider.bulkCampaignAnalytics(ids), (v) =>
      `${v.size}/${ids.length} returned; first=${JSON.stringify(v.values().next().value ?? null)}`);
  }
}

async function writeCycle(provider: OutreachProvider, testEmail: string) {
  const name = `GOAP-SMOKE-${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}`;
  const spec: CampaignSpec = {
    name,
    timezone: "America/New_York",
    dailyLimit: 1,
    senderAccounts: [], // never attach a mailbox: nothing can send
    sendDays: [1, 2, 3, 4, 5],
    windowStart: "09:00",
    windowEnd: "17:00",
    followUpOneDelayDays: 3,
    followUpTwoDelayDays: 4,
  };

  let ownedId: string | null = null;
  const owned = (id: string) => {
    if (!ownedId || id !== ownedId) {
      throw new Error(`refusing to touch campaign ${id}: this run created ${ownedId ?? "nothing"}`);
    }
    return id;
  };

  const created = await step(`createCampaign(${name})`, () => provider.createCampaign(spec), campaignSummary);
  if (!created) return;
  if (created.name !== name) {
    results.push({ step: "guard", ok: false, ms: 0, detail: `created campaign came back named "${created.name}"; stopping` });
    return;
  }
  ownedId = created.id;
  console.log(`created throwaway campaign ${ownedId} (${name})`);

  try {
    if (created.senderAccounts.length) {
      results.push({ step: "guard: no senders", ok: false, ms: 0, detail: `campaign has ${created.senderAccounts.length} senders` });
    }

    await step("finishProvisioning", () => provider.finishProvisioning(created, spec, { adopted: false }), campaignSummary);
    await step("updateCampaign(+sequence)", () =>
      provider.updateCampaign(owned(created.id), { ...spec, dailyLimit: 2 }, { includeSequence: true }), campaignSummary);

    const variables: PitchVariables = {
      pitchSubject: "Smoke test subject",
      pitchBody: "Smoke test body. Not sent.",
      followUpOneSubject: "Smoke follow-up one",
      followUpOneBody: "Smoke follow-up one body.",
      followUpTwoSubject: "Smoke follow-up two",
      followUpTwoBody: "Smoke follow-up two body.",
      clientName: "Smoke Client",
      podcastName: "Smoke Podcast",
      targetId: "00000000-0000-0000-0000-000000000000",
    };

    let lead = await step("addLead", () =>
      provider.addLead(owned(created.id), {
        email: testEmail,
        firstName: "Smoke",
        lastName: "Test",
        company: "Get On A Pod smoke test",
        variables,
      }, { skipIfInCampaign: true }), leadSummary);

    if (lead === null) {
      const found = await step("listLeads(recover)", () => provider.listLeads(owned(created.id), testEmail), (v) =>
        `${v.length} found`);
      lead = found?.[0] ?? null;
    }

    if (lead) {
      await step("getLead", () => provider.getLead(lead!.id, owned(created.id)), leadSummary);
      await step("updateLeadVariables", () =>
        provider.updateLeadVariables(lead!, owned(created.id), { ...variables, pitchSubject: "Smoke subject v2" }), leadSummary);
      await step("removeLead", () => provider.removeLead(owned(created.id), lead!.id), () => "removed");
      await step("listLeads(after remove)", () => provider.listLeads(owned(created.id), testEmail), (v) => {
        if (v.length) throw new Error(`lead still present (${v.length})`);
        return "0 leads";
      });
    } else {
      skip("getLead", "no lead");
      skip("updateLeadVariables", "no lead");
      skip("removeLead", "no lead");
    }

    await step("pauseCampaign", () => provider.pauseCampaign(owned(created.id)), campaignSummary);
  } finally {
    // Cleanup: make sure the throwaway campaign is paused and holds no smoke lead.
    // There is no delete in the adapter interface.
    try {
      const current = await provider.getCampaign(owned(created.id));
      if (current.status === 1) await provider.pauseCampaign(owned(created.id));
      const leftover = await provider.listLeads(owned(created.id), testEmail);
      for (const l of leftover) await provider.removeLead(owned(created.id), l.id);
      results.push({ step: "cleanup", ok: true, ms: 0, detail: `campaign ${ownedId} paused/draft, ${leftover.length} leftover lead(s) removed; delete it in the provider UI` });
    } catch (error) {
      results.push({ step: "cleanup", ok: false, ms: 0, detail: `${describeError(error)}; check campaign ${ownedId} by hand` });
    }
  }
}

async function main() {
  const { kind, apiKey, baseUrl, write, testEmail } = await loadInputs();
  console.log(`provider=${kind}${baseUrl ? ` base=${baseUrl}` : ""} mode=${write ? "read+write" : "read-only"}`);

  let provider: OutreachProvider;
  try {
    provider = await createOutreachProvider(kind, apiKey, baseUrl);
  } catch (error) {
    fail(`could not build provider: ${describeError(error)}`);
  }
  console.log(`capabilities=${JSON.stringify(provider.capabilities)}`);

  await readOnly(provider);
  if (write) await writeCycle(provider, testEmail);

  printTable();
  Deno.exit(results.some((r) => !r.ok) ? 1 : 0);
}

if (import.meta.main) await main();
