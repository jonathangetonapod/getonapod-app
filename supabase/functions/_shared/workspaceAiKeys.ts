// Workspace AI settings accept Claude and OpenAI. Other research and infrastructure
// providers use server secrets; Instantly has its own agency connection flow.
// Workspace credentials reuse the Instantly AES-GCM storage machinery.

import { createAdminClient, HttpError, requireWorkspaceSubscription } from './workspaceAuth.ts'
import { type TextAiKey, type TextAiProvider } from './textAi.ts'
import { decryptInstantlyApiKey, encryptInstantlyApiKey } from './instantly.ts'

export type AiProvider = 'anthropic' | 'openai' | 'winnr' | 'blitz' | 'podscan'

export interface ResolvedAiKey {
  apiKey: string
  source: 'workspace' | 'platform'
}

const PLATFORM_ENV: Record<AiProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  winnr: 'WINNR_API_TOKEN',
  blitz: 'BLITZ_API_KEY',
  podscan: 'PODSCAN_API_KEY',
}

export function requireProvider(value: unknown): TextAiProvider {
  if (value === 'anthropic' || value === 'openai') return value
  throw new HttpError(400, 'INVALID_PROVIDER', 'Only Claude and OpenAI keys can be managed here')
}

export async function storeWorkspaceAiKey(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  provider: TextAiProvider,
  apiKey: string,
  actorUserId: string,
): Promise<void> {
  const encrypted = await encryptInstantlyApiKey(apiKey)
  const { error } = await admin
    .from('workspace_ai_credentials')
    .upsert({
      workspace_id: workspaceId,
      provider,
      api_key_ciphertext: encrypted.ciphertext,
      api_key_iv: encrypted.iv,
      api_key_last_four: apiKey.slice(-4),
      created_by: actorUserId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,provider' })
  if (error) {
    throw new HttpError(503, 'AI_KEY_STORAGE_UNAVAILABLE', 'The API key could not be stored')
  }
}

export async function clearWorkspaceAiKey(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  provider: AiProvider,
): Promise<void> {
  const { error } = await admin
    .from('workspace_ai_credentials')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
  if (error) {
    throw new HttpError(503, 'AI_KEY_STORAGE_UNAVAILABLE', 'The API key could not be removed')
  }
}

export async function workspaceAiKeyStatus(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
): Promise<Record<TextAiProvider, { configured: boolean; last_four: string | null; updated_at: string | null }>> {
  const { data, error } = await admin
    .from('workspace_ai_credentials')
    .select('provider, api_key_last_four, updated_at')
    .eq('workspace_id', workspaceId)
  if (error) {
    throw new HttpError(503, 'AI_KEY_STORAGE_UNAVAILABLE', 'API key status is unavailable')
  }
  const status: Record<TextAiProvider, { configured: boolean; last_four: string | null; updated_at: string | null }> = {
    anthropic: { configured: false, last_four: null, updated_at: null },
    openai: { configured: false, last_four: null, updated_at: null },
  }
  for (const row of (data ?? []) as Array<{ provider?: unknown; api_key_last_four?: unknown; updated_at?: unknown }>) {
    const provider = row.provider
    if (provider === 'anthropic' || provider === 'openai') {
      status[provider] = {
        configured: true,
        last_four: typeof row.api_key_last_four === 'string' ? row.api_key_last_four : null,
        updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
      }
    }
  }
  return status
}

// Infrastructure/embedding credential resolution. OpenAI here is the platform
// embedding account. Text generation must use resolveTextAiKey instead.
// The explicit Anthropic path remains for legacy callers, without a platform fallback.
export async function resolveAiKey(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string | null,
  provider: AiProvider,
): Promise<ResolvedAiKey | null> {
  if (workspaceId) {
    await requireWorkspaceSubscription(admin, workspaceId)
    if (provider === 'anthropic') {
      const stored = await readStoredAiKey(admin, workspaceId, provider)
      if (stored.apiKey) return { apiKey: stored.apiKey, source: 'workspace' }
      throw new HttpError(409, 'PROVIDER_KEY_REQUIRED', 'Ask your workspace owner to connect a Claude key in Billing → Provider accounts. Claude usage is billed by Anthropic.')
    }
  }
  const platformKey = Deno.env.get(PLATFORM_ENV[provider])?.trim()
  if (platformKey) return { apiKey: platformKey, source: 'platform' }
  if (workspaceId) throw new HttpError(503, 'PLATFORM_PROVIDER_NOT_CONFIGURED', 'This service is not configured on the platform. Contact support; no additional API key is needed from your workspace.')
  return null
}

export type AiKeyProbeResult = 'valid' | 'invalid' | 'unreachable'

export interface StoredAiKey {
  /** A row exists for this provider. */
  configured: boolean
  /** The decrypted key; null only when there is no row. */
  apiKey: string | null
}

// The workspace's own key only, never the platform's. Storage failures are
// distinct from missing keys so users are not told to replace valid credentials.
export async function readStoredAiKey(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  provider: AiProvider,
): Promise<StoredAiKey> {
  const { data, error } = await admin
    .from('workspace_ai_credentials')
    .select('api_key_ciphertext, api_key_iv')
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .maybeSingle()
  if (error) throw new HttpError(503, 'AI_KEY_STORAGE_UNAVAILABLE', 'Provider connections could not be read. Try again shortly; your saved keys have not changed.')
  if (!data) return { configured: false, apiKey: null }
  try {
    if (typeof data.api_key_ciphertext !== 'string' || !data.api_key_ciphertext.trim()
      || typeof data.api_key_iv !== 'string' || !data.api_key_iv.trim()) {
      throw new Error('Stored credential is incomplete')
    }
    const apiKey = await decryptInstantlyApiKey({
      ciphertext: data.api_key_ciphertext,
      iv: data.api_key_iv,
    })
    if (!apiKey.trim()) throw new Error('Stored credential is empty')
    return { configured: true, apiKey: apiKey.trim() }
  } catch (_error) {
    console.error('[Workspace AI Keys] Stored key undecryptable')
    throw new HttpError(503, 'PROVIDER_CONNECTION_UNAVAILABLE', 'Your saved provider connection could not be read. Contact support before replacing the key.')
  }
}

// Cheap live validation: both providers expose a models listing that
// authenticates without incurring generation cost. Only an authentication
// refusal says the key is bad; a timeout, an outage or a rate limit says
// nothing about it, and calling that "invalid" invites deleting a good key.
export async function probeAiKeyResult(
  provider: AiProvider,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<AiKeyProbeResult> {
  try {
    const response = provider === 'anthropic'
      ? await fetcher('https://api.anthropic.com/v1/models?limit=1', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(10_000),
      })
      : await fetcher('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      })
    if (response.ok) return 'valid'
    return response.status === 401 || response.status === 403 ? 'invalid' : 'unreachable'
  } catch (_error) {
    return 'unreachable'
  }
}

// Before storing a key: anything but a clear yes refuses it, as it always has.
export async function probeAiKey(provider: AiProvider, apiKey: string): Promise<boolean> {
  return await probeAiKeyResult(provider, apiKey) === 'valid'
}

/** Explicit preferences never silently fall back to another provider or platform key. */
export async function workspaceTextAiPreference(admin: ReturnType<typeof createAdminClient>, workspaceId: string): Promise<TextAiProvider | null> {
  const { data, error } = await admin.from('workspaces').select('default_ai_provider').eq('id', workspaceId).single()
  if (error || !data) throw new HttpError(503, 'AI_SETTINGS_UNAVAILABLE', 'AI provider settings could not be read. Try again or contact support.')
  return data.default_ai_provider === 'anthropic' || data.default_ai_provider === 'openai' ? data.default_ai_provider : null
}

export async function resolveTextAiKey(admin: ReturnType<typeof createAdminClient>, workspaceId: string): Promise<TextAiKey> {
  await requireWorkspaceSubscription(admin, workspaceId)
  const preferred = await workspaceTextAiPreference(admin, workspaceId)
  const providers: TextAiProvider[] = preferred ? [preferred] : ['anthropic', 'openai']
  for (const provider of providers) {
    const stored = await readStoredAiKey(admin, workspaceId, provider)
    if (stored.apiKey) return { apiKey: stored.apiKey, source: 'workspace', provider }
  }
  throw new HttpError(409, 'PROVIDER_KEY_REQUIRED', preferred
    ? `Connect the selected ${preferred === 'openai' ? 'OpenAI' : 'Claude'} key in Billing, or choose another AI provider.`
    : 'Connect a Claude or OpenAI key in Billing to use AI features.')
}

export async function setWorkspaceTextAiProvider(admin: ReturnType<typeof createAdminClient>, workspaceId: string, provider: TextAiProvider): Promise<void> {
  const stored = await readStoredAiKey(admin, workspaceId, provider)
  if (!stored.apiKey) throw new HttpError(409, 'PROVIDER_KEY_REQUIRED', 'Save a key for this provider before selecting it.')
  const { error } = await admin.from('workspaces').update({ default_ai_provider: provider }).eq('id', workspaceId)
  if (error) throw new HttpError(503, 'AI_SETTINGS_UNAVAILABLE', 'The default AI provider could not be saved.')
}
