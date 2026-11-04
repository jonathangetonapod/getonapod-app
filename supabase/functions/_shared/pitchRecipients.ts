/**
 * Who a pitch goes to: exactly one address, chosen in Step 1 from the free
 * Podscan inbox, the verified host email or an address the operator found.
 * Every platform sends one email to one address — no CC.
 *
 * The browser proposes the address; this module decides what it may claim. A
 * source of "verified" is only true of the podcast's verified direct contact,
 * and "podscan" only of an address Podscan actually lists — otherwise any
 * client could badge a typed address as verified and the UI (and the pitch
 * writer) would trust it. Statuses come from the shared contact network, never
 * from the request. Mirrored for display in src/lib/pitchRecipients.ts.
 */

export type RecipientSource = "podscan" | "verified" | "manual";
export type RecipientStatus = "verified" | "unverified" | "bounced";
export type ContactRole = "host" | "producer" | "booking" | "other";
export type MxStatus = "ok" | "none" | "unknown";

export interface PitchRecipient {
  email: string;
  /** The strongest source, for the single-source shape the spec stores. */
  source: RecipientSource;
  /** Every source the address was found through, for the merged badge. */
  sources: RecipientSource[];
  status: RecipientStatus;
  /** Always the To: one address per pitch. Kept so the stored shape can grow. */
  role: "to";
  contact_role?: ContactRole;
  mx?: MxStatus;
}

/** One address per pitch, on every platform. */
export const MAX_PITCH_RECIPIENTS = 1;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOURCES: readonly RecipientSource[] = ["verified", "manual", "podscan"];
const CONTACT_ROLES: readonly ContactRole[] = ["host", "producer", "booking", "other"];
const SOURCE_PRIORITY: Record<RecipientSource, number> = { verified: 0, manual: 1, podscan: 2 };

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

/** The same split as src/lib/podscanEmails.ts: Podscan packs several into one field. */
export function podscanEmailList(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of (value || "").split(/[\s,;]+/)) {
    const cleaned = part.trim().replace(/^mailto:/i, "").replace(/^[<("']+|[>)"'.]+$/g, "");
    const email = normalizeEmail(cleaned);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    result.push(email);
  }
  return result;
}

export interface RecipientFacts {
  /** Addresses Podscan lists for the show, lower-case. */
  podscanEmails: string[];
  /** The verified direct contact, lower-case, or null. */
  verifiedEmail: string | null;
  /** What the shared network knows, by lower-case address. */
  networkStatus: Map<string, RecipientStatus>;
  /** MX results for addresses checked on this save. */
  mx?: Map<string, MxStatus>;
}

export class RecipientInputError extends Error {}

/**
 * The recipient as stored: at most one, its sources and status earned rather
 * than claimed. An empty list clears the choice.
 */
export function normalizeRecipients(input: unknown, facts: RecipientFacts): PitchRecipient[] {
  if (!Array.isArray(input)) throw new RecipientInputError("recipients must be a list");
  if (input.length > MAX_PITCH_RECIPIENTS) {
    throw new RecipientInputError("A pitch goes to one email address");
  }
  return input.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new RecipientInputError("The recipient must be an object");
    }
    const entry = raw as Record<string, unknown>;
    const email = normalizeEmail(entry.email);
    if (!email) throw new RecipientInputError("The recipient needs a valid email address");
    const claimed = [
      ...(Array.isArray(entry.sources) ? entry.sources : []),
      entry.source,
    ].filter((value): value is RecipientSource => SOURCES.includes(value as RecipientSource));
    // Earned sources only. A claim the facts do not back becomes "found by
    // hand", which is what an address the operator supplied is.
    const sources = new Set<RecipientSource>();
    for (const source of claimed) {
      if (source === "podscan" && facts.podscanEmails.includes(email)) sources.add("podscan");
      else if (source === "verified" && facts.verifiedEmail === email) sources.add("verified");
      else sources.add("manual");
    }
    if (facts.podscanEmails.includes(email)) sources.add("podscan");
    if (facts.verifiedEmail === email) sources.add("verified");
    if (sources.size === 0) sources.add("manual");
    const sorted = [...sources].sort((a, b) => SOURCE_PRIORITY[a] - SOURCE_PRIORITY[b]);
    const network = facts.networkStatus.get(email);
    const status: RecipientStatus = network === "bounced"
      ? "bounced"
      : sorted.includes("verified") || network === "verified"
      ? "verified"
      : "unverified";
    const contactRole = CONTACT_ROLES.includes(entry.contact_role as ContactRole)
      ? entry.contact_role as ContactRole
      : sorted.includes("manual") || sorted.includes("verified")
      ? "host"
      : undefined;
    const mx = facts.mx?.get(email);
    return {
      email,
      source: sorted[0],
      sources: sorted,
      status,
      role: "to" as const,
      ...(contactRole ? { contact_role: contactRole } : {}),
      ...(mx ? { mx } : {}),
    };
  });
}

/** Older pitches stored one address on the campaign target; it becomes the recipient. */
export function legacyRecipients(contactEmail: string | null | undefined, facts: RecipientFacts): PitchRecipient[] {
  const email = normalizeEmail(contactEmail);
  if (!email) return [];
  // No claimed source: the facts say where the address came from, and an
  // address they do not recognise falls back to "found by hand".
  return normalizeRecipients([{ email }], facts);
}

/** Whether the recipient changes what the opening email should say. */
export function recipientsAffectCopy(recipients: PitchRecipient[] | null | undefined): boolean {
  const role = recipients?.[0]?.contact_role;
  return role === "producer" || role === "booking";
}

/**
 * The block the pitch writer reads. Rules live here, in code, not in the
 * editable prompts: a workspace that rewrites write_email must still greet
 * the person the email actually goes to.
 */
export function recipientsPromptBlock(recipients: PitchRecipient[] | null | undefined): string {
  const to = recipients?.[0];
  if (!to || to.status === "bounced") return "";
  const role = to.contact_role;
  const greeting = role === "producer" || role === "booking"
    ? `This email goes to the show's ${role === "booking" ? "booking contact" : "producer"}, not the host. Greet them in that role (for example "Hi there," or "Hi [podcast name] team,"). Do not open with the host's name.`
    : "Greet the host by first name when it is known.";
  return [
    "<recipient>",
    `To: ${to.email} (${role ?? (to.sources.includes("podscan") ? "show inbox" : "host")})`,
    `- ${greeting}`,
    '- Never open with "Hi all", "Hi everyone", or a list of names.',
    "</recipient>",
  ].join("\n");
}

/** MX lookup with a short deadline. Never throws: the check is advisory. */
export async function checkMx(email: string, timeoutMs = 3_000): Promise<MxStatus> {
  const domain = email.split("@")[1];
  const resolveDns = (Deno as unknown as {
    resolveDns?: (name: string, type: "MX") => Promise<unknown[]>;
  }).resolveDns;
  if (!domain || typeof resolveDns !== "function") return "unknown";
  let timer: number | undefined;
  try {
    const records = await Promise.race([
      resolveDns(domain, "MX"),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    if (records === null) return "unknown";
    return records.length > 0 ? "ok" : "none";
  } catch (error) {
    // NXDOMAIN and "no records" both mean nothing accepts mail there; any
    // other failure is the resolver's, not the address's.
    const name = (error as { name?: string })?.name ?? "";
    return name === "NotFound" ? "none" : "unknown";
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
