import {
  assertPublicWebhookUrl,
  isPrivateAddress,
  readLimitedText,
  WebhookTargetError,
  type DnsResolver,
} from './webhookTarget.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function rejects(url: string, resolver: DnsResolver | null = null): Promise<string> {
  try {
    await assertPublicWebhookUrl(url, resolver)
  } catch (error) {
    assert(error instanceof WebhookTargetError, `${url} must fail with WebhookTargetError`)
    return error.message
  }
  throw new Error(`${url} must be refused`)
}

const resolverFor = (answers: Record<string, string[]>): DnsResolver => async (hostname, recordType) => {
  const key = `${hostname} ${recordType}`
  if (!(key in answers)) {
    const error = new Error('no record')
    error.name = 'NotFound'
    throw error
  }
  return answers[key]
}

Deno.test('private, loopback and link-local literals are recognized', () => {
  for (const address of [
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', '[::ffff:127.0.0.1]',
    '::ffff:a9fe:a9fe', '64:ff9b::10.0.0.1',
  ]) {
    assert(isPrivateAddress(address), `${address} must be private`)
  }
  for (const address of ['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert(!isPrivateAddress(address), `${address} must be public`)
  }
})

Deno.test('only public https endpoints are accepted', async () => {
  assert((await rejects('http://hooks.example.com/x')).includes('https'), 'http is refused')
  await rejects('not a url')
  await rejects('https://user:pass@hooks.example.com/x')
  await rejects('https://hooks.example.com:8080/x')
  await rejects('https://localhost/x')
  await rejects('https://metadata.google.internal/computeMetadata')
  await rejects('https://127.0.0.1/x')
  await rejects('https://2130706433/x') // 127.0.0.1 written as one number
  await rejects('https://169.254.169.254/latest/meta-data')
  await rejects('https://[::1]/x')
  await rejects('https://[fd12:3456::1]/x')
  await rejects('https://intranet/x')

  const url = await assertPublicWebhookUrl('https://8.8.8.8/hook', null)
  assert(url.hostname === '8.8.8.8', 'a public IP literal is accepted')
  const named = await assertPublicWebhookUrl(
    ' https://hooks.example.com/outreach ',
    resolverFor({ 'hooks.example.com A': ['93.184.216.34'] }),
  )
  assert(named.href === 'https://hooks.example.com/outreach', 'a public host that resolves publicly is accepted')
})

Deno.test('a public name that resolves to a private address is refused', async () => {
  await rejects('https://rebind.example.com/x', resolverFor({ 'rebind.example.com A': ['10.0.0.5'] }))
  await rejects('https://rebind6.example.com/x', resolverFor({
    'rebind6.example.com A': ['93.184.216.34'],
    'rebind6.example.com AAAA': ['::1'],
  }))
  assert(
    (await rejects('https://missing.example.com/x', resolverFor({}))).includes('could not be found'),
    'an unresolvable host is refused',
  )
})

Deno.test('a runtime without DNS access still applies the literal checks', async () => {
  const unsupported: DnsResolver = () => {
    const error = new Error('not supported')
    error.name = 'NotSupported'
    return Promise.reject(error)
  }
  await assertPublicWebhookUrl('https://hooks.example.com/x', unsupported)
  await rejects('https://10.0.0.1/x', unsupported)
})

Deno.test('the stored response body is capped', async () => {
  const long = new Response('x'.repeat(10_000))
  const text = await readLimitedText(long, 4096)
  assert(text.startsWith('x'.repeat(4096)) && text.endsWith('[truncated]'), 'a long body is truncated')
  assert(!text.slice(0, 4097).includes('[truncated]x'), 'nothing past the cap is kept')
  assert(await readLimitedText(new Response('ok'), 4096) === 'ok', 'a short body is kept whole')
})
