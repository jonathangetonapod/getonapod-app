import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { once } from 'node:events'
import {
  bootChunkKeys,
  chunkAssets,
  composePrerenderedPage,
  keepOrganizationOnly,
} from './prerender-marketing.mjs'
import {
  buildContentSecurityPolicy,
  canonicalRedirectPath,
  clientDashboardShareShell,
  generateOnboardingPreviewPng,
  loadClientDashboardShareMetadata,
  loadOnboardingShareMetadata,
  marketingPageShell,
  neutralApplicationShell,
  publicFileCacheControl,
  whiteLabelOnboardingShell,
} from './serve-production.mjs'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
assert.equal(
  packageJson.scripts?.start,
  'node scripts/serve-production.mjs',
  'npm start must use the production header-aware server',
)

const capability = `11111111-1111-4111-8111-111111111111.1.${'A'.repeat(43)}`
let metadataRequest
const brandedMetadata = await loadOnboardingShareMetadata(capability, {
  supabaseUrl: 'https://project.supabase.co',
  fetchImpl: async (url, options) => {
    metadataRequest = { url, options }
    return new Response(JSON.stringify({
      metadata: {
        workspace: {
          name: 'Iveth & <Partners>',
          logo_url: 'https://project.supabase.co/storage/v1/object/public/workspace-logos/iveth/logo.webp?version=1&size=large',
        },
        accent_color: '#BE185D',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  },
})
assert.deepEqual(brandedMetadata, {
  workspaceName: 'Iveth & <Partners>',
  accentColor: '#BE185D',
  logoUrl: 'https://project.supabase.co/storage/v1/object/public/workspace-logos/iveth/logo.webp?version=1&size=large',
})
assert.equal(metadataRequest.url, 'https://project.supabase.co/functions/v1/client-onboarding')
assert.deepEqual(JSON.parse(metadataRequest.options.body), { action: 'metadata', token: capability })
assert.equal(metadataRequest.options.redirect, 'error')

let clientMetadataRequest
const clientMetadata = await loadClientDashboardShareMetadata('dallas-fontaine-a0fd037530f8577cc03eb87b', {
  supabaseUrl: 'https://project.supabase.co',
  fetchImpl: async (url, options) => {
    clientMetadataRequest = { url, options }
    return new Response(JSON.stringify({
      metadata: {
        name: 'Dallas <Fontaine>',
        dashboard_tagline: 'Lead with practical insight & build lasting authority.',
        workspace: {
          name: 'Northstar & <Advisory>',
          logo_url: 'https://project.supabase.co/storage/v1/object/public/workspace-logos/northstar/logo.webp',
          primary_color: '#16324F',
          accent_color: '#E07A5F',
        },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  },
})
assert.deepEqual(clientMetadata, {
  clientName: 'Dallas <Fontaine>',
  tagline: 'Lead with practical insight & build lasting authority.',
  workspaceName: 'Northstar & <Advisory>',
  logoUrl: 'https://project.supabase.co/storage/v1/object/public/workspace-logos/northstar/logo.webp',
  primaryColor: '#16324F',
  accentColor: '#E07A5F',
})
assert.equal(clientMetadataRequest.url, 'https://project.supabase.co/functions/v1/public-client-dashboard')
assert.deepEqual(JSON.parse(clientMetadataRequest.options.body), {
  action: 'metadata',
  slug: 'dallas-fontaine-a0fd037530f8577cc03eb87b',
})
assert.equal(clientMetadataRequest.options.redirect, 'error')

const fallbackActions = []
const fallbackClientMetadata = await loadClientDashboardShareMetadata('legacy-client-link', {
  supabaseUrl: 'https://project.supabase.co',
  fetchImpl: async (_url, options) => {
    const action = JSON.parse(options.body).action
    fallbackActions.push(action)
    if (action === 'metadata') return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 })
    return new Response(JSON.stringify({
      dashboard: { name: 'Legacy Client', dashboard_tagline: null },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  },
})
assert.deepEqual(fallbackActions, ['metadata', 'get'])
assert.deepEqual(fallbackClientMetadata, {
  clientName: 'Legacy Client',
  tagline: null,
  workspaceName: 'Your podcast team',
  logoUrl: null,
  primaryColor: '#0D1B2A',
  accentColor: '#C7794F',
})

const shellSource = '<!doctype html><html><head><title>Marketing</title><link rel="icon" href="/favicon.svg" /><link rel="manifest" href="/site.webmanifest" /><meta property="og:title" content="Marketing" /><meta name="twitter:title" content="Marketing" /><script type="application/ld+json">{"name":"Marketing"}</script></head><body></body></html>'
const brandedShell = whiteLabelOnboardingShell(shellSource, brandedMetadata, {
  previewImageUrl: 'https://getonapod.com/onboarding-link-preview.png?accent=BE185D',
  fallbackIconUrl: 'https://getonapod.com/onboarding-link-icon.png?accent=BE185D',
})
assert.match(brandedShell, /<title>Iveth &amp; &lt;Partners&gt; · Client onboarding<\/title>/u)
assert.match(brandedShell, /property="og:title" content="Complete your client intake"/u)
assert.match(brandedShell, /property="og:site_name" content="Iveth &amp; &lt;Partners&gt;"/u)
assert.match(brandedShell, /property="og:image" content="https:\/\/getonapod\.com\/onboarding-link-preview\.png\?accent=BE185D"/u)
assert.match(brandedShell, /rel="apple-touch-icon"[^>]+iveth\/logo\.webp\?version=1&amp;size=large/u)
assert.doesNotMatch(brandedShell, /11111111-1111-4111-8111-111111111111|Get On A Pod|application\/ld\+json/iu)

const clientShell = clientDashboardShareShell(shellSource, clientMetadata, {
  pageUrl: 'https://getonapod.com/client/dallas-fontaine-a0fd037530f8577cc03eb87b?preview=1',
  previewImageUrl: 'https://getonapod.com/client-dashboard-share.png',
  fallbackIconUrl: 'https://getonapod.com/onboarding-link-icon.png?accent=16324F',
})
assert.match(clientShell, /<title>Dallas &lt;Fontaine&gt;&#39;s podcast opportunities \| Northstar &amp; &lt;Advisory&gt;<\/title>/u)
assert.match(clientShell, /property="og:title" content="A podcast shortlist prepared for Dallas &lt;Fontaine&gt;"/u)
assert.match(clientShell, /property="og:description" content="Lead with practical insight &amp; build lasting authority\."/u)
assert.match(clientShell, /property="og:site_name" content="Northstar &amp; &lt;Advisory&gt;"/u)
assert.match(clientShell, /property="og:image" content="https:\/\/getonapod\.com\/client-dashboard-share\.png"/u)
assert.match(clientShell, /property="og:url" content="https:\/\/getonapod\.com\/client\/dallas-fontaine-a0fd037530f8577cc03eb87b\?preview=1"/u)
assert.match(clientShell, /name="robots" content="noindex, nofollow, noarchive"/u)
assert.match(clientShell, /rel="icon" href="https:\/\/project\.supabase\.co\/storage\/v1\/object\/public\/workspace-logos\/northstar\/logo\.webp"/u)
assert.doesNotMatch(clientShell, /application\/ld\+json|content="Marketing"|Get On A Pod|site\.webmanifest|favicon\.svg/iu)

{
  const marketingSource = '<!doctype html><html><head><meta name="application-name" content="Get On A Pod" /><meta name="apple-mobile-web-app-title" content="Get On A Pod" /><link rel="icon" type="image/svg+xml" href="/favicon.svg" /><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" /><link rel="manifest" href="/site.webmanifest" /><title>Podcast booking | Get On A Pod</title><!-- Structured Data --><script type="application/ld+json">{"@type":"Organization","name":"Get On A Pod"}</script><script type="application/ld+json">{"@type":"FAQPage"}</script></head><body></body></html>'
  for (const route of ['/portal/login', '/portal/dashboard', '/prospect/private-capability']) {
    const shell = neutralApplicationShell(marketingSource, route)
    assert.doesNotMatch(shell, /Get On A Pod|application\/ld\+json|favicon\.svg|apple-touch-icon\.png|site\.webmanifest/iu, route)
    assert.match(shell, /<link rel="icon" href="data:," \/>/u, route)
  }
  assert.match(neutralApplicationShell(marketingSource, '/portal/login'), /<title>Client portal<\/title>/u)
  const agencyShell = neutralApplicationShell(marketingSource, '/app/clients')
  assert.doesNotMatch(agencyShell, /application\/ld\+json|Podcast booking/iu, 'the agency app drops the marketing head')
  assert.match(agencyShell, /<title>Get On A Pod<\/title>/u)
  assert.match(agencyShell, /favicon\.svg/u, 'the agency app keeps the platform icon')

  const builtIndex = readFileSync('index.html', 'utf8')
  for (const type of ['Organization', 'Service', 'FAQPage']) {
    assert.match(builtIndex, new RegExp(`"@type": "${type}"`, 'u'), `index.html must keep the ${type} JSON-LD for /`)
  }
  const marketingShell = marketingPageShell(builtIndex)
  assert.match(marketingShell, /"@type": "Organization"/u, 'marketing pages keep the Organization JSON-LD')
  assert.doesNotMatch(marketingShell, /"@type": "(?:Service|FAQPage)"/u, 'only / may carry the Service and FAQ JSON-LD')
  assert.match(marketingShell, /<title>Get On A Pod<\/title>/u, 'marketing pages drop the homepage title')
  assert.doesNotMatch(marketingShell, /Podcast booking for tech founders/u)
  assert.doesNotMatch(neutralApplicationShell(builtIndex, '/portal/login'), /Get On A Pod|application\/ld\+json/iu)
  assert.doesNotMatch(neutralApplicationShell(builtIndex, '/prospect/abc'), /Get On A Pod|application\/ld\+json/iu)
}

{
  // Trailing-slash duplicates of indexable pages redirect; nothing else does.
  assert.equal(canonicalRedirectPath('/platform/'), '/platform')
  assert.equal(canonicalRedirectPath('/blog/some-post/'), '/blog/some-post')
  assert.equal(canonicalRedirectPath('/what-to-expect//'), '/what-to-expect')
  assert.equal(canonicalRedirectPath('/'), null)
  assert.equal(canonicalRedirectPath('/platform'), null)
  assert.equal(canonicalRedirectPath('/app/clients/'), null)
  assert.equal(canonicalRedirectPath('/portal/'), null)

  assert.equal(publicFileCacheControl('/assets/index-abc123.js'), 'public, max-age=31536000, immutable')
  assert.equal(publicFileCacheControl('/shows/saastr.webp'), 'public, max-age=86400')
  assert.equal(publicFileCacheControl('/sitemap.xml'), 'public, max-age=3600')
}

{
  const manifest = {
    'index.html': { file: 'assets/index-1.js', css: ['assets/index-1.css'], isEntry: true, dynamicImports: ['_App-1.js', 'src/components/ErrorBoundary.tsx'] },
    '_App-1.js': { file: 'assets/App-1.js', name: 'App', isDynamicEntry: true, imports: ['index.html', '_button-1.js'], css: ['assets/App-1.css'] },
    '_button-1.js': { file: 'assets/button-1.js' },
    'src/components/ErrorBoundary.tsx': { file: 'assets/ErrorBoundary-1.js', imports: ['index.html'] },
    'src/pages/Clips.tsx': { file: 'assets/Clips-1.js', isDynamicEntry: true, imports: ['_App-1.js'], css: ['assets/Clips-1.css'], dynamicImports: ['_lazy-1.js'] },
    '_lazy-1.js': { file: 'assets/lazy-1.js', css: ['assets/lazy-1.css'] },
  }
  const bootKeys = bootChunkKeys(manifest)
  assert.deepEqual(bootKeys, ['_App-1.js', 'src/components/ErrorBoundary.tsx'])
  const assets = chunkAssets(manifest, [...bootKeys, 'src/pages/Clips.tsx'])
  assert.deepEqual(assets.css.sort(), ['/assets/App-1.css', '/assets/Clips-1.css', '/assets/index-1.css'])
  assert.ok(assets.js.includes('/assets/Clips-1.js') && assets.js.includes('/assets/button-1.js'))
  assert.ok(!assets.js.includes('/assets/lazy-1.js'), 'dynamic imports load on demand, not at boot')

  const shell = '<!doctype html><html><head><title>Podcast booking for tech founders | Get On A Pod</title><script type="application/ld+json">{"@type":"Organization"}</script><script type="application/ld+json">{"@type":"FAQPage"}</script><script type="module" crossorigin src="/assets/index-1.js"></script><link rel="stylesheet" crossorigin href="/assets/index-1.css"></head><body><div id="root"></div></body></html>'
  assert.doesNotMatch(keepOrganizationOnly(shell), /FAQPage/u)
  const page = composePrerenderedPage(shell, { path: '/clips' }, {
    title: 'Clips & <more>',
    head: '<link data-rh="true" rel="canonical" href="https://getonapod.com/clips"/>',
    html: '<main><h1>Five clips</h1></main>',
  }, assets)
  assert.match(page, /<title>Clips &amp; &lt;more&gt;<\/title>/u)
  assert.match(page, /<div id="root" data-prerendered="\/clips"><main><h1>Five clips<\/h1><\/main><\/div>/u)
  assert.match(page, /rel="canonical" href="https:\/\/getonapod\.com\/clips"/u)
  assert.match(page, /<link rel="stylesheet" crossorigin href="\/assets\/Clips-1\.css">/u)
  assert.match(page, /<link rel="modulepreload" crossorigin href="\/assets\/Clips-1\.js">/u)
  assert.equal(page.match(/index-1\.css/gu).length, 1, 'a stylesheet the shell already links is not linked twice')
  assert.match(page, /"@type":"Organization"/u)
  assert.doesNotMatch(page, /FAQPage|Podcast booking for tech founders/u, 'only / keeps the homepage head')
  const home = composePrerenderedPage(shell, { path: '/' }, { title: 'Home', head: '', html: '<main>Home</main>' })
  assert.match(home, /FAQPage/u, '/ keeps its FAQ structured data')
  assert.throws(() => composePrerenderedPage(shell, { path: '/clips' }, { title: '', head: '', html: '<main></main>' }), /without a <title>/u)
  assert.throws(() => composePrerenderedPage(shell, { path: '/clips' }, { title: 'Clips', head: '', html: ' ' }), /no markup/u)
}

const generatedPreview = generateOnboardingPreviewPng('#BE185D')
assert.deepEqual([...generatedPreview.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
assert.equal(generatedPreview.readUInt32BE(16), 1200)
assert.equal(generatedPreview.readUInt32BE(20), 630)

{
  const policy = buildContentSecurityPolicy({
    supabaseUrl: 'https://api.example-project.dev/rest/v1',
    sentryDsn: 'https://public@o1.ingest.us.sentry.io/2',
  })
  const csp = cspDirectives(policy)
  assert.ok(csp.get('connect-src').includes('https://api.example-project.dev'), 'a custom Supabase origin must be connectable')
  assert.ok(csp.get('connect-src').includes('wss://api.example-project.dev'), 'a custom Supabase origin must allow realtime')
  assert.ok(csp.get('connect-src').includes('https://o1.ingest.us.sentry.io'), 'the Sentry DSN host must be connectable')
  assert.doesNotMatch(policy, /'unsafe-eval'|\*;|\s\*\s/u, 'the policy must not allow eval or a bare wildcard')
  assert.doesNotMatch(buildContentSecurityPolicy({ supabaseUrl: 'javascript:alert(1)' }), /javascript:/u)
}

const port = await availablePort()
const origin = `http://127.0.0.1:${port}`
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const child = spawn(npmCommand, ['--silent', 'start'], {
  cwd: process.cwd(),
  detached: process.platform !== 'win32',
  env: {
    LANG: 'C.UTF-8',
    NODE_ENV: 'production',
    PATH: process.env.PATH ?? '',
    PORT: String(port),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
const collect = (chunk) => {
  if (output.length < 65_536) output += chunk.toString('utf8').slice(0, 65_536 - output.length)
}
child.stdout.on('data', collect)
child.stderr.on('data', collect)

try {
  await waitForServer(child, origin)

  const privateRoutes = [
    '/client/private-capability',
    '/prospect/private-capability/extra',
    '/accept-invite?code=private-code',
    '/admin/callback?code=private-code',
    '/admin/clients',
    '/admin/workspace-users',
    '/admin/workspaces/11111111-1111-4111-8111-111111111111/clients',
    '/admin/workspaces/11111111-1111-4111-8111-111111111111/guest-resources',
    '/admin/workspaces/11111111-1111-4111-8111-111111111111/onboarding',
    '/app/clients',
    '/app/guest-resources',
    '/app/onboarding',
    '/onboarding/11111111-1111-4111-8111-111111111111.1.private-capability',
    '/change-password',
    '/portal/dashboard',
    '/portal/resources',
    '/unknown-route',
  ]

  for (const route of privateRoutes) {
    const response = await fetch(`${origin}${route}`)
    assert.equal(response.status, 200, route)
    assertSecurityHeaders(response, route)
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive', route)
    assert.equal(response.headers.get('cache-control'), 'private, no-store', route)
  }

  const onboardingShell = await fetch(`${origin}/onboarding/11111111-1111-4111-8111-111111111111.1.private-capability`)
  const onboardingHtml = await onboardingShell.text()
  assert.ok(Buffer.byteLength(onboardingHtml) < 1_000_000, 'Messages main-resource metadata response must stay under 1 MB')
  assert.match(onboardingHtml, /<title>Client services · Client onboarding<\/title>/u)
  assert.match(onboardingHtml, /Complete your private onboarding securely with Client services\./u)
  assert.match(onboardingHtml, /property="og:title" content="Complete your client intake"/u)
  assert.match(onboardingHtml, /property="og:image" content="http:\/\/127\.0\.0\.1:[0-9]+\/onboarding-link-preview\.png\?accent=334155"/u)
  assert.match(onboardingHtml, /name="twitter:card" content="summary_large_image"/u)
  assert.doesNotMatch(onboardingHtml, /Get On A Pod|getonapod\.com/iu)
  assert.doesNotMatch(onboardingHtml, /application\/ld\+json|property="og:url"|name="twitter:url"/iu)

  for (const route of ['/portal/login', '/portal/dashboard', '/prospect/private-capability']) {
    const html = await (await fetch(`${origin}${route}`)).text()
    assert.doesNotMatch(html, /Get On A Pod|getonapod\.com|application\/ld\+json|site\.webmanifest/iu, route)
  }
  {
    const html = await (await fetch(`${origin}/app/clients`)).text()
    assert.doesNotMatch(html, /application\/ld\+json/iu, '/app/clients must not carry the marketing structured data')
  }

  const previewImage = await fetch(`${origin}/onboarding-link-preview.png?accent=BE185D`)
  assert.equal(previewImage.status, 200)
  assertSecurityHeaders(previewImage, '/onboarding-link-preview.png')
  assert.equal(previewImage.headers.get('content-type'), 'image/png')
  assert.match(previewImage.headers.get('cache-control') ?? '', /^public, max-age=/u)
  const previewBytes = Buffer.from(await previewImage.arrayBuffer())
  assert.ok(previewBytes.length < 10_000_000, 'Messages preview assets must stay under 10 MB')
  assert.equal(previewBytes.readUInt32BE(16), 1200)
  assert.equal(previewBytes.readUInt32BE(20), 630)

  const previewIcon = await fetch(`${origin}/onboarding-link-icon.png?accent=BE185D`)
  assert.equal(previewIcon.status, 200)
  const iconBytes = Buffer.from(await previewIcon.arrayBuffer())
  assert.equal(iconBytes.readUInt32BE(16), 180)
  assert.equal(iconBytes.readUInt32BE(20), 180)

  const clientPreviewImage = await fetch(`${origin}/client-dashboard-share.png`)
  assert.equal(clientPreviewImage.status, 200)
  assertSecurityHeaders(clientPreviewImage, '/client-dashboard-share.png')
  assert.equal(clientPreviewImage.headers.get('content-type'), 'image/png')
  const clientPreviewBytes = Buffer.from(await clientPreviewImage.arrayBuffer())
  assert.ok(clientPreviewBytes.length < 10_000_000, 'Client dashboard preview assets must stay under 10 MB')
  assert.equal(clientPreviewBytes.readUInt32BE(16), 1200)
  assert.equal(clientPreviewBytes.readUInt32BE(20), 630)

  let indexHtml = ''
  // Every page in the sitemap must be indexable and cacheable.
  for (const route of ['/', '/platform', '/clips', '/privacy', '/terms', '/blog', '/resources', '/blog/example-post', '/what-to-expect']) {
    const response = await fetch(`${origin}${route}`)
    assert.equal(response.status, 200, route)
    assertSecurityHeaders(response, route)
    assert.equal(response.headers.get('x-robots-tag'), null, route)
    assert.notEqual(response.headers.get('cache-control'), 'private, no-store', route)
    const html = await response.text()
    if (route === '/') {
      indexHtml = html
      continue
    }
    assert.doesNotMatch(html, /"@type": "(?:Service|FAQPage)"/u, `${route} must not carry the homepage FAQ or Service structured data`)
    assert.doesNotMatch(html, /Podcast booking for tech founders/u, `${route} must not carry the homepage title`)
    assert.match(html, /"@type": "Organization"/u, `${route} keeps the Organization structured data`)
  }
  // Every indexable marketing page is served prerendered: its own copy,
  // title, description and canonical URL in the HTML, before any script runs.
  for (const route of ['/', '/platform', '/clips', '/resources', '/blog', '/what-to-expect', '/privacy', '/terms']) {
    const html = await (await fetch(`${origin}${route}`)).text()
    assert.ok(html.includes(`<div id="root" data-prerendered="${route}">`), `${route} must be served prerendered`)
    assert.match(html, /<h1[\s>]/u, `${route} must carry its heading in the HTML`)
    assert.equal(html.match(/<link[^>]+rel="canonical"/gu)?.length, 1, `${route} must have exactly one canonical link`)
    assert.ok(html.includes(`rel="canonical" href="https://getonapod.com${route}"`), `${route} must be canonical to itself`)
    assert.equal(html.match(/<meta[^>]+name="description"/gu)?.length, 1, `${route} must have exactly one description`)
    assert.match(html, /property="og:title"/u, `${route} must carry its social card`)
    assert.equal(html.match(/<title>/gu)?.length, 1, `${route} must have exactly one title`)
  }

  for (const [route, location] of [['/platform/', '/platform'], ['/blog/?ref=x', '/blog?ref=x'], ['/blog/some-post/', '/blog/some-post']]) {
    const response = await fetch(`${origin}${route}`, { redirect: 'manual' })
    assert.equal(response.status, 301, route)
    assert.equal(response.headers.get('location'), location, route)
  }
  assert.equal((await fetch(`${origin}/app/clients/`, { redirect: 'manual' })).status, 200, 'app routes are not redirected')

  {
    const response = await fetch(`${origin}/prerender/platform.html`)
    assert.equal(response.status, 404, 'prerendered files are served only under their page URL')
  }

  for (const directory of ['shots', 'shows', 'testimonials', 'people']) {
    const file = readdirSync(`dist/${directory}`).find((name) => /\.(?:png|jpe?g|webp)$/u.test(name))
    assert.ok(file, `dist/${directory} must hold the landing images`)
    const response = await fetch(`${origin}/${directory}/${file}`)
    assert.equal(response.status, 200, file)
    assert.equal(response.headers.get('x-robots-tag'), null, `${file} is a public marketing image`)
    assert.equal(response.headers.get('cache-control'), 'public, max-age=86400', file)
  }
  assert.equal((await fetch(`${origin}/clips-og.png`)).headers.get('x-robots-tag'), null, 'the clips social card is public')

  assert.match(indexHtml, /application\/ld\+json/u, '/ must keep its structured data for crawlers')
  assert.match(indexHtml, /"@type": "FAQPage"/u, '/ must keep its FAQ structured data')

  const assetPath = indexHtml.match(/src="(\/assets\/[^"]+\.js)"/u)?.[1]
  assert.ok(assetPath, 'built index must reference a hashed JavaScript asset')
  const asset = await fetch(`${origin}${assetPath}`)
  assert.equal(asset.status, 200, assetPath)
  assertSecurityHeaders(asset, assetPath)
  assert.equal(asset.headers.get('x-robots-tag'), null, assetPath)
  assert.match(asset.headers.get('content-type') ?? '', /javascript/u, assetPath)
  assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable', 'hashed assets never change')

  const missingStaticFiles = [
    '/assets/Node.js',
    '/assets/missing.js',
    '/assets/nested/missing.js',
    '/favicon-missing.svg',
    '/unknown.js',
  ]
  for (const route of missingStaticFiles) {
    const response = await fetch(`${origin}${route}`)
    assert.equal(response.status, 404, route)
    assertSecurityHeaders(response, route)
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive', route)
    assert.equal(response.headers.get('cache-control'), 'no-store', route)
    assert.match(response.headers.get('content-type') ?? '', /^text\/plain\b/u, route)
    assert.equal(await response.text(), 'Not Found', route)
  }

  process.stdout.write('npm start production routes, branded onboarding previews, assets, and security headers passed\n')
} catch (error) {
  if (output) process.stderr.write(`production server output:\n${output}\n`)
  throw error
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM')
    else child.kill('SIGTERM')
  }
  if (child.exitCode === null && child.signalCode === null) {
    await Promise.race([
      once(child, 'exit'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('production server did not stop')), 5_000)),
    ])
  }
}

function cspDirectives(policy) {
  return new Map(policy.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const [name, ...values] = part.split(/\s+/u)
    return [name, values]
  }))
}

function assertSecurityHeaders(response, route) {
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains', route)
  const policy = response.headers.get('content-security-policy')
  assert.ok(policy, `${route} must send a Content-Security-Policy`)
  const csp = cspDirectives(policy)
  assert.deepEqual(csp.get('frame-ancestors'), ["'none'"], route)
  assert.deepEqual(csp.get('object-src'), ["'none'"], route)
  assert.deepEqual(csp.get('base-uri'), ["'self'"], route)
  assert.deepEqual(csp.get('form-action'), ["'self'"], route)
  assert.deepEqual(csp.get('script-src'), ["'self'"], `${route} must not allow inline or third-party script`)
  assert.ok(csp.get('default-src')?.includes("'self'"), route)
  assert.ok(csp.get('connect-src')?.includes('https://*.supabase.co'), route)
  assert.ok(csp.get('connect-src')?.includes('wss://*.supabase.co'), route)
  assert.ok(csp.get('img-src')?.includes('https:'), `${route} must allow podcast artwork from any https CDN`)
  assert.ok(csp.get('style-src')?.includes("'unsafe-inline'"), route)
  assert.ok(csp.get('font-src')?.includes('https://fonts.gstatic.com'), route)
  for (const frame of ['https://www.loom.com', 'https://calendly.com', 'https://cal.com', 'https://www.youtube-nocookie.com']) {
    assert.ok(csp.get('frame-src')?.includes(frame), `${route} must allow ${frame} frames`)
  }
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer', route)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff', route)
  assert.equal(response.headers.get('x-frame-options'), 'DENY', route)
  assert.equal(
    response.headers.get('permissions-policy'),
    'camera=(), microphone=(), geolocation=(), payment=()',
    route,
  )
}

async function availablePort() {
  const probe = createServer()
  await new Promise((resolve, reject) => {
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', resolve)
  })
  const address = probe.address()
  assert.ok(address && typeof address === 'object')
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()))
  return address.port
}

async function waitForServer(processHandle, baseUrl) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null || processHandle.signalCode !== null) {
      throw new Error('production server exited during startup')
    }
    try {
      const response = await fetch(`${baseUrl}/__readiness__`)
      if (response.status === 200) return
    } catch {
      // Retry while npm and Node initialize.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('production server startup timed out')
}
