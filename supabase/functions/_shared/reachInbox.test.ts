// Deno tests for the ReachInbox adapter, checked against docs.reachinbox.ai.
import { OutreachProviderError } from "./outreachProvider.ts";
import {
  reachInboxCampaignStatus,
  reachInboxKeyFingerprint,
  reachInboxLeadStatus,
  ReachInboxProvider,
  reachInboxWorkspaceId,
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

const KEY = "k".repeat(30);

Deno.test("bounce protection maps to Instantly's -2 and outranks paused/started", () => {
  assertEquals(
    reachInboxCampaignStatus({ pausedByBounceProtection: true, hasStarted: true, status: "Paused" }),
    -2,
    "bounce protection",
  );
  assertEquals(reachInboxCampaignStatus({ isArchived: true, pausedByBounceProtection: true }), -99, "archived first");
  assertEquals(
    reachInboxCampaignStatus({ status: "NOT_SENDING_EMAILS", isActive: false, hasStarted: false }),
    0,
    "a freshly created campaign is a draft",
  );
  assertEquals(reachInboxCampaignStatus({ status: "CURRENTLY_SENDING_EMAILS" }), 1, "sending");
});

Deno.test("identity is the workspaceId from GET /account, not the key", async () => {
  await withFetch((call) => {
    if (call.url.pathname === "/api/v1/account") return { body: { data: { id: 101, workspaceId: "workspace-abc123" } } };
    if (call.url.pathname === "/api/v1/account/all") {
      return {
        body: {
          data: {
            totalCount: 1,
            emailsConnected: [{ email: "A@x.com", workspace: { id: "workspace-abc123", name: "Sales" } }],
          },
        },
      };
    }
    return { body: { data: [] } };
  }, async (calls) => {
    const { workspace, accounts } = await new ReachInboxProvider(KEY).verifyConnection();
    assertEquals(workspace, { id: "workspace-abc123", name: "Sales" }, "workspace identity");
    assertEquals(accounts.map((account) => account.email), ["a@x.com"], "mailboxes");
    assertEquals(calls.filter((call) => call.url.pathname === "/api/v1/account/all").length, 1, "accounts read once");
  });
});

Deno.test("identity falls back to the key fingerprint only when /account is absent", async () => {
  await withFetch((call) => {
    if (call.url.pathname === "/api/v1/account") return { status: 404, body: { message: "nope" } };
    if (call.url.pathname === "/api/v1/account/all") return { body: { data: { totalCount: 0, emailsConnected: [] } } };
    return { body: { data: [] } };
  }, async () => {
    const { workspace } = await new ReachInboxProvider(KEY).verifyConnection();
    assertEquals(workspace.id, await reachInboxKeyFingerprint(KEY), "fingerprint fallback");
  });
  await withFetch(() => ({ status: 401, body: {} }), async () => {
    await rejects(() => new ReachInboxProvider(KEY).verifyConnection(), "REACHINBOX_KEY_REJECTED", "bad key fails");
  });
});

Deno.test("workspace ids are length- and charset-checked", () => {
  assertEquals(reachInboxWorkspaceId("8fa453ab-1c49-49e7-9b01-23a764fd8e2a"), "8fa453ab-1c49-49e7-9b01-23a764fd8e2a", "uuid");
  assertEquals(reachInboxWorkspaceId("a".repeat(101)), null, "too long for the column");
  assertEquals(reachInboxWorkspaceId("x/../y"), null, "odd characters");
  assertEquals(reachInboxWorkspaceId(null), null, "missing");
});

Deno.test("campaign listing keeps paging past a short page and stops on an empty one", async () => {
  await withFetch((call) => {
    const offset = Number(call.url.searchParams.get("offset"));
    // A server that caps pages at 2 rows, below the adapter's page size.
    const all = [1, 2, 3].map((id) => ({ id, name: `C${id}` }));
    return { body: { data: all.slice(offset, offset + 2) } };
  }, async () => {
    const { campaigns, complete } = await new ReachInboxProvider(KEY).listCampaigns();
    assertEquals(campaigns.map((campaign) => campaign.id), ["1", "2", "3"], "nothing truncated");
    assert(complete, "empty page proves the end");
  });
});

Deno.test("an ignored offset ends the walk as truncated, never complete", async () => {
  await withFetch(() => ({ body: { data: [{ id: 5, name: "Only" }] } }), async (calls) => {
    const { campaigns, complete } = await new ReachInboxProvider(KEY).listCampaigns();
    assertEquals(campaigns.map((campaign) => campaign.id), ["5"], "no duplicates");
    assert(!complete, "a repeat page proves nothing about the end");
    assertEquals(calls.length, 2, "one extra request, not twenty");
  });
  await withFetch(() => ({ body: { data: [{ id: 5, name: "Only" }] } }), async () => {
    await rejects(
      () => new ReachInboxProvider(KEY).getCampaign("6"),
      "REACHINBOX_REQUEST_FAILED",
      "missing from a truncated listing is not a deletion",
    );
  });
  let page = 0;
  await withFetch(() => ({ body: { data: page++ === 0 ? [{ id: 5, name: "Only" }] : [] } }), async () => {
    const { complete } = await new ReachInboxProvider(KEY).listCampaigns();
    assert(complete, "an empty page does end the listing");
  });
});

Deno.test("a 429 is retried once, then surfaced", async () => {
  let failures = 1;
  await withFetch(() => (failures-- > 0 ? { status: 429, body: {} } : { body: { status: 200 } }), async (calls) => {
    await new ReachInboxProvider(KEY).blockAddress("a@x.com");
    assertEquals(calls.length, 2, "retried");
  });
  await withFetch(() => ({ status: 429, body: {} }), async (calls) => {
    await rejects(() => new ReachInboxProvider(KEY).blockAddress("a@x.com"), "REACHINBOX_RATE_LIMITED", "second 429");
    assertEquals(calls.length, 2, "only one retry");
  });
});

Deno.test("lead delete never sends an empty or filtered list", async () => {
  await withFetch(() => ({ body: { status: 200 } }), async (calls) => {
    const provider = new ReachInboxProvider(KEY);
    for (const bad of ["", "0", "-1", "1.5", "99999999999999999", "abc"]) {
      await rejects(() => provider.removeLead("8", bad), "REACHINBOX_LEAD_INVALID", `lead id ${JSON.stringify(bad)}`);
    }
    await rejects(() => provider.removeLead("x", "7"), "REACHINBOX_REQUEST_REJECTED", "bad campaign id");
    await rejects(() => provider.removeLead(null, "7"), "REACHINBOX_CAMPAIGN_REQUIRED", "no campaign");
    assertEquals(calls.length, 0, "nothing reached ReachInbox");
    await provider.removeLead("8", "77");
    assertEquals(calls[0].body, { campaignId: 8, leadIds: [77] }, "exactly one lead, no widening filters");
  });
});

Deno.test("campaign writes refuse an id that would serialize as null", async () => {
  await withFetch(() => ({ body: { status: 200 } }), async (calls) => {
    const provider = new ReachInboxProvider(KEY);
    await rejects(() => provider.pauseCampaign("abc"), "REACHINBOX_REQUEST_REJECTED", "pause");
    await rejects(() => provider.activateCampaign("1e3"), "REACHINBOX_REQUEST_REJECTED", "start");
    assertEquals(calls.length, 0, "no request");
  });
});

Deno.test("getLead lets a 404 through, so a deleted lead reads as deleted upstream", async () => {
  await withFetch(() => ({ status: 404, body: {} }), async () => {
    await rejects(() => new ReachInboxProvider(KEY).getLead("5", "8"), "REACHINBOX_RESOURCE_NOT_FOUND", "gone");
  });
});

Deno.test("a settings save never renames or reschedules a hand-built campaign", async () => {
  await withFetch((call) => {
    if (call.url.pathname === "/api/v1/campaigns/all") {
      return { body: { data: call.url.searchParams.get("offset") === "0" ? [{ id: 8, name: "Agency launch", timezone: "Europe/London" }] : [] } };
    }
    return { body: { status: 200 } };
  }, async (calls) => {
    const provider = new ReachInboxProvider(KEY);
    const before = await provider.getCampaign("8");
    assertEquals(before.timezone, "Europe/London", "the campaign's own zone is read");
    const after = await provider.updateCampaign("8", {
      name: "Client · GOAP-abc", dailyLimit: 20, senderAccounts: ["a@x.com"], timezone: "America/Detroit",
    } as never, { includeSequence: false });
    const paths = calls.map((call) => call.url.pathname);
    assert(!paths.includes("/api/v1/campaigns/set-name"), "not renamed");
    assert(!paths.includes("/api/v1/campaigns/set-schedule"), "schedule left alone");
    assert(paths.includes("/api/v1/campaigns/set-accounts"), "senders still saved");
    const details = calls.find((call) => call.url.pathname === "/api/v1/campaigns/update-details");
    assertEquals(Object.keys(details?.body as object).sort(), ["campaignId", "dailyLimit", "maxNewLeads"], "only our limits written");
    assert(!after.rendersOurPitch, "still not treated as sending our pitch");
  });
});

Deno.test("unblock uses the email table, falls back to emails, and removes only an exact match", async () => {
  await withFetch((call) => {
    if (call.method === "GET" && call.url.pathname === "/api/v1/blocklist/email") {
      return { body: { data: { count: 2, rows: [{ id: 3, email: "a@x.com.au" }, { id: 4, email: "A@x.com" }] } } };
    }
    return { body: { status: 200, data: { deletedCount: 1 } } };
  }, async (calls) => {
    assert(await new ReachInboxProvider(KEY).unblockAddress("a@x.com"), "removed");
    const deleted = calls.find((call) => call.method === "DELETE")!;
    assertEquals([deleted.url.pathname, deleted.body], ["/api/v1/blocklist/email", { ids: [4] }], "exact row only");
  });

  await withFetch((call) => {
    if (call.url.pathname === "/api/v1/blocklist/email") return { status: 404, body: {} };
    if (call.method === "GET") return { body: { data: { count: 1, rows: [{ id: 9, email: "a@x.com" }] } } };
    return { body: { status: 200 } };
  }, async (calls) => {
    assert(await new ReachInboxProvider(KEY).unblockAddress("a@x.com"), "removed via fallback");
    assertEquals(calls.at(-1)!.url.pathname, "/api/v1/blocklist/emails", "fallback table");
  });

  await withFetch(() => ({ body: { data: { count: 1, rows: [{ id: 3, email: "b@x.com" }] } } }), async (calls) => {
    assert(!(await new ReachInboxProvider(KEY).unblockAddress("a@x.com")), "no exact match");
    assert(!calls.some((call) => call.method === "DELETE"), "nothing deleted");
  });
});

// Shapes below were captured from the live API on 2026-11-01.
Deno.test("live campaign page { totalCount, rows } is read and its total ends the walk", async () => {
  await withFetch((call) => {
    const offset = Number(call.url.searchParams.get("offset"));
    const all = [1, 2, 3].map((id) => ({ id, name: `C${id}`, status: "Draft" }));
    return { body: { status: 200, data: { totalCount: 3, totalSearchedCount: 3, rows: all.slice(offset, offset + 2) } } };
  }, async (calls) => {
    const { campaigns, complete } = await new ReachInboxProvider(KEY).listCampaigns();
    assertEquals(campaigns.map((campaign) => campaign.id), ["1", "2", "3"], "both pages read");
    assert(complete, "the total proves the end");
    assertEquals(calls.length, 2, "no extra empty-page request once the total is reached");
  });
  await withFetch(() => ({ body: { data: { totalCount: 3, rows: "nope" } } }), async () => {
    await rejects(() => new ReachInboxProvider(KEY).listCampaigns(), "REACHINBOX_RESPONSE_INVALID", "rows must be a list");
  });
});

Deno.test("a user-level key spanning workspaces is named for none of them", async () => {
  await withFetch((call) => {
    if (call.url.pathname === "/api/v1/account") return { body: { data: { id: 7, workspaceId: null } } };
    if (call.url.pathname === "/api/v1/account/all") {
      return {
        body: {
          data: {
            totalCount: 3,
            emailsConnected: [
              { email: "a@x.com", workspace: { id: "w1", name: "Alpha" } },
              { email: "b@x.com", workspace: { id: "w2", name: "Beta" } },
              { email: "c@x.com", workspace: null },
            ],
          },
        },
      };
    }
    return { body: { data: { totalCount: 0, rows: [] } } };
  }, async () => {
    const { workspace } = await new ReachInboxProvider(KEY).verifyConnection();
    assertEquals(workspace, { id: await reachInboxKeyFingerprint(KEY), name: "2 workspaces" }, "no arbitrary pick");
  });
});

Deno.test("a live lead with isBlocked 1 reads as blocked, 0 does not", () => {
  assertEquals(reachInboxLeadStatus({ status: "IN_PROCESS", isBlocked: 1, completed: false }), -3, "blocked");
  assertEquals(reachInboxLeadStatus({ status: "IN_PROCESS", isBlocked: 0, completed: false, paused: true }), 2, "lead paused");
  assertEquals(reachInboxLeadStatus({ status: "IN_PROCESS", isBlocked: 0, completed: false }), 1, "active");
});

Deno.test("set-schedule always carries the start and end dates the live API requires", async () => {
  await withFetch((call) => {
    if (call.url.pathname === "/api/v1/campaigns/create") return { body: { data: { id: 77, name: "GOAP-x" } } };
    return { body: { status: 200, data: {} } };
  }, async (calls) => {
    await new ReachInboxProvider(KEY).createCampaign({
      name: "GOAP-x",
      dailyLimit: 5,
      senderAccounts: [],
      timezone: "America/Detroit",
    } as never);
    const schedule = calls.find((call) => call.url.pathname === "/api/v1/campaigns/set-schedule");
    assert(schedule, "schedule written on create");
    const body = schedule.body as { startDate?: string; endDate?: string };
    assert(body.startDate && !Number.isNaN(Date.parse(body.startDate)), "startDate is an ISO date");
    assert(body.endDate && Date.parse(body.endDate) > Date.parse(body.startDate!), "endDate is after startDate");
  });
});

Deno.test("a lead staged into a draft campaign is not locked by the campaign's own pause", () => {
  // Live row from a never-started campaign: isPaused mirrors the campaign.
  const staged = { status: "NOT_STARTED", leadStatus: "Lead", isPaused: true, paused: false, completed: false, sequenceStopped: 0, isBlocked: 0 };
  assertEquals(reachInboxLeadStatus(staged), 1, "still editable");
  assertEquals(reachInboxLeadStatus({ ...staged, status: "IN_PROCESS", sequenceStopped: 2 }), 3, "any stop code ends it");
});

Deno.test("ReachInbox has no campaign delete, so deleting pauses and never clears leads", async () => {
  await withFetch((call) => {
    if (call.url.pathname === "/api/v1/campaigns/all") {
      return { body: { data: call.url.searchParams.get("offset") === "0" ? [{ id: 8, name: "Client", status: "paused" }] : [] } };
    }
    return { body: { status: 200 } };
  }, async (calls) => {
    const provider = new ReachInboxProvider(KEY);
    assertEquals(await provider.deleteCampaign("8"), "paused", "outcome");
    assert(calls.some((call) => call.url.pathname.endsWith("/campaigns/pause")), "paused");
    assert(!calls.some((call) => call.url.pathname.includes("/leads/delete")), "no lead wipe");
    assert(!calls.some((call) => call.method === "DELETE"), "no delete");
  });
});
