// Renders the public marketing pages to static HTML after `vite build`.
//
// The browser build writes dist/index.html, the shell every route boots from.
// This script builds src/prerender/entry.tsx for Node, renders each route in
// PRERENDERED_ROUTES and writes dist/prerender/<file>: the shell with the
// page's markup inside #root, its Helmet tags (title, description, canonical,
// social card, structured data) in <head>, and the stylesheets and chunks the
// page needs, so it paints styled before any JavaScript runs.
//
// scripts/serve-production.mjs serves those files for the indexable routes.
// Crawlers and link-preview bots that never run JavaScript read the real page;
// browsers boot the app as before and it renders over the same markup.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const MANIFEST_DIR = path.join(DIST, '.vite')
const SSR_OUT = path.join(ROOT, 'node_modules', '.cache', 'prerender-marketing')
const SUPABASE_MODULE = path.join(ROOT, 'src', 'lib', 'supabase.ts')
const SUPABASE_STUB = path.join(ROOT, 'src', 'prerender', 'supabaseStub.ts')
const ERROR_BOUNDARY_SOURCE = 'src/components/ErrorBoundary.tsx'
const EMPTY_ROOT = '<div id="root"></div>'

function parseMode(argv) {
  const index = argv.indexOf('--mode')
  return index >= 0 && argv[index + 1] ? argv[index + 1] : 'production'
}

// The render runs in Node with no Supabase credentials and must not need any.
const stubSupabase = {
  name: 'prerender-stub-supabase',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
    return resolved?.id === SUPABASE_MODULE ? SUPABASE_STUB : null
  },
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

// The Service, FAQPage and WebSite blocks in index.html describe the homepage
// only. Other pages keep the Organization block (as marketingPageShell does).
export function keepOrganizationOnly(source) {
  return source.replace(/(\s*)<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu, (block, _space, json) => {
    try {
      return JSON.parse(json)?.['@type'] === 'Organization' ? block : ''
    } catch {
      return ''
    }
  })
}

/**
 * The stylesheets and JavaScript chunks a page module needs, from the Vite
 * manifest: its own chunk plus every chunk it imports statically. Dynamic
 * imports are left out; they load on demand.
 */
export function chunkAssets(manifest, sources) {
  const css = new Set()
  const js = new Set()
  const seen = new Set()
  const visit = (key) => {
    if (!key || seen.has(key) || !manifest[key]) return
    seen.add(key)
    const chunk = manifest[key]
    if (chunk.file?.endsWith('.js')) js.add(`/${chunk.file}`)
    for (const file of chunk.css ?? []) css.add(`/${file}`)
    for (const imported of chunk.imports ?? []) visit(imported)
  }
  for (const source of sources) visit(source)
  return { css: [...css], js: [...js] }
}

/**
 * The chunks src/main.tsx always loads at boot: App (a shared chunk, so the
 * manifest keys it by chunk name, not by source path) and the error boundary.
 */
export function bootChunkKeys(manifest) {
  const entry = Object.entries(manifest).find(([, chunk]) => chunk.isEntry)?.[1]
  const appKey = manifest['src/App.tsx']
    ? 'src/App.tsx'
    : (entry?.dynamicImports ?? []).find((key) => manifest[key]?.name === 'App')
  if (!appKey) throw new Error('The Vite manifest has no App chunk')
  return [appKey, ERROR_BOUNDARY_SOURCE]
}

export function composePrerenderedPage(shell, route, rendered, assets = { css: [], js: [] }) {
  if (!rendered.title) throw new Error(`${route.path} rendered without a <title>`)
  if (!rendered.html.trim()) throw new Error(`${route.path} rendered no markup`)
  if (!shell.includes(EMPTY_ROOT)) throw new Error('dist/index.html has no empty #root')

  const linked = new Set([...shell.matchAll(/(?:href|src)="([^"]+)"/gu)].map((match) => match[1]))
  const assetTags = [
    ...assets.css.filter((href) => !linked.has(href)).map((href) => `<link rel="stylesheet" crossorigin href="${escapeHtml(href)}">`),
    ...assets.js.filter((href) => !linked.has(href)).map((href) => `<link rel="modulepreload" crossorigin href="${escapeHtml(href)}">`),
  ]
  const base = route.path === '/' ? shell : keepOrganizationOnly(shell)
  const headAdditions = [rendered.head, ...assetTags].filter(Boolean).join('\n    ')
  return base
    .replace(/<title>[\s\S]*?<\/title>/iu, `<title>${escapeHtml(rendered.title)}</title>`)
    .replace('</head>', `    ${headAdditions}\n  </head>`)
    .replace(EMPTY_ROOT, `<div id="root" data-prerendered="${escapeHtml(route.path)}">${rendered.html}</div>`)
}

/**
 * Public rows a page shows, fetched with the browser's own anon key. The same
 * request the page makes; missing credentials or a failed request leave the
 * section in its loading state rather than failing the build.
 */
async function fetchPrerenderData(env = process.env) {
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim()
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!supabaseUrl || !anonKey) {
    process.stdout.write('prerender: no public Supabase config, data-driven sections render their loading state\n')
    return {}
  }
  try {
    const url = new URL('/rest/v1/guest_resources', supabaseUrl)
    url.searchParams.set('select', '*')
    url.searchParams.set('order', 'display_order.asc,created_at.desc')
    const response = await fetch(url, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`guest_resources responded ${response.status}`)
    const rows = await response.json()
    return Array.isArray(rows) ? { guestResources: rows } : {}
  } catch (error) {
    process.stdout.write(`prerender: public data unavailable (${error instanceof Error ? error.message : 'unknown error'}), rendering loading states\n`)
    return {}
  }
}

async function main() {
  const mode = parseMode(process.argv)
  const manifest = JSON.parse(await readFile(path.join(MANIFEST_DIR, 'manifest.json'), 'utf8'))

  await rm(SSR_OUT, { recursive: true, force: true })
  await build({
    root: ROOT,
    mode,
    logLevel: 'warn',
    plugins: [stubSupabase],
    build: {
      ssr: path.join(ROOT, 'src', 'prerender', 'entry.tsx'),
      outDir: SSR_OUT,
      emptyOutDir: true,
      copyPublicDir: false,
      manifest: false,
      sourcemap: false,
      minify: false,
    },
    // Bundle every dependency so CSS imports and ESM-only packages resolve the
    // same way they do in the browser build.
    ssr: { noExternal: true },
  })

  const entry = await import(pathToFileURL(path.join(SSR_OUT, 'entry.js')).href)
  const shell = await readFile(path.join(DIST, 'index.html'), 'utf8')
  const data = await fetchPrerenderData()
  const outDir = path.join(DIST, 'prerender')
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  const bootKeys = bootChunkKeys(manifest)
  for (const route of entry.PRERENDERED_ROUTES) {
    const assets = chunkAssets(manifest, [...bootKeys, route.source])
    const page = composePrerenderedPage(shell, route, entry.renderMarketingPage(route, data), assets)
    await writeFile(path.join(outDir, route.file), page, 'utf8')
    process.stdout.write(`prerendered ${route.path} -> dist/prerender/${route.file} (${Buffer.byteLength(page)} bytes)\n`)
  }

  // The manifest only feeds this script; it is not a public file.
  await rm(MANIFEST_DIR, { recursive: true, force: true })
  await rm(SSR_OUT, { recursive: true, force: true })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('[prerender-marketing] failed:', error)
    process.exit(1)
  })
}
