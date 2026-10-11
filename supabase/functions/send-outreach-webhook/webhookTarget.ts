/**
 * Guards for the client-configured outreach webhook URL.
 *
 * The URL is stored on the client record and fetched server-side, so without
 * these checks it could point the function at loopback, the cloud metadata
 * service or another private address (SSRF). The resolved addresses are
 * checked too, because a public-looking hostname can resolve to a private one.
 * A DNS answer can still change between this check and the fetch; redirects
 * are refused by the caller so a public host cannot bounce the request inward.
 */

export class WebhookTargetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebhookTargetError'
  }
}

/** The most of a webhook's response body kept in the outreach log. */
export const MAX_STORED_RESPONSE_BYTES = 4096

const BLOCKED_HOSTNAME_PATTERN = /(?:^|\.)(?:localhost|local|localdomain|internal|intranet|lan|home\.arpa)$/iu

function ipv4Octets(value: string): number[] | null {
  const parts = value.split('.')
  if (parts.length !== 4) return null
  const octets = parts.map((part) => (/^\d{1,3}$/u.test(part) ? Number(part) : Number.NaN))
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) ? octets : null
}

function isPrivateIpv4(octets: number[]): boolean {
  const [a, b, c] = octets
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224
}

/** Expands an IPv6 literal to eight 16-bit groups, or null when it is not one. */
function ipv6Groups(value: string): number[] | null {
  let address = value.toLowerCase()
  const zone = address.indexOf('%')
  if (zone >= 0) address = address.slice(0, zone)
  if (!address.includes(':')) return null

  // A trailing dotted IPv4 (::ffff:10.0.0.1) becomes two groups.
  const lastColon = address.lastIndexOf(':')
  const tail = address.slice(lastColon + 1)
  if (tail.includes('.')) {
    const octets = ipv4Octets(tail)
    if (!octets) return null
    address = `${address.slice(0, lastColon + 1)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`
  }

  const halves = address.split('::')
  if (halves.length > 2) return null
  const parse = (part: string) => (part === '' ? [] : part.split(':'))
  const head = parse(halves[0])
  const rest = halves.length === 2 ? parse(halves[1]) : []
  const missing = 8 - head.length - rest.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest]
  if (groups.length !== 8 || !groups.every((group) => /^[0-9a-f]{1,4}$/u.test(group))) return null
  return groups.map((group) => Number.parseInt(group, 16))
}

function isPrivateIpv6(groups: number[]): boolean {
  const [first, second] = groups
  if (groups.every((group) => group === 0)) return true // ::
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true // ::1
  const embeddedIpv4 = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff]
  // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d) and NAT64 (64:ff9b::a.b.c.d).
  if (groups.slice(0, 5).every((group) => group === 0) && (groups[5] === 0xffff || groups[5] === 0)) {
    return isPrivateIpv4(embeddedIpv4)
  }
  if (first === 0x64 && second === 0xff9b) return isPrivateIpv4(embeddedIpv4)
  return (first & 0xfe00) === 0xfc00 // fc00::/7 unique local
    || (first & 0xffc0) === 0xfe80 // fe80::/10 link-local
    || (first & 0xffc0) === 0xfec0 // fec0::/10 site-local (deprecated)
    || (first & 0xff00) === 0xff00 // ff00::/8 multicast
    || (first === 0x2001 && second === 0x0db8) // documentation
    || (first === 0x0100 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0) // discard-only
}

/** True for an IP literal in a loopback, private, link-local or otherwise non-public range. */
export function isPrivateAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/gu, '')
  const v4 = ipv4Octets(bare)
  if (v4) return isPrivateIpv4(v4)
  const v6 = ipv6Groups(bare)
  if (v6) return isPrivateIpv6(v6)
  return false
}

function isIpLiteral(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/gu, '')
  return ipv4Octets(bare) !== null || ipv6Groups(bare) !== null
}

export type DnsResolver = (hostname: string, recordType: 'A' | 'AAAA') => Promise<string[]>

function defaultResolver(): DnsResolver | null {
  const deno = (globalThis as { Deno?: { resolveDns?: DnsResolver } }).Deno
  return typeof deno?.resolveDns === 'function' ? deno.resolveDns.bind(deno) : null
}

/**
 * Parses the stored webhook URL and refuses anything but a public https
 * endpoint. Throws WebhookTargetError with a message safe to show the operator.
 */
export async function assertPublicWebhookUrl(
  value: string,
  resolver: DnsResolver | null = defaultResolver(),
): Promise<URL> {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new WebhookTargetError('The webhook URL is not a valid URL')
  }
  if (url.protocol !== 'https:') throw new WebhookTargetError('The webhook URL must start with https://')
  if (url.username || url.password) throw new WebhookTargetError('The webhook URL must not contain a username or password')
  if (url.port && url.port !== '443') throw new WebhookTargetError('The webhook URL must use the standard https port')

  const hostname = url.hostname.toLowerCase().replace(/\.$/u, '')
  if (!hostname || BLOCKED_HOSTNAME_PATTERN.test(hostname)) {
    throw new WebhookTargetError('The webhook URL must point to a public host')
  }
  if (isIpLiteral(hostname)) {
    if (isPrivateAddress(hostname)) throw new WebhookTargetError('The webhook URL must point to a public host')
    return url
  }
  if (!hostname.includes('.')) throw new WebhookTargetError('The webhook URL must point to a public host')

  if (!resolver) return url
  const addresses: string[] = []
  let resolverUnavailable = false
  for (const recordType of ['A', 'AAAA'] as const) {
    try {
      addresses.push(...await resolver(hostname, recordType))
    } catch (error) {
      const name = error instanceof Error ? error.name : ''
      // A runtime without DNS access still gets the literal checks above.
      if (name === 'NotSupported' || name === 'PermissionDenied' || name === 'NotCapable') resolverUnavailable = true
    }
  }
  if (addresses.some(isPrivateAddress)) throw new WebhookTargetError('The webhook URL must point to a public host')
  if (addresses.length === 0 && !resolverUnavailable) {
    throw new WebhookTargetError('The webhook host could not be found')
  }
  return url
}

/** Reads at most `maxBytes` of a response body and drops the rest unread. */
export async function readLimitedText(response: Response, maxBytes = MAX_STORED_RESPONSE_BYTES): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  let truncated = false
  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      const room = maxBytes - received
      chunks.push(value.byteLength > room ? value.subarray(0, room) : value)
      received += Math.min(value.byteLength, room)
      if (value.byteLength > room) truncated = true
    }
    if (received >= maxBytes) truncated = true
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const text = new TextDecoder().decode(bytes)
  return truncated ? `${text}\n[truncated]` : text
}
