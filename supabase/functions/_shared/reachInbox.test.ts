// Deno tests for the ReachInbox adapter, checked against docs.reachinbox.ai.
import { OutreachProviderError } from "./outreachProvider.ts";
import {
  reachInboxCampaignStatus,
  reachInboxKeyFingerprint,
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
    assertEquals(workspace, { id: "workspace-abc123", name: "ReachInbox · Sales" }, "workspace identity");
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

Deno.test("campaign listing stops when the server ignores the offset", async () => {
  await withFetch(() => ({ body: { data: [{ id: 5, name: "Only" }] } }), async (calls) => {
    const { campaigns, complete } = await new ReachInboxProvider(KEY).listCampaigns();
    assertEquals(campaigns.map((campaign) => campaign.id), ["5"], "no duplicates");
    assert(complete, "repeat page ends the walk");
    assertEquals(calls.length, 2, "one extra request, not twenty");
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

Deno.test("getLead treats a 404 as a missing lead", async () => {
  await withFetch(() => ({ status: 404, body: {} }), async () => {
    assertEquals(await new ReachInboxProvider(KEY).getLead("5", "8"), null, "gone");
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
