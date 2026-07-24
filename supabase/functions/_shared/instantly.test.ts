import {
  decryptInstantlyApiKey,
  encryptInstantlyApiKey,
  localCampaignStatus,
  safeInstantlyAnalytics,
} from "./instantly.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

Deno.test("Instantly credentials round-trip without storing plaintext", async () => {
  const apiKey = "instant-api-key-that-must-stay-server-side";
  const secret = "a-test-only-encryption-secret-with-more-than-32-characters";
  const encrypted = await encryptInstantlyApiKey(apiKey, secret);

  assert(
    encrypted.ciphertext !== apiKey,
    "ciphertext must not contain the plaintext API key",
  );
  assertEquals(
    await decryptInstantlyApiKey(encrypted, secret),
    apiKey,
    "the encrypted credential should round-trip",
  );
  let rejected = false;
  try {
    await decryptInstantlyApiKey(encrypted, `${secret}-wrong`);
  } catch (error) {
    rejected = error instanceof Error &&
      error.message.includes("could not be decrypted");
  }
  assert(rejected, "the wrong encryption secret must be rejected");
});

Deno.test("Instantly provider values are reduced to the supported campaign DTO", () => {
  assertEquals(localCampaignStatus(1), "active", "active status should map");
  assertEquals(localCampaignStatus(2), "paused", "paused status should map");
  assertEquals(
    localCampaignStatus(4),
    "attention",
    "subsequence status should require attention",
  );
  assertEquals(
    safeInstantlyAnalytics({
      emails_sent_count: 20,
      contacted_count: 10,
      reply_count_unique: 4,
      total_interested: 2,
      unsafe_provider_field: "not returned",
    }),
    {
      emails_sent_count: 20,
      contacted_count: 10,
      open_count_unique: 0,
      reply_count_unique: 4,
      bounced_count: 0,
      unsubscribed_count: 0,
      total_interested: 2,
      total_meeting_booked: 0,
    },
    "analytics should expose only the supported non-negative counters",
  );
});
