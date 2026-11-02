/**
 * Email Bison adapter behaviour checked against the documented API
 * (https://dedi.emailbison.com/api/reference.openapi and docs.emailbison.com).
 */
import { bisonSequenceSteps, bisonVariableNames, campaignLinkFor, EmailBisonProvider } from "./emailBison.ts";
import { type CampaignSpec, OutreachProviderError } from "./outreachProvider.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`,
  );
}

interface Call {
  method: string;
  url: URL;
  body: unknown;
}

async function withFetch(
  route: (call: Call) => { status?: number; body?: unknown },
  run: (calls: Call[]) => Promise<void>,
) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = ((input: URL | RequestInfo, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? "GET",
      url: new URL(String(input)),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    };
    calls.push(call);
    const answer = route(call);
    return Promise.resolve(
      new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
        status: answer.status ?? 200,
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

const ORIGIN = "https://send.agency.com";
const KEY = "k".repeat(30);
const SPEC: CampaignSpec = {
  name: "GOAP-abc Client",
  timezone: "America/New_York",
  dailyLimit: 20,
  senderAccounts: [],
  followUpOneDelayDays: 4,
  followUpTwoDelayDays: 9,
};

/** Private writers are reached directly so each test isolates one request plan. */
type Internals = { writeSequence(id: string, spec: CampaignSpec): Promise<void> };
const internals = (provider: EmailBisonProvider) => provider as unknown as Internals;

/** Every variable the campaign reads, already present, so writes skip creation. */
function variablesPage(campaignId: string) {
  return {
    data: Object.values(bisonVariableNames(campaignId)).map((name, index) => ({ id: index + 1, name })),
    meta: { last_page: 1 },
  };
}

function page(data: unknown[], current: number, last: number) {
  return { data, meta: { current_page: current, last_page: last }, links: { next: current < last ? "next" : null } };
}

Deno.test("each Bison step waits the gap before the NEXT step, as the docs define wait_in_days", () => {
  const steps = bisonSequenceSteps("42", SPEC);
  assertEquals(steps.map((step) => step.wait_in_days), [4, 9, 1], "gap after opening, after follow-up one, final unused");
  assertEquals(steps.map((step) => step.thread_reply), [false, true, true], "follow-ups reply in thread");
  assert(steps.every((step) => step.email_subject.length > 0), "email_subject is required on every step");
  const defaults = bisonSequenceSteps("42", { ...SPEC, followUpOneDelayDays: undefined, followUpTwoDelayDays: undefined });
  assertEquals(defaults.map((step) => step.wait_in_days), [6, 7, 1], "default delays");
});

Deno.test("Bison sequence update sends an id on every step, skips variants, and deletes leftovers", async () => {
  await withFetch((call) => {
    const path = call.url.pathname;
    if (path === "/api/custom-variables") return { body: variablesPage("42") };
    if (call.method === "GET" && path === "/api/campaigns/v1.1/42/sequence-steps") {
      return {
        body: {
          data: {
            sequence_id: 293,
            sequence_steps: [
              { id: 11, order: "1", variant: false },
              { id: 12, order: "1", variant: true, variant_from_step_id: 11 },
              { id: 13, order: "2", variant: false },
              { id: 14, order: "3", variant: false },
              { id: 15, order: "4", variant: false },
            ],
          },
        },
      };
    }
    return { body: { data: { success: true } } };
  }, async (calls) => {
    await internals(new EmailBisonProvider(ORIGIN, KEY)).writeSequence("42", SPEC);
    const put = calls.find((call) => call.method === "PUT");
    assertEquals(put?.url.pathname, "/api/campaigns/v1.1/sequence-steps/293", "updates the existing sequence");
    const body = put?.body as { title: string; sequence_steps: Array<{ id: number; order: number }> };
    assertEquals(body.sequence_steps.map((step) => [step.order, step.id]), [[1, 11], [2, 13], [3, 14]], "primary ids only");
    assert(body.title, "title is required");
    const deleted = calls.filter((call) => call.method === "DELETE").map((call) => call.url.pathname);
    assertEquals(deleted, ["/api/campaigns/sequence-steps/12", "/api/campaigns/sequence-steps/15"], "variant and extra step removed");
    assert(!calls.some((call) => call.method === "POST"), "no second sequence");
  });
});

Deno.test("Bison sequence short of steps appends the missing ones, then rewrites all in place", async () => {
  // Measured live: Bison refuses to delete a sequence's last step (400) and a
  // POST onto an existing sequence appends. Clearing and re-posting either
  // failed or left the old follow-up as the opening email.
  let appended = false;
  await withFetch((call) => {
    const path = call.url.pathname;
    if (path === "/api/custom-variables") return { body: variablesPage("42") };
    if (call.method === "GET" && path === "/api/campaigns/v1.1/42/sequence-steps") {
      const steps = [{ id: 11, order: "1", variant: false }];
      if (appended) steps.push({ id: 21, order: "2", variant: false }, { id: 22, order: "3", variant: false });
      return { body: { data: { sequence_id: 293, sequence_steps: steps } } };
    }
    if (call.method === "DELETE") return { status: 400, body: { message: "cannot delete the last step" } };
    if (call.method === "POST") appended = true;
    return { body: { data: { success: true } } };
  }, async (calls) => {
    await internals(new EmailBisonProvider(ORIGIN, KEY)).writeSequence("42", SPEC);
    const writes = calls.filter((call) => call.method !== "GET").map((call) => `${call.method} ${call.url.pathname}`);
    assertEquals(writes, [
      "POST /api/campaigns/v1.1/42/sequence-steps",
      "PUT /api/campaigns/v1.1/sequence-steps/293",
    ], "append, then update in place; nothing deleted");
    const post = calls.find((call) => call.method === "POST")?.body as { sequence_steps: unknown[] };
    assertEquals(post.sequence_steps.length, 2, "only the missing steps appended");
    const put = calls.find((call) => call.method === "PUT")?.body as { sequence_steps: Array<{ id: number; order: number; email_body: string }> };
    assertEquals(put.sequence_steps.map((step) => [step.order, step.id]), [[1, 11], [2, 21], [3, 22]], "every step named by id");
    assert(put.sequence_steps[0].email_body.includes("PITCH_BODY"), "the surviving step is rewritten as the opening pitch");
  });
});

Deno.test("Bison campaign with no sequence gets one written fresh", async () => {
  await withFetch((call) => {
    const path = call.url.pathname;
    if (path === "/api/custom-variables") return { body: variablesPage("42") };
    if (call.method === "GET") return { status: 404, body: { message: "Not found" } };
    return { body: { data: { success: true } } };
  }, async (calls) => {
    await internals(new EmailBisonProvider(ORIGIN, KEY)).writeSequence("42", SPEC);
    const writes = calls.filter((call) => call.method !== "GET").map((call) => `${call.method} ${call.url.pathname}`);
    assertEquals(writes, ["POST /api/campaigns/v1.1/42/sequence-steps"], "one create");
    assertEquals((calls.find((call) => call.method === "POST")?.body as { sequence_steps: unknown[] }).sequence_steps.length, 3, "three steps");
  });
});

Deno.test("Bison pitch edit keeps the lead's campaign status (the PATCH answer has none)", async () => {
  await withFetch((call) => {
    if (call.url.pathname === "/api/custom-variables") return { body: variablesPage("42") };
    // Live shape: the contact, no lead_campaign_data.
    return { body: { data: { id: 7, email: "host@pod.com", status: "verified", updated_at: "2026-11-02T00:00:00Z" } } };
  }, async () => {
    const before = {
      id: "7", email: "host@pod.com", status: 1, email_open_count: 2, email_reply_count: 0,
    } as unknown as Parameters<EmailBisonProvider["updateLeadVariables"]>[0];
    const after = await new EmailBisonProvider(ORIGIN, KEY).updateLeadVariables(before, "42", {
      pitchSubject: "s", pitchBody: "b",
    } as Parameters<EmailBisonProvider["updateLeadVariables"]>[2]);
    assertEquals([after?.status, after?.email_open_count], [1, 2], "campaign figures carried over, never nulled");
  });
});

Deno.test("Bison remove of a contact no longer in the campaign reads as already gone (404)", async () => {
  const run = async (linked: boolean) => {
    let code = "";
    await withFetch((call) => {
      if (call.method === "DELETE") return { status: 422, body: { message: "The selected lead ids is invalid." } };
      return {
        body: {
          data: {
            id: 7, email: "host@pod.com",
            lead_campaign_data: linked ? [{ campaign_id: 42, status: "in_sequence" }] : [{ campaign_id: 99, status: "in_sequence" }],
          },
        },
      };
    }, async () => {
      try {
        await new EmailBisonProvider(ORIGIN, KEY).removeLead("42", "7");
      } catch (error) {
        code = error instanceof OutreachProviderError ? `${error.status}` : String(error);
      }
    });
    return code;
  };
  assertEquals(await run(false), "404", "not in this campaign: the caller clears its record");
  assertEquals(await run(true), "422", "still in the campaign: the refusal stands");
});

Deno.test("Bison addLead lowercases the address before the case-sensitive contact lookup", async () => {
  await withFetch((call) => {
    const path = call.url.pathname;
    if (path === "/api/custom-variables") return { body: variablesPage("42") };
    if (path === "/api/leads/host%40pod.com" || path === "/api/leads/host@pod.com") return { body: { data: { id: 7, email: "host@pod.com" } } };
    if (path.startsWith("/api/leads/") && call.method === "GET") return { status: 404, body: { message: "Not found" } };
    if (path === "/api/leads/7") return { body: { data: { id: 7, email: "host@pod.com" } } };
    return { body: { data: { success: true } } };
  }, async (calls) => {
    const lead = await new EmailBisonProvider(ORIGIN, KEY).addLead("42", {
      email: " Host@Pod.COM ", firstName: "H", variables: {} as never,
    } as Parameters<EmailBisonProvider["addLead"]>[1], { skipIfInCampaign: false });
    assertEquals(lead?.id, "7", "existing contact found");
    assert(!calls.some((call) => call.method === "POST" && call.url.pathname === "/api/leads"), "no second contact created");
  });
});

Deno.test("Bison sequence write never posts a duplicate when the read fails transiently", async () => {
  await withFetch((call) => {
    if (call.url.pathname === "/api/custom-variables") return { body: variablesPage("42") };
    if (call.method === "GET") return { status: 429, body: { message: "slow down" } };
    return { body: {} };
  }, async (calls) => {
    let code = "";
    try {
      await internals(new EmailBisonProvider(ORIGIN, KEY)).writeSequence("42", SPEC);
    } catch (error) {
      code = error instanceof OutreachProviderError ? error.code : String(error);
    }
    assertEquals(code, "EMAILBISON_RATE_LIMITED", "rate limit surfaces");
    assert(!calls.some((call) => call.method !== "GET"), "nothing written");
  });
});

Deno.test("Bison variable listing stops once this campaign's names are found and creates only the missing", async () => {
  const names = Object.values(bisonVariableNames("42"));
  await withFetch((call) => {
    if (call.url.pathname === "/api/custom-variables" && call.method === "GET") {
      const current = Number(call.url.searchParams.get("page"));
      // 50 pages exist; this campaign's names (all but the last) sit on page 2.
      const rows = current === 2 ? names.slice(0, -1).map((name, index) => ({ id: 100 + index, name })) : [
        { id: current, name: `other_${current}` },
      ];
      return { body: page(rows, current, 50) };
    }
    if (call.method === "POST") return { body: { data: { id: 999, name: (call.body as { name: string }).name } } };
    // Sequence read answers "none yet".
    return { status: 404, body: { message: "Not found" } };
  }, async (calls) => {
    await internals(new EmailBisonProvider(ORIGIN, KEY)).writeSequence("42", SPEC);
    const listed = calls.filter((call) => call.url.pathname === "/api/custom-variables" && call.method === "GET");
    assertEquals(listed.length, 50, "a missing name means the whole list is read");
    const created = calls.filter((call) => call.url.pathname === "/api/custom-variables" && call.method === "POST");
    assertEquals(created.map((call) => (call.body as { name: string }).name), [names.at(-1)], "only the missing name created");
  });

  await withFetch((call) => {
    if (call.url.pathname === "/api/custom-variables") {
      const current = Number(call.url.searchParams.get("page"));
      const rows = current === 2 ? names.map((name, index) => ({ id: 100 + index, name })) : [{ id: current, name: "x" }];
      return { body: page(rows, current, 50) };
    }
    if (call.method === "POST") return { body: { data: { success: true } } };
    return { status: 404, body: { message: "Not found" } };
  }, async (calls) => {
    await internals(new EmailBisonProvider(ORIGIN, KEY)).writeSequence("42", SPEC);
    const listed = calls.filter((call) => call.url.pathname === "/api/custom-variables");
    assertEquals(listed.length, 2, "stops at the page that completes the set");
  });
});

Deno.test("Bison paging reads past 20 pages of the documented 15 rows", async () => {
  await withFetch((call) => {
    const current = Number(call.url.searchParams.get("page"));
    const rows = Array.from({ length: 15 }, (_, index) => ({
      id: current * 100 + index,
      name: `Campaign ${current}-${index}`,
      status: "Active",
    }));
    return { body: page(rows, current, 30) };
  }, async () => {
    const { campaigns, complete } = await new EmailBisonProvider(ORIGIN, KEY).listCampaigns();
    assertEquals(campaigns.length, 450, "every row of 30 pages");
    assert(complete, "listing complete");
  });
});

Deno.test("Bison bulk analytics reads a few campaigns directly and treats 404 as absent", async () => {
  await withFetch((call) => {
    if (call.url.pathname === "/api/campaigns/7") {
      return { body: { data: { id: 7, name: "A", status: "Paused", emails_sent: 12, unique_replies: 2 } } };
    }
    if (call.url.pathname === "/api/campaigns/8") return { status: 404, body: { message: "Not found" } };
    return { status: 500, body: {} };
  }, async (calls) => {
    const result = await new EmailBisonProvider(ORIGIN, KEY).bulkCampaignAnalytics(["7", "8"]);
    assertEquals([...result.keys()], ["7"], "deleted campaign absent");
    assertEquals(result.get("7")?.status, 2, "paused");
    assertEquals(result.get("7")?.analytics.emails_sent_count, 12, "sent");
    assert(!calls.some((call) => call.url.pathname === "/api/campaigns"), "no listing");
  });
});

Deno.test("Bison bulk analytics for many campaigns stops paging once every id is seen", async () => {
  const ids = Array.from({ length: 20 }, (_, index) => String(index + 1));
  await withFetch((call) => {
    const current = Number(call.url.searchParams.get("page"));
    // ids 1..20 fill pages 1 and 2 (15 + 5); 40 pages exist.
    const rows = Array.from({ length: 15 }, (_, index) => {
      const id = (current - 1) * 15 + index + 1;
      return { id, name: `C${id}`, status: "Active", emails_sent: id };
    });
    return { body: page(rows, current, 40) };
  }, async (calls) => {
    const result = await new EmailBisonProvider(ORIGIN, KEY).bulkCampaignAnalytics(ids);
    assertEquals(result.size, 20, "every id found");
    assertEquals(calls.length, 2, "stopped after page 2");
  });
});

Deno.test("Bison blocklist lookup is exact, by address, and 404 means not listed", async () => {
  await withFetch((call) => {
    if (call.method === "GET" && call.url.pathname === "/api/blacklisted-emails/host%40show.com") {
      return { body: { data: { id: 6, email: "host@show.com" } } };
    }
    return { body: { data: { success: true } } };
  }, async (calls) => {
    assert(await new EmailBisonProvider(ORIGIN, KEY).unblockAddress("Host@Show.com"), "removed");
    assertEquals(calls.map((call) => `${call.method} ${call.url.pathname}`), [
      "GET /api/blacklisted-emails/host%40show.com",
      "DELETE /api/blacklisted-emails/6",
    ], "looked up then deleted by id");
  });

  await withFetch(() => ({ status: 404, body: { message: "Not found" } }), async (calls) => {
    assert(!await new EmailBisonProvider(ORIGIN, KEY).unblockAddress("host@show.com"), "nothing to remove");
    assert(!calls.some((call) => call.method === "DELETE"), "no delete");
  });

  await withFetch((call) => {
    if (call.method === "POST") return { status: 422, body: { message: "The email has already been taken." } };
    return { body: { data: { id: 6, email: "host@show.com" } } };
  }, async () => {
    // A 422 confirmed by the exact lookup is the state that was asked for.
    await new EmailBisonProvider(ORIGIN, KEY).blockAddress("host@show.com");
  });
});

Deno.test("a failed sender read fails the campaign read instead of reading as no senders", async () => {
  await withFetch((call) => {
    if (call.url.pathname.endsWith("/sender-emails")) return { status: 500, body: {} };
    if (call.url.pathname === "/api/campaigns/42") return { body: { data: { id: 42, name: "C", status: "active" } } };
    return { status: 404, body: {} };
  }, async () => {
    let code = "";
    try {
      await new EmailBisonProvider(ORIGIN, KEY).getCampaign("42");
    } catch (error) {
      code = error instanceof OutreachProviderError ? error.code : "UNEXPECTED";
    }
    assertEquals(code, "EMAILBISON_REQUEST_FAILED", "a 500 is not an empty sender list");
  });
});

Deno.test("lead figures come only from this campaign's entry, list or object", () => {
  const list = { lead_campaign_data: [{ campaign_id: 7, replies: 3 }, { campaign_id: 42, replies: 1 }] };
  assertEquals(campaignLinkFor(list, "42")?.replies, 1, "matched entry in a list");
  assertEquals(campaignLinkFor(list, "9"), null, "no entry for another campaign");
  assertEquals(campaignLinkFor({ lead_campaign_data: { campaign_id: 7, replies: 3 } }, "42"), null, "another campaign's object");
  assertEquals(campaignLinkFor({ lead_campaign_data: { replies: 2 } }, "42")?.replies, 2, "scoped object without an id");
  assertEquals(campaignLinkFor({}, "42"), null, "absent");
});

Deno.test("a settings save on a hand-built Bison campaign writes only our limits", async () => {
  await withFetch(() => ({ body: { data: {} } }), async (calls) => {
    const provider = new EmailBisonProvider(ORIGIN, KEY);
    const stub = provider as unknown as {
      getCampaign(id: string): Promise<unknown>;
      writeSenders(...args: unknown[]): Promise<void>;
    };
    stub.getCampaign = () => Promise.resolve({ id: "42", rendersOurPitch: false, schedule: { timezone: "Europe/London" }, senderAccounts: [] });
    stub.writeSenders = () => Promise.resolve();
    await provider.updateCampaign("42", SPEC, { includeSequence: false });
    const update = calls.find((call) => call.url.pathname === "/api/campaigns/42/update");
    assertEquals(Object.keys(update?.body as object).sort(), ["max_emails_per_day", "max_new_leads_per_day"], "no rename, no delivery settings");
    assert(!calls.some((call) => call.url.pathname.includes("/schedule")), "schedule left alone");
  });
});

Deno.test("Bison campaign search matches part of a name from the listing, not Bison's whole-name search", async () => {
  await withFetch((call) => {
    const path = call.url.pathname;
    if (path === "/api/campaigns" && call.method === "GET") {
      // Bison's own search would return nothing for a prefix; the adapter must not rely on it.
      if (call.url.searchParams.get("search")) return { body: page([], 1, 1) };
      return {
        body: page([
          { id: 1, name: "Other client", status: "active" },
          { id: 2, name: "GOAP-abc Client", status: "draft" },
        ], 1, 1),
      };
    }
    if (path === "/api/campaigns/2") return { body: { data: { id: 2, name: "GOAP-abc Client", status: "draft" } } };
    if (path.startsWith("/api/campaigns/2/")) return { status: 404, body: { message: "Not found" } };
    if (path === "/api/campaigns/v1.1/2/sequence-steps") return { status: 404, body: { message: "Not found" } };
    return { status: 404, body: { message: "Not found" } };
  }, async (calls) => {
    const found = await new EmailBisonProvider(ORIGIN, KEY).searchCampaigns("GOAP-abc", 10);
    assertEquals(found.map((campaign) => campaign.id), ["2"], "prefix found");
    assert(!calls.some((call) => call.url.searchParams.get("search")), "never uses Bison's whole-name search");
  });
});

Deno.test("a Bison refusal carries Bison's own reason, which it nests under data", async () => {
  await withFetch((call) => {
    if (call.method === "POST") {
      // Live shape, captured from a real instance.
      return {
        status: 422,
        body: { data: { success: false, message: "The email field must be a valid email address.", errors: { email: ["The email field must be a valid email address."] } } },
      };
    }
    return { status: 404, body: { data: { success: false, message: "Not found" } } };
  }, async () => {
    let message = "";
    try {
      await new EmailBisonProvider(ORIGIN, KEY).blockAddress("not-an-email");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    assertEquals(message, "Email Bison refused the request: The email field must be a valid email address.", "reason shown");
  });
});
