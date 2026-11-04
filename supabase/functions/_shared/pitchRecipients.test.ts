// Deno tests for the server-side rules of the pitch recipient: one address.
import {
  legacyRecipients,
  normalizeRecipients,
  podscanEmailList,
  recipientsAffectCopy,
  recipientsPromptBlock,
  type RecipientFacts,
} from "./pitchRecipients.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`,
  );
}

const facts = (overrides: Partial<RecipientFacts> = {}): RecipientFacts => ({
  podscanEmails: ["info@show.fm", "host@show.fm"],
  verifiedEmail: "jane@show.fm",
  networkStatus: new Map(),
  ...overrides,
});

Deno.test("a pitch goes to exactly one address", () => {
  let threw = false;
  try {
    normalizeRecipients([{ email: "a@b.co" }, { email: "c@d.co" }], facts());
  } catch {
    threw = true;
  }
  assert(threw, "two addresses are refused");
  assertEquals(normalizeRecipients([], facts()), [], "an empty list clears the choice");
  assertEquals(normalizeRecipients([{ email: "info@show.fm", role: "cc" }], facts())[0].role, "to", "the one address is always the To");
});

Deno.test("a typed address cannot claim to be verified or from Podscan", () => {
  const [recipient] = normalizeRecipients(
    [{ email: "Someone@Elsewhere.com", source: "verified", sources: ["podscan"] }],
    facts(),
  );
  assertEquals(recipient.sources, ["manual"], "unearned claims become manual");
  assertEquals(recipient.status, "unverified", "and stay unverified");
  assertEquals(recipient.email, "someone@elsewhere.com", "addresses are lower-cased");
});

Deno.test("an address found through two sources carries both badges", () => {
  const [recipient] = normalizeRecipients([{ email: "jane@show.fm", source: "manual" }], facts({ podscanEmails: ["jane@show.fm"] }));
  assertEquals(recipient.sources, ["verified", "manual", "podscan"], "every earned source, strongest first");
  assertEquals(recipient.status, "verified", "verified source means verified");
});

Deno.test("status comes from the network, never the request", () => {
  const [bounced] = normalizeRecipients(
    [{ email: "host@show.fm", status: "verified" }],
    facts({ networkStatus: new Map([["host@show.fm", "bounced"]]) }),
  );
  assertEquals(bounced.status, "bounced", "a bounce is reported");
  const [proven] = normalizeRecipients(
    [{ email: "me@found.com", source: "manual" }],
    facts({ networkStatus: new Map([["me@found.com", "verified"]]) }),
  );
  assertEquals(proven.status, "verified", "a reply-proven manual address reads verified");
});

Deno.test("an old single contact_email loads as the recipient", () => {
  const list = legacyRecipients("Host@Show.fm", facts());
  assertEquals(list.map((r) => [r.email, r.role, r.sources]), [["host@show.fm", "to", ["podscan"]]], "mapped with its real source");
  assertEquals(legacyRecipients(null, facts()), [], "no address, no recipient");
});

Deno.test("podscan list parsing matches the browser", () => {
  assertEquals(
    podscanEmailList("Host <HOST@show.fm>, mailto:info@show.fm; host@show.fm nonsense"),
    ["host@show.fm", "info@show.fm"],
    "split, cleaned, deduplicated",
  );
});

Deno.test("the prompt greets the recipient, by role when it is not the host", () => {
  const host = recipientsPromptBlock(normalizeRecipients([{ email: "jane@show.fm", source: "verified" }], facts()));
  assert(host.includes("To: jane@show.fm (host)"), "names the recipient");
  assert(host.includes("Greet the host by first name"), "greets the host");
  assert(host.includes('Never open with "Hi all"'), "never a group greeting");
  assert(!host.includes("CC"), "no CC, ever");

  const producer = recipientsPromptBlock(normalizeRecipients([{ email: "sam@found.com", source: "manual", contact_role: "producer" }], facts()));
  assert(producer.includes("Do not open with the host's name"), "greets the producer role");
  assertEquals(recipientsPromptBlock([]), "", "nothing to say without a recipient");
  assert(recipientsAffectCopy(normalizeRecipients([{ email: "sam@found.com", contact_role: "booking" }], facts())), "a booking contact changes the copy");
  assert(!recipientsAffectCopy(legacyRecipients("jane@show.fm", facts())), "the host does not");
});
