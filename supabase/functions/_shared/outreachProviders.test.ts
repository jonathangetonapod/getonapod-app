import {
  bisonCampaignStatus,
  bisonCustomVariables,
  bisonLeadStatus,
  bisonStepsRenderOurPitch,
  EmailBisonProvider,
  resolveBisonTimezone,
} from "./emailBison.ts";
import {
  instantlyProviderCampaign,
  provisionedCampaignConfiguration,
  sequenceRendersOurPitch,
} from "./instantlyProvider.ts";
import { InstantlyApiError, safeInstantlyError } from "./instantly.ts";
import { normalizeProviderId, OutreachProviderError } from "./outreachProvider.ts";
import { providerBaseUrl, requireProviderKind } from "./outreachProviderFactory.ts";
import { isPrivateAddress, normalizeProviderOrigin, providerRequest } from "./providerHttp.ts";
import {
  reachInboxCampaignStatus,
  reachInboxKeyFingerprint,
  reachInboxLeadStatus,
  ReachInboxProvider,
} from "./reachInbox.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`,
  );
}

async function rejects(fn: () => Promise<unknown>, code: string, message: string) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof OutreachProviderError, `${message}: wrong error type ${error}`);
    assertEquals(error.code, code, message);
    return;
  }
  throw new Error(`${message}: did not reject`);
}

interface Call {
  method: string;
  url: URL;
  body: unknown;
  redirect: RequestRedirect | undefined;
  auth: string | null;
}

