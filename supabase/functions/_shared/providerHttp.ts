/**
 * One hardened JSON request to an outreach provider other than Instantly.
 *
 * Same guarantees as instantlyRequest: a timeout that covers the body, a size
 * cap, a path guard, and provider statuses turned into coded errors that say
 * which provider failed. Two additions, because these origins are not fixed:
 * redirects are never followed (a redirect is how an allowed host hands the
 * request to one that is not), and the origin must have passed
 * assertSafeProviderOrigin before it gets here.
 */

import { OutreachProviderError } from "./outreachProvider.ts";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_PROVIDER_RESPONSE_BYTES = 2_000_000;

export interface ProviderRequestTarget {
  /** https://host, already validated. */
  origin: string;
  /** e.g. "/api" or "/api/v1". */
  prefix: string;
  apiKey: string;
  /** Shown to people: "Email Bison". */
  label: string;
  /** Error code prefix: "EMAILBISON". */
  codePrefix: string;
}

export interface ProviderRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  query?: URLSearchParams;
}

function failure(target: ProviderRequestTarget, status: number, detail: string | null) {
  const p = target.codePrefix;
  const label = target.label;
  if (status === 401) {
    return new OutreachProviderError(status, `${p}_KEY_REJECTED`, `${label} rejected this API key`);
  }
  if (status === 402) {
    return new OutreachProviderError(
      status,
      `${p}_PLAN_REQUIRED`,
      `The connected ${label} workspace needs an active plan with API access`,
    );
  }
  if (status === 403) {
    return new OutreachProviderError(
      status,
      `${p}_SCOPE_REQUIRED`,
      `The ${label} API key is missing a required permission`,
    );
  }
  if (status === 404) {
    return new OutreachProviderError(
      status,
      `${p}_RESOURCE_NOT_FOUND`,
      `The mapped ${label} resource no longer exists`,
    );
  }
  if (status === 422 || status === 400) {
    return new OutreachProviderError(
      status,
      `${p}_REQUEST_REJECTED`,
      detail ? `${label} refused the request: ${detail}` : `${label} refused the request`,
    );
  }
  if (status === 429) {
    return new OutreachProviderError(
      status,
      `${p}_RATE_LIMITED`,
      `${label} is temporarily rate limiting this workspace`,
    );
  }
  return new OutreachProviderError(
    status,
    `${p}_REQUEST_FAILED`,
    `${label} could not complete the request`,
  );
}

/** A short, provider-written reason from an error body, never the whole body. */
function errorDetail(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const message = typeof parsed.message === "string" ? parsed.message : null;
    const firstError = parsed.errors && typeof parsed.errors === "object"
      ? Object.values(parsed.errors as Record<string, unknown>).flat()[0]
      : null;
    const text = typeof firstError === "string" ? firstError : message;
    return text ? text.replace(/\s+/g, " ").trim().slice(0, 200) : null;
  } catch {
    return null;
  }
}

export async function providerRequest<T>(
  target: ProviderRequestTarget,
  path: string,
  options: ProviderRequestOptions = {},
): Promise<T> {
  if (!path.startsWith("/") || path.includes("://") || path.includes("\\") || path.includes("..")) {
    throw new OutreachProviderError(
      500,
      `${target.codePrefix}_PATH_INVALID`,
      `The ${target.label} request path is invalid`,
    );
  }
  const url = new URL(`${target.prefix}${path}`, target.origin);
  if (url.origin !== target.origin) {
    throw new OutreachProviderError(
      500,
      `${target.codePrefix}_PATH_INVALID`,
      `The ${target.label} request path is invalid`,
    );
  }
  if (options.query) url.search = options.query.toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${target.apiKey}`,
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
        redirect: "manual",
      });
    } catch {
      throw new OutreachProviderError(
        0,
        `${target.codePrefix}_UNAVAILABLE`,
        `${target.label} could not be reached`,
      );
    }

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => undefined);
      throw new OutreachProviderError(
        502,
        `${target.codePrefix}_REDIRECT_REFUSED`,
        `${target.label} answered with a redirect, which is not followed. Check the instance URL.`,
      );
    }

    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PROVIDER_RESPONSE_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      throw new OutreachProviderError(
        502,
        `${target.codePrefix}_RESPONSE_INVALID`,
        `${target.label} returned an invalid response`,
      );
    }
    let raw: string;
    try {
      raw = await response.text();
    } catch {
      throw new OutreachProviderError(
        0,
        `${target.codePrefix}_UNAVAILABLE`,
        `${target.label} could not be reached`,
      );
    }
    if (new TextEncoder().encode(raw).byteLength > MAX_PROVIDER_RESPONSE_BYTES) {
      throw new OutreachProviderError(
        502,
        `${target.codePrefix}_RESPONSE_INVALID`,
        `${target.label} returned an invalid response`,
      );
    }
    if (!response.ok) throw failure(target, response.status, errorDetail(raw));
    if (response.status === 204 || raw.trim() === "") return undefined as T;
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new OutreachProviderError(
        502,
        `${target.codePrefix}_RESPONSE_INVALID`,
        `${target.label} returned an invalid response`,
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

const BLOCKED_HOST_SUFFIXES = [
  ".local",
  ".localhost",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".corp",
  ".svc",
  ".cluster.local",
  ".supabase.internal",
];

/**
 * The instance URL an agency typed, reduced to a safe https origin or refused.
 *
 * The server calls this host with the agency's token, so it is treated as an
 * attacker-chosen URL: https only, default port, a public DNS name (no IP
 * literals, no single-label or internal names), no credentials, no path or
 * query. EMAILBISON_ALLOWED_HOST_SUFFIXES, when set, narrows it to listed
 * domains. Redirects are refused at request time, so a vetted host cannot
 * forward the request somewhere this check would have stopped.
 */
export function normalizeProviderOrigin(
  value: unknown,
  label: string,
  codePrefix: string,
  allowedSuffixes: string[] = [],
): string {
  const refuse = (reason: string) =>
    new OutreachProviderError(400, `${codePrefix}_URL_INVALID`, `${label} URL ${reason}`);
  if (typeof value !== "string" || !value.trim() || value.length > 300) {
    throw refuse("is required, for example https://send.youragency.com");
  }
  let raw = value.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw refuse("is not a valid web address");
  }
  if (url.protocol !== "https:") throw refuse("must use https");
  if (url.username || url.password) throw refuse("must not contain a username or password");
  if (url.port && url.port !== "443") throw refuse("must use the standard https port");
  if (url.search || url.hash) throw refuse("must not contain a query or fragment");
  if (url.pathname !== "/" && url.pathname.replace(/\/+$/, "") !== "") {
    // People paste https://host/api or https://host/dashboard. The origin is
    // what is wanted; anything deeper than /api is a mistake worth naming.
    if (!/^\/api\/?$/i.test(url.pathname)) throw refuse("must be the instance address only, with no path");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host.includes(":") || /^[0-9.]+$/.test(host) || /^\[/.test(host)) {
    throw refuse("must be a domain name, not an IP address");
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    throw refuse("must be a public domain name");
  }
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw refuse("must be a public domain name");
  }
  // A bare hex-ish label like 0x7f000001 or a decimal IP disguised by dots is
  // already refused above; also refuse anything ending in a numeric TLD.
  if (/\.[0-9]+$/.test(host)) throw refuse("must be a public domain name");
  const suffixes = allowedSuffixes.map((suffix) => suffix.trim().toLowerCase()).filter(Boolean);
  if (
    suffixes.length > 0 &&
    !suffixes.some((suffix) => host === suffix.replace(/^\./, "") || host.endsWith(`.${suffix.replace(/^\./, "")}`))
  ) {
    throw refuse("is not on the list of allowed instance domains");
  }
  return `https://${host}`;
}

