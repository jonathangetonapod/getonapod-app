/**
 * Builds the provider adapter for a stored connection.
 *
 * The one place that knows which class serves which provider. Callers hold an
 * OutreachProvider and never branch on the kind for request shapes.
 */

import { EmailBisonProvider } from "./emailBison.ts";
import { InstantlyProvider } from "./instantlyProvider.ts";
import {
  OUTREACH_PROVIDER_KINDS,
  type OutreachProvider,
  type OutreachProviderKind,
  OutreachProviderError,
} from "./outreachProvider.ts";
import { assertPublicProviderHost, normalizeProviderOrigin } from "./providerHttp.ts";
import { ReachInboxProvider } from "./reachInbox.ts";

export function requireProviderKind(value: unknown): OutreachProviderKind {
  if (value === undefined || value === null) return "instantly";
  if (typeof value === "string" && (OUTREACH_PROVIDER_KINDS as readonly string[]).includes(value)) {
    return value as OutreachProviderKind;
  }
  throw new OutreachProviderError(400, "PROVIDER_INVALID", "provider must be instantly, emailbison or reachinbox");
}

export function emailBisonAllowedSuffixes(): string[] {
  return (Deno.env.get("EMAILBISON_ALLOWED_HOST_SUFFIXES") ?? "")
    .split(",")
    .map((suffix) => suffix.trim())
    .filter(Boolean);
}

/** The instance origin for a provider that needs one, validated; null otherwise. */
export function providerBaseUrl(kind: OutreachProviderKind, value: unknown): string | null {
  if (kind !== "emailbison") {
    if (value !== undefined && value !== null && value !== "") {
      throw new OutreachProviderError(400, "PROVIDER_BASE_URL_UNEXPECTED", "Only Email Bison takes an instance URL");
    }
    return null;
  }
  return normalizeProviderOrigin(value, "Email Bison", "EMAILBISON", emailBisonAllowedSuffixes());
}

export async function createOutreachProvider(
  kind: OutreachProviderKind,
  apiKey: string,
  baseUrl: string | null,
): Promise<OutreachProvider> {
  if (kind === "emailbison") {
    // Re-validated on every use: a row written before a rule tightened, or
    // edited by hand, must not get a request it would now be refused.
    const origin = providerBaseUrl("emailbison", baseUrl);
    if (!origin) {
      throw new OutreachProviderError(409, "EMAILBISON_URL_INVALID", "Email Bison instance URL is missing");
    }
    await assertPublicProviderHost(origin, "Email Bison", "EMAILBISON");
    return new EmailBisonProvider(origin, apiKey);
  }
  if (kind === "reachinbox") return new ReachInboxProvider(apiKey);
  return new InstantlyProvider(apiKey);
}