/** Replaces fetch for one test; `route` answers each call. */
async function withFetch(
  route: (call: Call) => { status?: number; body?: unknown },
  run: (calls: Call[]) => Promise<void>,
) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = ((input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    const call: Call = {
      method: init?.method ?? "GET",
      url,
      body: init?.body ? JSON.parse(String(init.body)) : null,
      redirect: init?.redirect,
      auth: new Headers(init?.headers).get("authorization"),
    };
    calls.push(call);
    const answer = route(call);
    const status = answer.status ?? 200;
    return Promise.resolve(
      new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

// --- identifiers and provider selection -------------------------------------

Deno.test("provider ids accept Instantly UUIDs and Bison/ReachInbox integers only", () => {
  assertEquals(normalizeProviderId("ABCDEF12-3456-7890-ABCD-EF1234567890"), "abcdef12-3456-7890-abcd-ef1234567890", "uuid lowercased");
  assertEquals(normalizeProviderId(42), "42", "integer accepted");
  assertEquals(normalizeProviderId("42"), "42", "integer string accepted");
  for (const bad of ["0", "-1", "1.5", "42)", "1,2", "a", "", "4".repeat(19), null]) {
    assertEquals(normalizeProviderId(bad), null, `refuses ${bad}`);
  }
});

Deno.test("provider kind defaults to Instantly and refuses unknown names", async () => {
  assertEquals(requireProviderKind(undefined), "instantly", "missing means Instantly");
  assertEquals(requireProviderKind("emailbison"), "emailbison", "Email Bison");
  assertEquals(requireProviderKind("reachinbox"), "reachinbox", "ReachInbox");
  await rejects(() => Promise.resolve(requireProviderKind("smartlead")), "PROVIDER_INVALID", "unknown provider");
});

Deno.test("only Email Bison takes an instance URL", async () => {
  assertEquals(providerBaseUrl("instantly", null), null, "Instantly has no URL");
  await rejects(
    () => Promise.resolve(providerBaseUrl("reachinbox", "https://x.example.com")),
    "PROVIDER_BASE_URL_UNEXPECTED",
    "ReachInbox refuses a URL",
  );
  assertEquals(providerBaseUrl("emailbison", "send.agency.com"), "https://send.agency.com", "scheme added");
});

// --- instance URL guard -----------------------------------------------------

Deno.test("instance URL is reduced to a safe https origin", () => {
  const ok = (value: string) => normalizeProviderOrigin(value, "Email Bison", "EMAILBISON");
  assertEquals(ok("https://Send.Agency.com/"), "https://send.agency.com", "lowercased, slash dropped");
  assertEquals(ok("https://send.agency.com/api"), "https://send.agency.com", "trailing /api tolerated");
  assertEquals(ok("send.agency.com"), "https://send.agency.com", "bare host");
});

Deno.test("instance URL guard refuses internal, IP, credentialed and non-https targets", async () => {
  const refused = [
    "http://send.agency.com",
    "https://127.0.0.1",
    "https://10.0.0.5",
    "https://[::1]",
    "https://localhost",
    "https://db.internal",
    "https://kong.supabase.internal",
    "https://metadata",
    "https://user:pass@send.agency.com",
    "https://send.agency.com:8443",
    "https://send.agency.com/dashboard",
    "https://send.agency.com/?x=1",
    "ftp://send.agency.com",
    "https://2130706433",
    "https://1.2.3.4.5",
  ];
  for (const value of refused) {
    await rejects(
      () => Promise.resolve(normalizeProviderOrigin(value, "Email Bison", "EMAILBISON")),
      "EMAILBISON_URL_INVALID",
      `refuses ${value}`,
    );
  }
});

Deno.test("instance URL guard honours an allow-list of domains", async () => {
  assertEquals(
    normalizeProviderOrigin("https://send.agency.com", "Email Bison", "EMAILBISON", ["agency.com"]),
    "https://send.agency.com",
    "subdomain of an allowed suffix",
  );
  await rejects(
    () => Promise.resolve(normalizeProviderOrigin("https://evil.com", "Email Bison", "EMAILBISON", ["agency.com"])),
    "EMAILBISON_URL_INVALID",
    "outside the allow-list",
  );
  await rejects(
    () => Promise.resolve(normalizeProviderOrigin("https://notagency.com", "Email Bison", "EMAILBISON", ["agency.com"])),
    "EMAILBISON_URL_INVALID",
    "suffix match is on a label boundary",
  );
});

// --- shared HTTP ------------------------------------------------------------

Deno.test("provider requests never follow redirects and map statuses to coded errors", async () => {
  const target = { origin: "https://send.agency.com", prefix: "/api", apiKey: "k".repeat(30), label: "Email Bison", codePrefix: "EMAILBISON" };
  await withFetch(() => ({ status: 302 }), async (calls) => {
    await rejects(() => providerRequest(target, "/users"), "EMAILBISON_REDIRECT_REFUSED", "302 refused");
    assertEquals(calls[0].redirect, "manual", "redirect: manual");
    assertEquals(calls[0].auth, `Bearer ${"k".repeat(30)}`, "bearer token");
  });
  for (const [status, code] of [[401, "EMAILBISON_KEY_REJECTED"], [404, "EMAILBISON_RESOURCE_NOT_FOUND"], [422, "EMAILBISON_REQUEST_REJECTED"], [429, "EMAILBISON_RATE_LIMITED"], [500, "EMAILBISON_REQUEST_FAILED"]] as const) {
    await withFetch(() => ({ status, body: { message: "nope" } }), async () => {
      await rejects(() => providerRequest(target, "/users"), code, `status ${status}`);
    });
  }
  await rejects(() => providerRequest(target, "/../admin"), "EMAILBISON_PATH_INVALID", "dot segments refused");
});

Deno.test("a provider-written 422 reason is surfaced, briefly", async () => {
  const target = { origin: "https://send.agency.com", prefix: "/api", apiKey: "k".repeat(30), label: "Email Bison", codePrefix: "EMAILBISON" };
  await withFetch(() => ({ status: 422, body: { errors: { timezone: ["The timezone is invalid."] } } }), async () => {
    try {
      await providerRequest(target, "/x");
    } catch (error) {
      assert(error instanceof OutreachProviderError, "coded");
      assert(error.message.includes("The timezone is invalid."), "reason included");
      return;
    }
    throw new Error("did not reject");
  });
});

Deno.test("every provider error normalizes through safeInstantlyError", () => {
  assertEquals(
    safeInstantlyError(new OutreachProviderError(429, "REACHINBOX_RATE_LIMITED", "slow down")),
    { code: "REACHINBOX_RATE_LIMITED", message: "slow down", status: 429 },
    "non-Instantly provider errors keep their code",
  );
  assert(new InstantlyApiError(404, "X", "y") instanceof OutreachProviderError, "Instantly errors share the base");
});

// --- Instantly adapter keeps its exact shapes --------------------------------

Deno.test("Instantly configuration is unchanged by the move into the adapter", () => {
  const config = provisionedCampaignConfiguration({
    name: "Acme · GOAP-x",
    timezone: "America/Detroit",
    dailyLimit: 20,
    senderAccounts: ["a@x.com"],
  });
  assertEquals(config.daily_limit, 60, "every email: three per host");
  assertEquals(config.daily_max_leads, 20, "new hosts per day");
  assertEquals(config.stop_on_reply, true, "stops on reply");
  const schedule = (config.campaign_schedule as { schedules: Array<{ days: Record<string, boolean> }> }).schedules[0];
  assertEquals(schedule.days, { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false }, "Monday to Friday, 0 = Sunday");
  assert(sequenceRendersOurPitch(config.sequences), "our own sequence renders our pitch");
  const parsed = instantlyProviderCampaign({ ...config, id: "abcdef12-3456-7890-abcd-ef1234567890", status: 0 });
  assertEquals(parsed.dailyLimit, 20, "reads back hosts per day");
  assert(parsed.rendersOurPitch, "parsed campaign renders our pitch");
});

// --- Email Bison --------------------------------------------------------------

Deno.test("Bison statuses translate into the app's Instantly codes", () => {
  assertEquals(["Draft", "Active", "Launching", "Queued", "Paused", "Completed", "Archived", "Stopped", "weird"].map(bisonCampaignStatus), [0, 1, 1, 1, 2, 3, -99, -1, -1], "campaigns");
  assertEquals(bisonLeadStatus("bounced", "in_sequence"), -1, "a bounced contact outranks the sequence");
  assertEquals(bisonLeadStatus("unsubscribed", null), -2, "unsubscribed");
  assertEquals(bisonLeadStatus("verified", "never_contacted"), 1, "waiting to send is active");
  assertEquals(bisonLeadStatus("verified", "stopped"), 3, "stopped is done");
  assertEquals(bisonLeadStatus("verified", undefined), null, "unknown placement is unknown");
});

Deno.test("Bison pitch variables are scoped to one campaign", () => {
  const variables = bisonCustomVariables("42", {
    pitchSubject: "s", pitchBody: "b", followUpOneSubject: "s1", followUpOneBody: "b1",
    followUpTwoSubject: "s2", followUpTwoBody: "b2", clientName: "C", podcastName: "P", targetId: "t",
  });
  assert(variables.every((variable) => variable.name.startsWith("goap_c42_")), "every name carries the campaign");
  assertEquals(variables.find((variable) => variable.name === "goap_c42_pitch_body")?.value, "b", "pitch body");
  assert(bisonStepsRenderOurPitch("42", [{ order: 1, email_body: "{GOAP_C42_PITCH_BODY}" }]), "own placeholder renders");
  assert(!bisonStepsRenderOurPitch("42", [{ order: 1, email_body: "{GOAP_C41_PITCH_BODY}" }]), "another campaign's placeholder does not");
  assert(!bisonStepsRenderOurPitch("42", [{ order: 1, email_body: "Hi {FIRST_NAME}" }]), "hand-written copy does not");
  assert(!bisonStepsRenderOurPitch("42", []), "no sequence is not sendable");
});

Deno.test("Bison timezones keep the same clock", () => {
  const available = ["America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London"];
  assertEquals(resolveBisonTimezone("America/Detroit", available), "America/New_York", "Detroit → New York");
  assertEquals(resolveBisonTimezone("America/Dawson", available), "America/Los_Angeles", "Dawson → Los Angeles");
  assertEquals(resolveBisonTimezone("Europe/Isle_of_Man", available), "Europe/London", "Isle of Man → London");
  assertEquals(resolveBisonTimezone("America/Chicago", available), "America/Chicago", "listed zone unchanged");
  assertEquals(resolveBisonTimezone("Asia/Tokyo", available), "Asia/Tokyo", "no match is passed through for Bison to judge");
});

Deno.test("Bison connection reads the team as the provider workspace", async () => {
  await withFetch((call) => {
    if (call.url.pathname === "/api/users") return { body: { data: { team: { id: 7, name: "Agency Team" } } } };
    if (call.url.pathname === "/api/sender-emails") {
      return {
        body: {
          data: [{ id: 3, email: "Pat@Agency.com", name: "Pat Lee", status: "Connected", daily_limit: 30, warmup_enabled: true, email_signature: "<p>Pat</p>", tags: [] }],
          meta: { last_page: 1 },
        },
      };
    }
    if (call.url.pathname === "/api/warmup/sender-emails") return { body: { data: [{ email: "pat@agency.com", warmup_score: 88 }], meta: { last_page: 1 } } };
    if (call.url.pathname === "/api/campaigns") return { body: { data: [], meta: { last_page: 1 } } };
    return { status: 404 };
  }, async (calls) => {
    const provider = new EmailBisonProvider("https://send.agency.com", "k".repeat(30));
    const { workspace, accounts } = await provider.verifyConnection();
    assertEquals(workspace, { id: "7", name: "Agency Team" }, "team id and name");
    assertEquals(accounts.map((account) => [account.email, account.status, account.has_signature, account.stat_warmup_score]), [["pat@agency.com", 1, true, 88]], "account mapped");
    assert(calls.every((call) => call.url.origin === "https://send.agency.com"), "only the instance is called");
  });
});

Deno.test("Bison refuses a single-mailbox pause rather than pretending", async () => {
  const provider = new EmailBisonProvider("https://send.agency.com", "k".repeat(30));
  await rejects(() => provider.setAccountPaused(), "PROVIDER_FEATURE_UNSUPPORTED", "unsupported");
  assert(!provider.capabilities.mailboxPause, "capability says so too");
});

const PITCH = {
  pitchSubject: "s", pitchBody: "b", followUpOneSubject: "s1", followUpOneBody: "b1",
  followUpTwoSubject: "s2", followUpTwoBody: "b2", clientName: "C", podcastName: "P", targetId: "t",
};

function bisonStagingRoute(existingContact: boolean) {
  return (call: Call) => {
    const path = call.url.pathname;
    if (path === "/api/custom-variables" && call.method === "GET") return { body: { data: [], meta: { last_page: 1 } } };
    if (path === "/api/custom-variables") return { body: { data: { id: 1 } } };
    if (path === "/api/campaigns/42/leads") return { body: { data: [], meta: { last_page: 1 } } };
    if (decodeURIComponent(path) === "/api/leads/host@show.com") {
      return existingContact
        ? { body: { data: { id: 900, email: "host@show.com", first_name: "Sam", overall_stats: { unique_replies: 4 } } } }
        : { status: 404 };
    }
    if (path === "/api/leads/900" && call.method === "PATCH") {
      return { body: { data: { id: 900, email: "host@show.com", overall_stats: { unique_replies: 4 } } } };
    }
    if (path === "/api/leads" && call.method === "POST") return { body: { data: { id: 901, email: "host@show.com" } } };
    if (path === "/api/campaigns/42/leads/attach-leads") return { body: { data: { success: true } } };
    return { status: 404 };
  };
}

Deno.test("Bison staging patches only this campaign's variables onto an existing contact, never its name", async () => {
  await withFetch(bisonStagingRoute(true), async (calls) => {
    const provider = new EmailBisonProvider("https://send.agency.com", "k".repeat(30));
    const lead = await provider.addLead("42", { email: "host@show.com", company: "The Show", variables: PITCH }, { skipIfInCampaign: true });
    assertEquals(lead?.id, "900", "the existing contact");
    // Replies to another client's campaign must not read as replies here.
    assertEquals(lead?.email_reply_count, 0, "workspace-wide stats are not this campaign's");
    const patch = calls.find((call) => call.url.pathname === "/api/leads/900" && call.method === "PATCH");
    const body = patch?.body as Record<string, unknown> & { custom_variables: Array<{ name: string }> };
    assert(!("first_name" in body), "an existing contact's name is never overwritten");
    assert(body.custom_variables.every((variable) => variable.name.startsWith("goap_c42_")), "only this campaign's names");
    assert(!calls.some((call) => call.url.pathname === "/api/leads" && call.method === "POST"), "no duplicate contact");
    const attach = calls.find((call) => call.url.pathname === "/api/campaigns/42/leads/attach-leads");
    assertEquals((attach?.body as { lead_ids: number[] }).lead_ids, [900], "attached to the campaign");
  });
});

Deno.test("Bison staging creates a new contact with the best known name", async () => {
  await withFetch(bisonStagingRoute(false), async (calls) => {
    const provider = new EmailBisonProvider("https://send.agency.com", "k".repeat(30));
    const lead = await provider.addLead("42", { email: "host@show.com", firstName: "Sam", variables: PITCH }, { skipIfInCampaign: true });
    assertEquals(lead?.id, "901", "new contact");
    const create = calls.find((call) => call.url.pathname === "/api/leads" && call.method === "POST");
    assertEquals((create?.body as { first_name: string }).first_name, "Sam", "first name sent on create");
  });
});

Deno.test("Bison confirms a 422 block really means already listed", async () => {
  await withFetch((call) => {
    if (call.method === "POST") return { status: 422, body: { message: "The email has already been taken." } };
    return { body: { data: [] } };
  }, async () => {
    const provider = new EmailBisonProvider("https://send.agency.com", "k".repeat(30));
    await rejects(() => provider.blockAddress("host@show.com"), "EMAILBISON_REQUEST_REJECTED", "not listed after a 422 is a failure");
  });
});

Deno.test("Bison unblock matches the exact address only", async () => {
  await withFetch((call) => {
    if (call.method === "GET") {
      if (decodeURIComponent(call.url.pathname) === "/api/blacklisted-emails/host@show.com") {
        return { body: { data: { id: 6, email: "host@show.com" } } };
      }
      return { status: 404, body: { message: "Not found" } };
    }
    return { body: { data: { success: true } } };
  }, async (calls) => {
    const provider = new EmailBisonProvider("https://send.agency.com", "k".repeat(30));
    assert(await provider.unblockAddress("Host@Show.com"), "removed");
    assertEquals(calls.at(-1)?.url.pathname, "/api/blacklisted-emails/6", "the exact entry, not the superstring");
  });
});

// --- ReachInbox -------------------------------------------------------------

Deno.test("ReachInbox statuses translate into the app's Instantly codes", () => {
  assertEquals(reachInboxCampaignStatus({ isActive: true }), 1, "active");
  assertEquals(reachInboxCampaignStatus({ status: "Paused" }), 2, "paused");
  assertEquals(reachInboxCampaignStatus({ completed: true }), 3, "completed");
  assertEquals(reachInboxCampaignStatus({ isArchived: true, isActive: true }), -99, "archived outranks active");
  assertEquals(reachInboxCampaignStatus({ isActive: false, hasStarted: false }), 0, "never started is a draft");
  assertEquals(reachInboxLeadStatus({ status: "IN_PROGRESS" }), 1, "in progress");
  assertEquals(reachInboxLeadStatus({ status: "COMPLETED" }), 3, "completed");
  assertEquals(reachInboxLeadStatus({ status: "BOUNCED" }), -1, "bounced");
  assertEquals(reachInboxLeadStatus({ status: "IN_PROGRESS", isPaused: true }), 2, "paused");
});

Deno.test("ReachInbox identity is a stable fingerprint, never the key", async () => {
  const key = "reachinbox-secret-key-0123456789";
  const first = await reachInboxKeyFingerprint(key);
  assertEquals(first, await reachInboxKeyFingerprint(key), "stable");
  assert(!first.includes(key) && first.startsWith("key-") && first.length === 36, "does not reveal the key");
});

Deno.test("ReachInbox treats only app-built campaigns as sendable", async () => {
  await withFetch((call) => {
    if (call.url.pathname === "/api/v1/campaigns/all") {
      return { body: { data: [{ id: 8, name: "Acme · GOAP-abc", isActive: false }, { id: 9, name: "Hand built", isActive: true }] } };
    }
    return { body: { data: { accounts: [] } } };
  }, async () => {
    const provider = new ReachInboxProvider("k".repeat(30));
    const { campaigns, complete } = await provider.listCampaigns();
    assert(complete, "short page means complete");
    assertEquals(campaigns.map((campaign) => [campaign.id, campaign.rendersOurPitch]), [["8", true], ["9", false]], "provenance decides");
  });
});

Deno.test("ReachInbox never sends an empty lead list to delete", async () => {
  await withFetch(() => ({ body: { status: 200 } }), async (calls) => {
    const provider = new ReachInboxProvider("k".repeat(30));
    await rejects(() => provider.removeLead("8", "not-a-number"), "REACHINBOX_LEAD_INVALID", "invalid id refused");
    assertEquals(calls.length, 0, "no request was made: an empty list would delete every lead");
    await provider.removeLead("8", "77");
    assertEquals((calls[0].body as { leadIds: number[] }).leadIds, [77], "exactly one lead");
  });
});

Deno.test("ReachInbox reports a campaign missing from a complete listing as gone", async () => {
  await withFetch(() => ({ body: { data: [] } }), async () => {
    const provider = new ReachInboxProvider("k".repeat(30));
    await rejects(() => provider.getCampaign("8"), "REACHINBOX_RESOURCE_NOT_FOUND", "404-equivalent");
  });
});

Deno.test("private-address check covers IPv4 special ranges and IPv6 forms that reach them", () => {
  for (const address of [
    "10.1.2.3", "127.0.0.1", "169.254.169.254", "172.20.0.1", "192.168.1.1", "100.64.0.1",
    "198.18.0.1", "192.0.0.8", "0.0.0.0", "224.0.0.1",
    "::1", "::", "fd00::1", "fe80::1", "febf::1", "fec0::1", "ff02::1",
    "::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "::a9fe:a9fe", "64:ff9b::a9fe:a9fe", "2002:a9fe:a9fe::1",
    "not-an-address",
  ]) {
    assert(isPrivateAddress(address), `${address} must count as private`);
  }
  for (const address of ["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8", "64:ff9b::808:808"]) {
    assert(!isPrivateAddress(address), `${address} is public`);
  }
});

Deno.test("Bison refuses to remove a lead with an id it cannot send exactly", async () => {
  await withFetch(() => ({ body: { success: true } }), async (calls) => {
    const provider = new EmailBisonProvider("https://send.agency.com", "k".repeat(30));
    await rejects(() => provider.removeLead("42", "abc"), "EMAILBISON_LEAD_INVALID", "non-numeric id");
    await rejects(() => provider.removeLead("42", "99999999999999999"), "EMAILBISON_LEAD_INVALID", "past 2^53");
    assertEquals(calls.length, 0, "nothing was sent");
  });
});