function isPrivateV4(a: number, b: number, c: number): boolean {
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) || a >= 224;
}

/** Expands an IPv6 address to eight 16-bit groups, or null. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  // An embedded IPv4 tail (::ffff:1.2.3.4) becomes two groups.
  const tail = text.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (tail) {
    const [a, b, c, d] = tail.slice(1).map(Number);
    text = text.slice(0, -tail[0].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  const parts = [...head, ...Array(Math.max(0, fill)).fill("0"), ...rest];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.map((part) => parseInt(part, 16));
}

export function isPrivateAddress(address: string): boolean {
  const v4 = address.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) return isPrivateV4(Number(v4[1]), Number(v4[2]), Number(v4[3]));
  const groups = ipv6Groups(address);
  // Unparseable is not proof of public.
  if (!groups) return true;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  const embeddedV4 = (high: number, low: number) => isPrivateV4(high >> 8, high & 0xff, low >> 8);
  if (groups.every((group) => group === 0)) return true; // ::
  if (groups.slice(0, 7).every((group) => group === 0) && g7 === 1) return true; // ::1
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g0 & 0xffc0) === 0xfe80 || (g0 & 0xffc0) === 0xfec0) return true; // link/site local
  if ((g0 & 0xff00) === 0xff00) return true; // multicast
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && (g5 === 0xffff || g5 === 0)) {
    return embeddedV4(g6, g7); // IPv4-mapped / -compatible
  }
  if (g0 === 0x64 && g1 === 0xff9b) return embeddedV4(g6, g7); // NAT64
  if (g0 === 0x2002) return embeddedV4(g1, g2); // 6to4
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentation
  return false;
}

/**
 * Refuses a host whose DNS answers point inside a private network.
 *
 * Best effort: where the runtime cannot resolve names, the hostname rules in
 * normalizeProviderOrigin are what stands. Checked at connect time and before
 * each provider session, not per request, which narrows but does not close
 * DNS rebinding; the redirect refusal and hostname rules carry the rest.
 */
export async function assertPublicProviderHost(
  origin: string,
  label: string,
  codePrefix: string,
): Promise<void> {
  const host = new URL(origin).hostname;
  const resolve = (Deno as unknown as {
    resolveDns?: (name: string, type: "A" | "AAAA") => Promise<string[]>;
  }).resolveDns;
  // Where the runtime has no resolver at all, the hostname rules and the
  // optional EMAILBISON_ALLOWED_HOST_SUFFIXES allow-list are what stands.
  if (typeof resolve !== "function") return;
  const answers: string[] = [];
  for (const type of ["A", "AAAA"] as const) {
    try {
      answers.push(...await resolve(host, type));
    } catch {
      // No record of this type, or resolution is not permitted here.
    }
  }
  // A resolver that answers nothing for either type proves nothing about where
  // fetch will go, so it fails closed rather than open.
  if (answers.length === 0) {
    throw new OutreachProviderError(
      400,
      `${codePrefix}_URL_INVALID`,
      `${label} URL could not be resolved. Check the address and try again.`,
    );
  }
  if (answers.some(isPrivateAddress)) {
    throw new OutreachProviderError(
      400,
      `${codePrefix}_URL_INVALID`,
      `${label} URL must point at a public server`,
    );
  }
}
