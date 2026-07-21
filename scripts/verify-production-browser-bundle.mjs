import process from 'node:process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { findingsFor } from './scan-release-secrets.mjs'
import { validatePublicSupabaseConfig } from './validate-public-supabase-config.mjs'

const MODULE_PATH = fileURLToPath(import.meta.url)
export const KNOWN_COMPROMISED_ASSET_PATHS = Object.freeze([
  '/assets/Node.js',
  '/assets/index-DlOoAdvm.js',
  '/assets/App-4j-h30J_.js',
  '/assets/supabase-RKBMPFVQ.js',
  '/assets/button-CElMJTZX.js',
  '/assets/ErrorBoundary-CAwUNoYN.js',
])
const RETIRED_ASSET_BYTE_LIMIT = 50_000_000

export function resolveJavaScriptReferences(source, baseUrl, origin) {
  const references = []
  for (const match of source.matchAll(/["']([^"']+\.js(?:\?[^"']*)?)["']/gu)) {
    const reference = match[1]
    if (
      !reference.startsWith('/')
      && !reference.startsWith('./')
      && !reference.startsWith('../')
      && !reference.startsWith('assets/')
      && !/^https?:\/\//u.test(reference)
    ) continue
    let target
    try {
      target = reference.startsWith('assets/')
        ? new URL(`/${reference}`, origin)
        : new URL(reference, baseUrl)
    } catch {
      continue
    }
    if (target.origin === origin) references.push(target)
  }
  return references
}

export function isJavaScriptContentType(contentType) {
  return /^(?:application|text)\/(?:javascript|ecmascript)(?:\s*;|$)/iu.test(contentType)
}

export async function verifyRetiredBrowserAssets(
  originInput,
  { fetchImpl = fetch, paths = KNOWN_COMPROMISED_ASSET_PATHS } = {},
) {
  const origin = new URL(originInput).origin
  const failures = []
  const unavailable = []
  let totalBytes = 0

  for (const pathname of paths) {
    const target = new URL(pathname, origin)
    if (target.origin !== origin) {
      throw new Error(`Retired production browser asset path is outside the production origin: ${target.pathname}`)
    }
    let response
    try {
      response = await fetchImpl(target, {
        headers: {
          'cache-control': 'no-cache',
          'user-agent': 'GOAP-production-browser-retirement-verifier',
        },
        redirect: 'follow',
      })
    } catch {
      throw new Error(`Retired production browser asset could not be fetched: ${target.pathname}`)
    }

    let responseUrl
    try {
      responseUrl = new URL(response.url)
    } catch {
      throw new Error(`Retired production browser asset returned an invalid response URL: ${target.pathname}`)
    }
    if (responseUrl.origin !== origin) {
      throw new Error(`Retired production browser asset redirected outside the production origin: ${target.pathname}`)
    }

    const source = await response.text()
    totalBytes += Buffer.byteLength(source)
    if (totalBytes > RETIRED_ASSET_BYTE_LIMIT) {
      throw new Error('Retired production browser asset verification exceeded the byte limit')
    }

    const categories = findingsFor(source)
    if (categories.length > 0) failures.push(`${target.pathname}: ${categories.join(',')}`)
    if (!response.ok && response.status !== 404) unavailable.push(`${target.pathname}: HTTP ${response.status}`)
  }

  if (failures.length > 0) {
    throw new Error(
      `Retired production browser assets still contain forbidden credentials (values suppressed):\n${failures.join('\n')}`,
    )
  }
  if (unavailable.length > 0) {
    throw new Error(`Retired production browser assets could not be verified:\n${unavailable.join('\n')}`)
  }

  return { checkedCount: paths.length }
}

export async function verifyProductionBrowser(originInput = 'https://getonapod.com') {
  const originUrl = new URL(originInput)
  if (originUrl.protocol !== 'https:' || originUrl.username || originUrl.password) {
    throw new Error('Production browser verification requires a credential-free HTTPS origin')
  }

  const origin = originUrl.origin
  const retirement = await verifyRetiredBrowserAssets(origin)
  const pending = [new URL('/', origin)]
  const visited = new Set()
  const sources = []
  const failures = []
  let totalBytes = 0

  while (pending.length > 0) {
    const target = pending.shift()
    if (!target || visited.has(target.href)) continue
    if (visited.size >= 500) throw new Error('Production browser verification exceeded the asset limit')
    visited.add(target.href)

    const response = await fetch(target, {
      headers: { 'cache-control': 'no-cache', 'user-agent': 'GOAP-production-browser-verifier' },
      redirect: 'follow',
    })
    if (!response.ok || new URL(response.url).origin !== origin) {
      throw new Error(`Production browser asset could not be verified: ${target.pathname}`)
    }
    if (
      target.pathname.endsWith('.js')
      && !isJavaScriptContentType(response.headers.get('content-type') ?? '')
    ) {
      throw new Error(`Production browser JavaScript reference returned a non-JavaScript response: ${target.pathname}`)
    }
    const source = await response.text()
    totalBytes += Buffer.byteLength(source)
    if (totalBytes > 50_000_000) throw new Error('Production browser verification exceeded the byte limit')

    const categories = findingsFor(source)
    if (categories.length > 0) failures.push(`${target.pathname}: ${categories.join(',')}`)
    sources.push(source)
    for (const reference of resolveJavaScriptReferences(source, target, origin)) {
      if (!visited.has(reference.href)) pending.push(reference)
    }
  }

  if (failures.length > 0) {
    throw new Error(`Production browser assets contain forbidden credentials (values suppressed):\n${failures.join('\n')}`)
  }

  const combined = sources.join('\n')
  const projectUrl = combined.match(/https:\/\/[a-z0-9]+\.supabase\.co/u)?.[0]
  const keys = [
    ...combined.matchAll(/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/gu),
    ...combined.matchAll(/\bsb_publishable_[A-Za-z0-9_-]{20,}\b/gu),
  ].map((match) => match[0])

  if (!projectUrl || keys.length === 0) {
    throw new Error('Production public Supabase configuration was not discoverable')
  }

  let safeKeyKind = null
  for (const key of keys) {
    try {
      validatePublicSupabaseConfig({ url: projectUrl, key })
      safeKeyKind = key.startsWith('sb_publishable_') ? 'publishable' : 'legacy-anon'
      break
    } catch {
      // Try other public-looking keys; forbidden privileged values were already
      // rejected by the bundle credential scan above.
    }
  }
  if (!safeKeyKind) throw new Error('Production Supabase browser key is not public-safe')

  return {
    assetCount: visited.size,
    retiredAssetCount: retirement.checkedCount,
    safeKeyKind,
  }
}

if (path.resolve(process.argv[1] ?? '') === MODULE_PATH) {
  const result = await verifyProductionBrowser(process.argv[2] || 'https://getonapod.com')
  process.stdout.write(
    `Production browser credential verification passed; assets=${result.assetCount}; retired_assets=${result.retiredAssetCount}; supabase_key=${result.safeKeyKind}\n`,
  )
}
