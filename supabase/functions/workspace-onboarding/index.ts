import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  errorResponse,
  HttpError,
  jsonResponse,
  normalizeEmail,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireEmail,
  requireOnlyKeys,
  requireString,
  requireUuid,
  requireWorkspaceFeatureAccess,
  workspaceCredentialIsFresh,
} from '../_shared/workspaceAuth.ts'
import { chargeCredits, logOperationCost, refundCredits, retryWindowKey } from '../_shared/billing.ts'
import { resolveAiKey } from '../_shared/workspaceAiKeys.ts'
import { workspaceLinkOrigin } from '../_shared/workspaceOrigin.ts'
import {
  createOnboardingCapability,
  generatePitchProfile,
  onboardingEmailConfigured,
  onboardingUrl,
  sendOnboardingEmail,
  prefillOnboardingAnswers,
  validateOnboardingDefinition,
  validatePitchProfile,
} from '../_shared/workspaceOnboarding.ts'

const METHODS = ['POST'] as const
const BUCKET = 'workspace-onboarding-assets'
const BRAND_LOGO_MAX_BYTES = 2_097_152
// A delivered invitation cannot be emailed again for this long.
const RESEND_COOLDOWN_MS = 10 * 60 * 1000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type AdminClient = Awaited<ReturnType<typeof requireAuthenticatedUser>>['admin']

function capabilitySecret(): string {
  const value = Deno.env.get('ONBOARDING_CAPABILITY_SECRET')?.trim()
  if (!value || value.length < 32) {
    throw new HttpError(500, 'SERVER_MISCONFIGURED', 'Onboarding capabilities are not configured')
  }
  return value
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be a boolean`)
  }
  return value
}

function integerValue(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be an integer between ${min} and ${max}`)
  }
  return value
}

function optionalUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null
  return requireUuid(value, field)
}

function uuidArray(value: unknown, field: string, max = 100): string[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be an array of at most ${max} UUIDs`)
  }
  const result = value.map((entry, index) => requireUuid(entry, `${field}[${index}]`))
  if (new Set(result).size !== result.length) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must not contain duplicates`)
  }
  return result
}

function responseRecord(value: unknown, label = 'response'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(500, 'INVALID_ONBOARDING_RESPONSE', `The onboarding ${label} was invalid`)
  }
  return value as Record<string, unknown>
}

function requestRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function responseString(value: unknown, field: string, max = 10_000): string {
  if (typeof value !== 'string' || !value || value.length > max) {
    throw new HttpError(500, 'INVALID_ONBOARDING_RESPONSE', `The onboarding ${field} was invalid`)
  }
  return value
}

function ensureWorkspaceResponse(value: unknown, workspaceId: string): Record<string, unknown> {
  const result = responseRecord(value)
  if (result.workspace_id !== workspaceId || !UUID_PATTERN.test(responseString(result.id, 'id', 64))) {
    throw new HttpError(500, 'INVALID_ONBOARDING_RESPONSE', 'The onboarding response did not match the workspace')
  }
  return result
}

function templatePayload(value: unknown): Record<string, unknown> {
  const input = requestRecord(value, 'template')
  requireOnlyKeys(input, ['name', 'description', 'definition', 'reminder_days'])
  return {
    name: requireString(input.name, 'name', { max: 120 }),
    description: typeof input.description === 'string' ? input.description.trim().slice(0, 1000) : '',
    definition: validateOnboardingDefinition(input.definition),
    reminder_days: [],
  }
}

function decodeBrandLogo(value: unknown): { bytes: Uint8Array; mimeType: string; extension: string } | null {
  if (value === null || value === undefined) return null
  const input = requestRecord(value, 'experience.brand_logo')
  requireOnlyKeys(input, ['filename', 'mime_type', 'file_base64'])
  requireString(input.filename, 'experience.brand_logo.filename', { max: 255 })
  const mimeType = requireString(input.mime_type, 'experience.brand_logo.mime_type', { max: 100 }).toLowerCase()
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : ''
  if (!extension) throw new HttpError(400, 'INVALID_FILE_TYPE', 'The client logo must be a PNG, JPEG, or WebP image')
  if (typeof input.file_base64 !== 'string' || input.file_base64.length < 1 || input.file_base64.length > 2_800_000 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(input.file_base64)) {
    throw new HttpError(400, 'INVALID_FILE', 'The client logo could not be read')
  }
  let bytes: Uint8Array
  try {
    const binary = atob(input.file_base64)
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    throw new HttpError(400, 'INVALID_FILE', 'The client logo could not be read')
  }
  const signatureMatches = mimeType === 'image/jpeg'
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mimeType === 'image/png'
      ? bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
      : bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  if (bytes.length < 1 || bytes.length > BRAND_LOGO_MAX_BYTES || !signatureMatches) {
    throw new HttpError(400, 'INVALID_FILE', 'The client logo must match its file type and be 2 MB or smaller')
  }
  return { bytes, mimeType, extension }
}

function experiencePayload(value: unknown): {
  introTitle: string
  introBody: string
  completionMessage: string
  accentColor: string
  logo: ReturnType<typeof decodeBrandLogo>
} {
  const input = requestRecord(value, 'experience')
  requireOnlyKeys(input, ['intro_title', 'intro_body', 'completion_message', 'accent_color', 'brand_logo'])
  const accentColor = requireString(input.accent_color, 'experience.accent_color', { max: 7 }).toUpperCase()
  if (!/^#[0-9A-F]{6}$/u.test(accentColor)) {
    throw new HttpError(400, 'INVALID_FIELD', 'experience.accent_color must be a six-digit hex color')
  }
  return {
    introTitle: requireString(input.intro_title, 'experience.intro_title', { max: 300 }),
    introBody: requireString(input.intro_body, 'experience.intro_body', { max: 3000 }),
    completionMessage: requireString(input.completion_message, 'experience.completion_message', { max: 2000 }),
    accentColor,
    logo: decodeBrandLogo(input.brand_logo),
  }
}

function rpcError(error: { code?: string; message?: string }): never {
  const code = error.code ?? ''
  const message = (error.message ?? '').toLowerCase()
  if (code === '42501' || message.includes('active workspace') || message.includes('not editable')) {
    throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Active workspace access is required')
  }
  if (code === 'P0002' || message.includes('not found')) {
    throw new HttpError(404, 'ONBOARDING_NOT_FOUND', 'The requested onboarding record was not found')
  }
  if (code === '40001' || message.includes('changed')) {
    throw new HttpError(409, 'ONBOARDING_CHANGED', 'This onboarding changed. Refresh and try again')
  }
  if (code === '23505') {
    throw new HttpError(409, 'ONBOARDING_CONFLICT', 'An onboarding record with these details already exists')
  }
  if (['22023', '22P02', '23503', '23514'].includes(code) || message.includes('invalid')) {
    throw new HttpError(400, 'INVALID_REQUEST', 'The onboarding request was invalid')
  }
  throw new HttpError(500, 'ONBOARDING_OPERATION_FAILED', 'The onboarding operation failed')
}

async function addSignedAssetUrls(
  admin: AdminClient,
  value: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!Array.isArray(value.assets)) return value
  const assets = await Promise.all(value.assets.map(async (rawAsset) => {
    const asset = responseRecord(rawAsset, 'asset')
    const path = responseString(asset.storage_path, 'asset path', 500)
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600)
    return {
      ...asset,
      signed_url: error ? null : data.signedUrl,
    }
  }))
  return { ...value, assets }
}

async function listPrivateOnboardingFiles(
  admin: AdminClient,
  workspaceId: string,
  instanceId: string,
): Promise<string[]> {
  const prefix = `${workspaceId}/${instanceId}`
  const paths: string[] = []
  for (let offset = 0; offset < 10_000; offset += 100) {
    const listed = await admin.storage.from(BUCKET).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (listed.error) {
      throw new HttpError(503, 'ONBOARDING_STORAGE_PURGE_FAILED', 'Private onboarding files could not be enumerated. No database records were deleted')
    }
    for (const entry of listed.data ?? []) {
      if (!entry.id) continue
      if (!entry.name || entry.name.length > 255 || entry.name.includes('/') || entry.name.includes('\\') || entry.name === '.' || entry.name === '..') {
        throw new HttpError(500, 'INVALID_ONBOARDING_STORAGE_PATH', 'A private onboarding file path was invalid')
      }
      paths.push(`${prefix}/${entry.name}`)
    }
    if ((listed.data?.length ?? 0) < 100) return paths
  }
  throw new HttpError(503, 'ONBOARDING_STORAGE_PURGE_FAILED', 'Private onboarding files exceeded the safe purge limit. No database records were deleted')
}

type Delivery = Awaited<ReturnType<typeof sendOnboardingEmail>>

/*
 * The delivery record is what the list reads back as "Sent" or "Email
 * failed", so a write that silently failed left the row claiming whatever
 * the last successful write said. Both writers now report whether the record
 * landed; the caller passes that on so the page can say the outcome is
 * unknown instead of trusting a stale row.
 */
async function recordDelivery(
  admin: AdminClient,
  instanceId: string,
  delivery: Delivery,
): Promise<boolean> {
  const { data, error } = await admin.rpc('record_workspace_onboarding_invitation_v1', {
    p_instance_id: instanceId,
    p_status: delivery.status,
    p_provider_message_id: delivery.providerMessageId,
    p_error: delivery.error,
  })
  if (error || data !== true) {
    console.error('[workspace-onboarding] Invitation delivery could not be recorded', error?.code ?? 'no row')
    return false
  }
  return true
}

async function recordChangeRequestDelivery(
  admin: AdminClient,
  instanceId: string,
  delivery: Delivery,
): Promise<boolean> {
  const { data, error } = await admin.rpc('record_workspace_onboarding_change_request_v1', {
    p_instance_id: instanceId,
    p_status: delivery.status,
    p_provider_message_id: delivery.providerMessageId,
    p_error: delivery.error,
  })
  if (error || data !== true) {
    console.error('[workspace-onboarding] Change-request delivery could not be recorded', error?.code ?? 'no row')
    return false
  }
  return true
}

function deliveryResponse(delivery: Delivery, recorded: boolean): Record<string, unknown> {
  return {
    status: delivery.status,
    ...(delivery.reason ? { reason: delivery.reason } : {}),
    ...(recorded ? {} : { recorded: false }),
  }
}

/*
 * The agency's own contact address, for reply-to. It lives on the workspace
 * (set under Settings, "Email clients reply to") and the milestone emails in
 * clientNotify.ts already use it; onboarding invitations went out without it.
 */
async function workspaceReplyTo(admin: AdminClient, workspaceId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('workspaces')
    .select('client_contact_email')
    .eq('id', workspaceId)
    .maybeSingle()
  if (error) {
    console.error('[workspace-onboarding] Workspace reply-to could not be read', error.code ?? '')
    return null
  }
  const value = typeof data?.client_contact_email === 'string' ? data.client_contact_email.trim() : ''
  return value.includes('@') ? value : null
}

async function staffWorkspace(
  admin: AdminClient,
  workspaceId: string,
  userId: string,
  tokenIssuedAt: unknown,
  requireManager: boolean,
): Promise<Record<string, unknown>> {
  const listResult = await admin.rpc('workspace_onboarding_staff_list_v1', {
    p_workspace_id: workspaceId,
    p_actor_user_id: userId,
    p_token_issued_at: tokenIssuedAt,
  })
  if (listResult.error) rpcError(listResult.error)
  const listResponse = responseRecord(listResult.data, 'workspace list')
  const workspace = responseRecord(listResponse.workspace, 'workspace')
  if (workspace.id !== workspaceId || (requireManager && listResponse.can_manage !== true)) {
    throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Workspace manager access is required')
  }
  return workspace
}

const LIST_SECTIONS = ['templates', 'clients', 'instances'] as const
type ListSection = typeof LIST_SECTIONS[number]

function listSections(value: unknown): Set<ListSection> {
  if (value === undefined || value === null) return new Set(LIST_SECTIONS)
  if (!Array.isArray(value) || value.length < 1 || value.length > LIST_SECTIONS.length
    || value.some((entry) => !LIST_SECTIONS.includes(entry as ListSection))) {
    throw new HttpError(400, 'INVALID_FIELD', 'include must list templates, clients, or instances')
  }
  return new Set(value as ListSection[])
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req, 3_200_000)
    const action = typeof body.action === 'string' ? body.action : ''
    const context = await requireAuthenticatedUser(req)
    if (!workspaceCredentialIsFresh(context)) {
      throw new HttpError(401, 'REAUTHENTICATION_REQUIRED', 'Your sign-in is out of date. Sign out and sign in again to continue')
    }
    const { admin, user, tokenIssuedAt } = context
    const workspaceId = requireUuid(body.workspace_id, 'workspace_id')
    // Staff may read existing onboarding during recovery. Starting intake can
    // create a client, and the remaining staff actions mutate content, access,
    // or invitations, so they require the same entitlement as client writes.
    // Public capability submissions are handled separately by client-onboarding.
    if (!['list', 'detail', 'get_link'].includes(action)) {
      await requireWorkspaceFeatureAccess(context, workspaceId)
    }
    // The origin this workspace's clients should be sent to. Branding the page
    // means nothing while the email that delivers it names the platform.
    const linkOrigin = await workspaceLinkOrigin(admin, workspaceId)

    if (action === 'list') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'include'])
      const sections = listSections(body.include)
      const { data, error } = await admin.rpc('workspace_onboarding_staff_list_v1', {
        p_workspace_id: workspaceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (error) rpcError(error)
      const result = responseRecord(data)
      const workspace = responseRecord(result.workspace, 'workspace')
      if (workspace.id !== workspaceId || !Array.isArray(result.instances) || !Array.isArray(result.templates)) {
        throw new HttpError(500, 'INVALID_ONBOARDING_RESPONSE', 'The onboarding response did not match the workspace')
      }
      /*
       * Sections the caller did not ask for are dropped. The page polls the
       * instance list every 30 seconds; it used to receive every client and
       * every template definition with each poll, data that changes only
       * when someone edits it.
       */
      if (!sections.has('clients')) result.clients = []
      if (!sections.has('templates')) result.templates = []
      if (!sections.has('instances')) result.instances = []
      /*
       * What the page needs to warn about before the first invite: whether
       * email can leave at all, and the agency's client-facing settings that
       * shape it (reply-to, accent).
       */
      const { data: brandRow, error: brandError } = await admin
        .from('workspaces')
        .select('client_contact_email, client_brand_accent_color')
        .eq('id', workspaceId)
        .maybeSingle()
      if (brandError) console.error('[workspace-onboarding] Workspace brand settings could not be read', brandError.code ?? '')
      workspace.client_contact_email = typeof brandRow?.client_contact_email === 'string' && brandRow.client_contact_email.includes('@')
        ? brandRow.client_contact_email
        : null
      workspace.client_brand_accent_color = typeof brandRow?.client_brand_accent_color === 'string'
        && /^#[0-9A-F]{6}$/iu.test(brandRow.client_brand_accent_color)
        ? brandRow.client_brand_accent_color.toUpperCase()
        : null
      result.email_delivery = { configured: onboardingEmailConfigured() }
      /*
       * Delivery truth for every listed instance, from the notifications
       * table nothing else reads. The list said "Sent <date>" from
       * invited_at, which is stamped whether or not the email left — and
       * with sending down, "ignored it" versus "never got it" is THE
       * operational question, answerable all along from last_error in a
       * table with zero readers. Latest invitation/change-request row per
       * instance, attached as delivery.
       */
      const instanceRows = result.instances as Array<Record<string, unknown>>
      const instanceIds = instanceRows
        .map((instance) => instance.id)
        .filter((id): id is string => typeof id === 'string')
      if (instanceIds.length > 0) {
        // 'changes_requested' is the stored kind; this filter used to ask for
        // 'change_request', which matched nothing, so a failed change-request
        // email never showed. Latest attempt wins, since a resend updates the
        // original invitation row rather than adding one.
        const { data: notificationRows, error: notificationError } = await admin
          .from('workspace_onboarding_notifications')
          .select('instance_id, kind, status, last_error, attempted_at, sent_at, created_at')
          .eq('workspace_id', workspaceId)
          .in('instance_id', instanceIds)
          .in('kind', ['invitation', 'changes_requested'])
          .order('attempted_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
        if (notificationError) {
          console.error('[workspace-onboarding] Delivery records could not be read', notificationError.code ?? '')
        }
        const deliveryByInstance = new Map<string, Record<string, unknown>>()
        for (const row of (notificationRows ?? []) as Array<Record<string, unknown>>) {
          const instanceId = String(row.instance_id)
          if (deliveryByInstance.has(instanceId)) continue
          deliveryByInstance.set(instanceId, {
            kind: row.kind,
            status: row.status,
            last_error: typeof row.last_error === 'string' ? row.last_error.slice(0, 300) : null,
            attempted_at: row.attempted_at ?? null,
            sent_at: row.sent_at ?? null,
          })
        }
        for (const instance of instanceRows) {
          // Unreadable is not the same as "nothing was sent": say unknown.
          instance.delivery = notificationError
            ? { kind: 'invitation', status: 'unknown', last_error: null, attempted_at: null, sent_at: null }
            : deliveryByInstance.get(String(instance.id)) ?? null
        }
      }
      /*
       * Each template's PUBLISHED definition, alongside the draft the RPC
       * returns. Instances snapshot the published version, but every list and
       * preview rendered the mutable draft — so "the questions stay pinned to
       * this published template version" sat beside a preview of unpublished
       * edits the client would never receive. The published definition is
       * what Start onboarding must show, and the draft/published comparison
       * is what lets the UI say "unpublished changes" instead of implying
       * they are the same.
       */
      const templateRows = result.templates as Array<Record<string, unknown>>
      const versionKeys = templateRows
        .filter((template) => typeof template.id === 'string' && Number.isInteger(template.published_version))
        .map((template) => ({ id: template.id as string, version: template.published_version as number }))
      if (versionKeys.length > 0) {
        const { data: versions, error: versionsError } = await admin
          .from('workspace_onboarding_template_versions')
          .select('template_id, version, definition')
          .eq('workspace_id', workspaceId)
          .in('template_id', versionKeys.map((key) => key.id))
        // Unreadable versions leave published_definition null, which the page
        // treats as "draft only"; logged so the gap is visible.
        if (versionsError) {
          console.error('[workspace-onboarding] Published template versions could not be read', versionsError.code ?? '')
        }
        const publishedByTemplate = new Map(
          ((versions ?? []) as Array<Record<string, unknown>>)
            .filter((row) => versionKeys.some((key) => key.id === row.template_id && key.version === row.version))
            .map((row) => [row.template_id as string, row.definition]),
        )
        for (const template of templateRows) {
          const published = publishedByTemplate.get(template.id as string) ?? null
          template.published_definition = published
          template.has_unpublished_changes = published !== null
            && JSON.stringify(published) !== JSON.stringify(template.definition)
        }
      }
      return jsonResponse(req, METHODS, 200, result)
    }

    if (action === 'detail') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id'])
      const instanceId = requireUuid(body.instance_id, 'instance_id')
      const { data, error } = await admin.rpc('workspace_onboarding_staff_detail_v1', {
        p_workspace_id: workspaceId,
        p_instance_id: instanceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (error) rpcError(error)
      const result = ensureWorkspaceResponse(data, workspaceId)
      return jsonResponse(req, METHODS, 200, { instance: await addSignedAssetUrls(admin, result) })
    }

    if (action === 'get_link') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id'])
      const instanceId = requireUuid(body.instance_id, 'instance_id')
      const listResult = await admin.rpc('workspace_onboarding_staff_list_v1', {
        p_workspace_id: workspaceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (listResult.error) rpcError(listResult.error)
      const listResponse = responseRecord(listResult.data, 'workspace list')
      const workspace = responseRecord(listResponse.workspace, 'workspace')
      if (workspace.id !== workspaceId || listResponse.can_manage !== true) {
        throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Workspace manager access is required')
      }

      const detailResult = await admin.rpc('workspace_onboarding_staff_detail_v1', {
        p_workspace_id: workspaceId,
        p_instance_id: instanceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (detailResult.error) rpcError(detailResult.error)
      const instance = ensureWorkspaceResponse(detailResult.data, workspaceId)
      if (!['invited', 'in_progress', 'changes_requested'].includes(String(instance.status))) {
        throw new HttpError(409, 'ONBOARDING_LINK_UNAVAILABLE', 'This onboarding does not have an active client link')
      }

      const generation = integerValue(instance.capability_generation, 'capability generation', 1, 2_147_483_646)
      const capability = await createOnboardingCapability(instanceId, generation, capabilitySecret())
      const capabilityCheck = await admin.rpc('workspace_onboarding_client_operation_v1', {
        p_action: 'get',
        p_instance_id: instanceId,
        p_capability_hash: capability.verifierHash,
        p_payload: {},
      })
      if (capabilityCheck.error) {
        const message = (capabilityCheck.error.message ?? '').toLowerCase()
        if (capabilityCheck.error.code === 'P0002' || message.includes('not found')) {
          throw new HttpError(409, 'ONBOARDING_LINK_CHANGED', 'This onboarding link can no longer be opened. Create a new link and send it to the client')
        }
        rpcError(capabilityCheck.error)
      }

      return jsonResponse(req, METHODS, 200, {
        instance: await addSignedAssetUrls(admin, instance),
        onboarding_url: onboardingUrl(capability.token, linkOrigin),
      })
    }

    if (action.startsWith('template_')) {
      const templateAction = action.slice('template_'.length)
      let templateId: string | null = null
      let payload: Record<string, unknown> = {}
      if (templateAction === 'create') {
        requireOnlyKeys(body, ['action', 'workspace_id', 'template'])
        payload = templatePayload(body.template)
      } else if (templateAction === 'update') {
        requireOnlyKeys(body, ['action', 'workspace_id', 'template_id', 'template'])
        templateId = requireUuid(body.template_id, 'template_id')
        payload = templatePayload(body.template)
      } else if (templateAction === 'publish') {
        requireOnlyKeys(body, ['action', 'workspace_id', 'template_id', 'make_default'])
        templateId = requireUuid(body.template_id, 'template_id')
        payload = { make_default: booleanValue(body.make_default, 'make_default') }
      } else if (templateAction === 'duplicate') {
        requireOnlyKeys(body, ['action', 'workspace_id', 'template_id', 'name'])
        templateId = requireUuid(body.template_id, 'template_id')
        payload = { name: requireString(body.name, 'name', { max: 120 }) }
      } else if (templateAction === 'set_default' || templateAction === 'archive') {
        requireOnlyKeys(body, ['action', 'workspace_id', 'template_id'])
        templateId = requireUuid(body.template_id, 'template_id')
      } else {
        throw new HttpError(400, 'INVALID_ACTION', 'Unknown onboarding template action')
      }

      const { data, error } = await admin.rpc('workspace_onboarding_template_operation_v1', {
        p_action: templateAction,
        p_workspace_id: workspaceId,
        p_template_id: templateId,
        p_payload: payload,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (error) rpcError(error)
      const template = responseRecord(data, 'template')
      if (template.workspace_id !== workspaceId) {
        throw new HttpError(500, 'INVALID_ONBOARDING_RESPONSE', 'The template response did not match the workspace')
      }
      return jsonResponse(req, METHODS, templateAction === 'create' ? 201 : 200, { template })
    }

    if (action === 'start') {
      requireOnlyKeys(body, [
        'action',
        'workspace_id',
        'template_id',
        'client_id',
        'new_client',
        'recipient_name',
        'recipient_email',
        'expires_in_days',
        'assigned_membership_ids',
        'send_email',
        'experience',
        'idempotency_key',
      ])
      const templateId = requireUuid(body.template_id, 'template_id')
      const clientId = optionalUuid(body.client_id, 'client_id')
      const recipientName = requireString(body.recipient_name, 'recipient_name', { max: 200 })
      const recipientEmail = requireEmail(body.recipient_email)
      const expiresInDays = integerValue(body.expires_in_days, 'expires_in_days', 1, 90)
      const assignedIds = uuidArray(body.assigned_membership_ids ?? [], 'assigned_membership_ids')
      const sendEmail = booleanValue(body.send_email, 'send_email')
      const experience = experiencePayload(body.experience)
      let newClient: Record<string, unknown> | null = null
      if (!clientId) {
        const source = requestRecord(body.new_client, 'new_client')
        requireOnlyKeys(source, ['name', 'email', 'contact_person'])
        const email = requireEmail(source.email)
        if (email !== recipientEmail) {
          throw new HttpError(400, 'INVALID_FIELD', 'new client email must match the invited email')
        }
        newClient = {
          name: requireString(source.name, 'new_client.name', { max: 200 }),
          email,
          contact_person: typeof source.contact_person === 'string' ? source.contact_person.trim().slice(0, 200) : '',
        }
      } else if (body.new_client !== null && body.new_client !== undefined) {
        throw new HttpError(400, 'INVALID_FIELD', 'new_client must be empty when an existing client is selected')
      }

      const workspace = await staffWorkspace(admin, workspaceId, user.id, tokenIssuedAt, true)
      /*
       * The browser mints the instance id and sends it as idempotency_key, so
       * a retry after a lost response (timeout, double click, flaky network)
       * finds the onboarding it already created instead of creating a second
       * one with a second client and a second email. A replay returns the
       * existing link and never emails again.
       */
      const instanceId = optionalUuid(body.idempotency_key, 'idempotency_key') ?? crypto.randomUUID()
      const replayStart = async (): Promise<Response | null> => {
        const { data: existing, error: existingError } = await admin
          .from('workspace_onboarding_instances')
          .select('id, workspace_id')
          .eq('id', instanceId)
          .maybeSingle()
        if (existingError) rpcError(existingError)
        if (!existing) return null
        if (existing.workspace_id !== workspaceId) {
          throw new HttpError(409, 'ONBOARDING_CONFLICT', 'An onboarding record with these details already exists')
        }
        const detailResult = await admin.rpc('workspace_onboarding_staff_detail_v1', {
          p_workspace_id: workspaceId,
          p_instance_id: instanceId,
          p_actor_user_id: user.id,
          p_token_issued_at: tokenIssuedAt,
        })
        if (detailResult.error) rpcError(detailResult.error)
        const existingInstance = ensureWorkspaceResponse(detailResult.data, workspaceId)
        const existingGeneration = integerValue(existingInstance.capability_generation, 'capability generation', 1, 2_147_483_646)
        const existingCapability = await createOnboardingCapability(instanceId, existingGeneration, capabilitySecret())
        const { data: notification } = await admin
          .from('workspace_onboarding_notifications')
          .select('status')
          .eq('instance_id', instanceId)
          .eq('kind', 'invitation')
          .maybeSingle()
        const status = ['sent', 'failed', 'skipped'].includes(String(notification?.status))
          ? String(notification?.status)
          : 'unknown'
        return jsonResponse(req, METHODS, 200, {
          instance: await addSignedAssetUrls(admin, existingInstance),
          onboarding_url: onboardingUrl(existingCapability.token, linkOrigin),
          delivery: { status },
          replayed: true,
        })
      }
      const replayed = await replayStart()
      if (replayed) return replayed
      /*
       * A new client with an email the workspace already uses is allowed
       * (two people can share an inbox) but almost always a mistake, so the
       * response names the existing client for the page to warn about.
       */
      let duplicateClient: { id: string; name: string } | null = null
      if (newClient) {
        const { data: matchingClients, error: duplicateLookupError } = await admin
          .from('clients')
          .select('id, name')
          .eq('workspace_id', workspaceId)
          .ilike('email', String(newClient.email).replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_'))
          .limit(1)
        if (duplicateLookupError) {
          console.error('[workspace-onboarding] Duplicate client check failed', duplicateLookupError.code ?? '')
        } else if (matchingClients?.[0]) {
          duplicateClient = { id: String(matchingClients[0].id), name: String(matchingClients[0].name ?? '') }
        }
      }
      const generation = 1
      const capability = await createOnboardingCapability(instanceId, generation, capabilitySecret())
      const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
      const brandLogoPath = experience.logo
        ? `${workspaceId}/${instanceId}/brand-${crypto.randomUUID()}.${experience.logo.extension}`
        : null
      if (brandLogoPath && experience.logo) {
        const uploaded = await admin.storage.from(BUCKET).upload(brandLogoPath, experience.logo.bytes, {
          contentType: experience.logo.mimeType,
          upsert: false,
          cacheControl: '3600',
        })
        if (uploaded.error) throw new HttpError(503, 'ONBOARDING_LOGO_UPLOAD_FAILED', 'The client logo could not be uploaded')
      }
      const { data, error } = await admin.rpc('workspace_onboarding_start_v1', {
        p_workspace_id: workspaceId,
        p_template_id: templateId,
        p_client_id: clientId,
        p_payload: {
          instance_id: instanceId,
          capability_generation: generation,
          capability_hash: capability.verifierHash,
          capability_expires_at: expiresAt,
          recipient_name: recipientName,
          recipient_email: recipientEmail,
          new_client: newClient,
          assigned_membership_ids: assignedIds,
          experience: {
            intro_title: experience.introTitle,
            intro_body: experience.introBody,
            completion_message: experience.completionMessage,
            accent_color: experience.accentColor,
            logo_path: brandLogoPath,
          },
        },
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (error) {
        if (brandLogoPath) await admin.storage.from(BUCKET).remove([brandLogoPath])
        // Two retries racing past the replay check: the loser finds the
        // winner's row and returns it.
        if (error.code === '23505') {
          const raced = await replayStart()
          if (raced) return raced
        }
        rpcError(error)
      }
      const instance = ensureWorkspaceResponse(data, workspaceId)
      /*
       * Seed the client's empty draft with what the operator already typed
       * (and the client record's links), so the first section arrives half
       * done. lock_version 0 means the client has not saved yet; a failure
       * only costs the convenience, never the onboarding.
       */
      try {
        let clientRow: Record<string, unknown> | null = null
        if (clientId) {
          const { data: row } = await admin
            .from('clients')
            .select('name, website, linkedin_url')
            .eq('workspace_id', workspaceId)
            .eq('id', clientId)
            .maybeSingle()
          clientRow = row
        }
        const prefill = prefillOnboardingAnswers(validateOnboardingDefinition(instance.definition), {
          recipientName,
          recipientEmail,
          clientName: typeof clientRow?.name === 'string' ? clientRow.name : (newClient?.name as string | undefined) ?? null,
          website: typeof clientRow?.website === 'string' ? clientRow.website : null,
          linkedinUrl: typeof clientRow?.linkedin_url === 'string' ? clientRow.linkedin_url : null,
        })
        if (Object.keys(prefill).length > 0) {
          const { error: prefillError } = await admin
            .from('workspace_onboarding_drafts')
            .update({ answers: prefill })
            .eq('instance_id', instanceId)
            .eq('workspace_id', workspaceId)
            .eq('lock_version', 0)
          if (prefillError) console.error('[workspace-onboarding] Draft prefill failed', prefillError.code ?? '')
        }
      } catch (prefillError) {
        console.error('[workspace-onboarding] Draft prefill failed', prefillError instanceof Error ? prefillError.name : '')
      }
      const link = onboardingUrl(capability.token, linkOrigin)
      const delivery: Delivery = sendEmail
        ? await sendOnboardingEmail({
          kind: 'invitation',
          workspaceName: typeof workspace.name === 'string' ? workspace.name : 'Your agency',
          recipientName,
          recipientEmail,
          url: link,
          expiresAt,
          accentColor: experience.accentColor ?? undefined,
          replyTo: await workspaceReplyTo(admin, workspaceId),
          experienceTitle: experience.introTitle,
          experienceBody: experience.introBody,
        })
        : { status: 'skipped' as const, providerMessageId: null, error: null }
      const recorded = await recordDelivery(admin, instanceId, delivery)
      return jsonResponse(req, METHODS, 201, {
        instance,
        onboarding_url: link,
        delivery: deliveryResponse(delivery, recorded),
        ...(duplicateClient ? { duplicate_client: duplicateClient } : {}),
      })
    }

    const instanceId = requireUuid(body.instance_id, 'instance_id')

    if (action === 'retry_ai') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id'])
      const detailResult = await admin.rpc('workspace_onboarding_staff_detail_v1', {
        p_workspace_id: workspaceId,
        p_instance_id: instanceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (detailResult.error) rpcError(detailResult.error)
      const detail = ensureWorkspaceResponse(detailResult.data, workspaceId)
      if (detail.status !== 'submitted' || typeof detail.current_revision !== 'number') {
        throw new HttpError(400, 'INVALID_STATE', 'Only a submitted onboarding can generate a pitch profile')
      }
      const definition = validateOnboardingDefinition(detail.definition)
      const answers = responseRecord(detail.answers, 'answers')
      const anthropicKey = await resolveAiKey(admin, workspaceId, 'anthropic')
      const draftCharge = await chargeCredits(admin, {
        workspaceId,
        operationType: 'pitch_profile',
        referenceKind: 'onboarding_instance',
        referenceId: instanceId,
        idempotencyKey: retryWindowKey(['pitch_profile', instanceId]),
        actorUserId: user.id,
        byoKeyUsed: anthropicKey?.source === 'workspace',
      })
      try {
        const { profile, usage } = await generatePitchProfile(definition, answers, anthropicKey?.apiKey)
        await logOperationCost(admin, {
          workspaceId,
          operationType: 'pitch_profile',
          usage: { anthropicInputTokens: usage.inputTokens, anthropicOutputTokens: usage.outputTokens },
          usedByoKey: anthropicKey?.source === 'workspace',
          referenceKind: 'onboarding_instance',
          referenceId: instanceId,
        })
        const stored = await admin.rpc('set_workspace_onboarding_ai_profile_v1', {
          p_instance_id: instanceId,
          p_revision: detail.current_revision,
          p_status: 'generated',
          p_content: profile,
          p_error: null,
        })
        if (stored.error || stored.data !== true) {
          throw new HttpError(409, 'ONBOARDING_CHANGED', 'The submission changed before its AI draft was ready')
        }
      } catch (error) {
        // The charge came before the model call; a draft that never landed
        // gives a fresh charge back. A replayed debit belongs to an earlier
        // attempt and stays.
        if (!draftCharge.replayed) {
          await refundCredits(admin, {
            workspaceId,
            entryId: draftCharge.entryId,
            reason: 'onboarding pitch profile draft failed after the charge',
          })
        }
        if (error instanceof HttpError) throw error
        await admin.rpc('set_workspace_onboarding_ai_profile_v1', {
          p_instance_id: instanceId,
          p_revision: detail.current_revision,
          p_status: 'failed',
          p_content: {},
          p_error: 'AI draft unavailable. Try again or write the profile manually.',
        })
        throw new HttpError(503, 'AI_DRAFT_UNAVAILABLE', 'The AI draft is unavailable. Try again later')
      }
      const refreshed = await admin.rpc('workspace_onboarding_staff_detail_v1', {
        p_workspace_id: workspaceId,
        p_instance_id: instanceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (refreshed.error) rpcError(refreshed.error)
      return jsonResponse(req, METHODS, 200, {
        instance: await addSignedAssetUrls(admin, ensureWorkspaceResponse(refreshed.data, workspaceId)),
      })
    }

    if (action === 'approve') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id', 'profile'])
      const profile = validatePitchProfile(body.profile)
      const { data, error } = await admin.rpc('workspace_onboarding_approve_v1', {
        p_workspace_id: workspaceId,
        p_instance_id: instanceId,
        p_profile: profile,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (error) rpcError(error)
      return jsonResponse(req, METHODS, 200, {
        instance: await addSignedAssetUrls(admin, ensureWorkspaceResponse(data, workspaceId)),
      })
    }

    if (action === 'resend_invitation') {
      /*
       * Email the client their current link again. Before this the only way
       * to chase a client was to copy the link into a personal inbox: rotate
       * accepted send_email and ignored it, and nothing else sent anything.
       * A link that has expired is not resent here; the page rotates it with
       * send_email instead, so the client never receives a dead link.
       */
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id'])
      const workspace = await staffWorkspace(admin, workspaceId, user.id, tokenIssuedAt, true)
      const detailResult = await admin.rpc('workspace_onboarding_staff_detail_v1', {
        p_workspace_id: workspaceId,
        p_instance_id: instanceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (detailResult.error) rpcError(detailResult.error)
      const instance = ensureWorkspaceResponse(detailResult.data, workspaceId)
      if (!['invited', 'in_progress', 'changes_requested'].includes(String(instance.status)) || instance.archived_at) {
        throw new HttpError(409, 'ONBOARDING_LINK_UNAVAILABLE', 'This onboarding does not have an active client link')
      }
      const expiresAt = responseString(instance.capability_expires_at, 'capability expiry', 64)
      if (!(new Date(expiresAt).valueOf() > Date.now())) {
        throw new HttpError(409, 'ONBOARDING_LINK_EXPIRED', 'This link has expired. Rotate it to send the client a new one')
      }
      /*
       * One resend per onboarding per cooldown. Each click sent the client
       * another copy of the same email with nothing in between, so a few
       * impatient clicks filled their inbox from the agency's domain. Only a
       * delivered email starts the cooldown: a failed send can be retried at
       * once, because nothing reached the client.
       */
      const { data: lastSent, error: lastSentError } = await admin
        .from('workspace_onboarding_notifications')
        .select('sent_at')
        .eq('workspace_id', workspaceId)
        .eq('instance_id', instanceId)
        .in('kind', ['invitation', 'changes_requested'])
        .not('sent_at', 'is', null)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (lastSentError) {
        console.error('[workspace-onboarding] Last delivery could not be read for the resend cooldown', lastSentError.code ?? '')
      }
      const lastSentAt = typeof lastSent?.sent_at === 'string' ? Date.parse(lastSent.sent_at) : Number.NaN
      if (Number.isFinite(lastSentAt) && Date.now() - lastSentAt < RESEND_COOLDOWN_MS) {
        const minutes = Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - lastSentAt)) / 60_000))
        throw new HttpError(
          429,
          'ONBOARDING_RESEND_COOLDOWN',
          `This client was emailed a few minutes ago. You can resend in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        )
      }
      const generation = integerValue(instance.capability_generation, 'capability generation', 1, 2_147_483_646)
      const capability = await createOnboardingCapability(instanceId, generation, capabilitySecret())
      const capabilityCheck = await admin.rpc('workspace_onboarding_client_operation_v1', {
        p_action: 'get',
        p_instance_id: instanceId,
        p_capability_hash: capability.verifierHash,
        p_payload: {},
      })
      if (capabilityCheck.error) {
        const message = (capabilityCheck.error.message ?? '').toLowerCase()
        if (capabilityCheck.error.code === 'P0002' || message.includes('not found')) {
          throw new HttpError(409, 'ONBOARDING_LINK_CHANGED', 'This onboarding link can no longer be opened. Create a new link and send it to the client')
        }
        rpcError(capabilityCheck.error)
      }
      const link = onboardingUrl(capability.token, linkOrigin)
      const changesRequested = instance.status === 'changes_requested'
      const delivery = await sendOnboardingEmail({
        kind: changesRequested ? 'changes_requested' : 'invitation',
        workspaceName: responseString(workspace.name, 'workspace name', 200),
        recipientName: responseString(instance.recipient_name, 'recipient name', 200),
        recipientEmail: normalizeEmail(responseString(instance.recipient_email, 'recipient email', 254)),
        url: link,
        expiresAt,
        accentColor: typeof instance.accent_color === 'string' ? instance.accent_color : undefined,
        replyTo: await workspaceReplyTo(admin, workspaceId),
        experienceTitle: typeof instance.experience_title === 'string' ? instance.experience_title : null,
        experienceBody: typeof instance.experience_body === 'string' ? instance.experience_body : null,
        reminder: true,
      })
      const recorded = changesRequested
        ? await recordChangeRequestDelivery(admin, instanceId, delivery)
        : await recordDelivery(admin, instanceId, delivery)
      return jsonResponse(req, METHODS, 200, {
        instance: await addSignedAssetUrls(admin, instance),
        onboarding_url: link,
        delivery: deliveryResponse(delivery, recorded),
      })
    }

    if (action === 'approve_answers') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id'])
      const { data, error } = await admin.rpc('workspace_onboarding_approve_answers_v1', {
        p_workspace_id: workspaceId,
        p_instance_id: instanceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (error) rpcError(error)
      return jsonResponse(req, METHODS, 200, {
        instance: await addSignedAssetUrls(admin, ensureWorkspaceResponse(data, workspaceId)),
      })
    }

    const operation = action
    let payload: Record<string, unknown> = {}
    let link: string | null = null
    let rotateSendEmail = false
    if (action === 'request_changes') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id', 'comments'])
      if (!Array.isArray(body.comments) || body.comments.length < 1 || body.comments.length > 100) {
        throw new HttpError(400, 'INVALID_FIELD', 'comments must contain between 1 and 100 review notes')
      }
      payload.comments = body.comments.map((rawComment, index) => {
        const comment = requestRecord(rawComment, `comments[${index}]`)
        requireOnlyKeys(comment, ['question_id', 'body'])
        return {
          question_id: requireString(comment.question_id, `comments[${index}].question_id`, { max: 64 }),
          body: requireString(comment.body, `comments[${index}].body`, { max: 2000 }),
        }
      })
    } else if (action === 'update_profile') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id', 'profile'])
      payload.profile = validatePitchProfile(body.profile)
    } else if (action === 'update_assignments') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id', 'assigned_membership_ids'])
      payload.assigned_membership_ids = uuidArray(body.assigned_membership_ids, 'assigned_membership_ids')
    } else if (action === 'rotate') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id', 'expires_in_days', 'send_email'])
      const expiresInDays = integerValue(body.expires_in_days, 'expires_in_days', 1, 90)
      rotateSendEmail = booleanValue(body.send_email, 'send_email')
      const detailResult = await admin.rpc('workspace_onboarding_staff_detail_v1', {
        p_workspace_id: workspaceId,
        p_instance_id: instanceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (detailResult.error) rpcError(detailResult.error)
      const detail = ensureWorkspaceResponse(detailResult.data, workspaceId)
      const currentGeneration = integerValue(detail.capability_generation, 'capability generation', 1, 2_147_483_646)
      const nextGeneration = currentGeneration + 1
      const capability = await createOnboardingCapability(instanceId, nextGeneration, capabilitySecret())
      const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
      payload = {
        capability_generation: nextGeneration,
        capability_hash: capability.verifierHash,
        capability_expires_at: expiresAt,
      }
      link = onboardingUrl(capability.token, linkOrigin)
    } else if (action === 'extend') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id', 'extension_days'])
      const extensionDays = integerValue(body.extension_days, 'extension_days', 1, 89)
      const detailResult = await admin.rpc('workspace_onboarding_staff_detail_v1', {
        p_workspace_id: workspaceId,
        p_instance_id: instanceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (detailResult.error) rpcError(detailResult.error)
      const detail = ensureWorkspaceResponse(detailResult.data, workspaceId)
      const currentExpiry = new Date(responseString(detail.capability_expires_at, 'capability expiry', 64)).valueOf()
      if (!Number.isFinite(currentExpiry)) {
        throw new HttpError(400, 'INVALID_FIELD', 'The current expiry could not be read')
      }
      /*
       * Clamped to the 90-day ceiling rather than refused. The UI offers one
       * fixed 14-day extension; near the cap that request used to fail with a
       * generic error, when a 3-day extension would have succeeded — the
       * manager had no smaller lever and no explanation. Granting what the
       * ceiling allows is what they meant; only a link already at the ceiling
       * has nothing to grant.
       */
      const ceiling = Date.now() + 90 * 86_400_000
      // From today when the link has already lapsed: extending a link that
      // expired a month ago by 14 days from its old expiry left it expired.
      const requested = Math.max(Date.now(), currentExpiry) + extensionDays * 86_400_000
      const nextExpiry = new Date(Math.min(requested, ceiling))
      if (nextExpiry.valueOf() <= currentExpiry) {
        throw new HttpError(400, 'INVALID_FIELD', 'This link is already at the 90-day maximum and cannot be extended further')
      }
      payload.capability_expires_at = nextExpiry.toISOString()
      const generation = integerValue(detail.capability_generation, 'capability generation', 1, 2_147_483_646)
      const capability = await createOnboardingCapability(instanceId, generation, capabilitySecret())
      link = onboardingUrl(capability.token, linkOrigin)
    } else if (action === 'revoke' || action === 'archive') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id'])
      /*
       * Submitted answers must be resolved, not orphaned. Revoking a
       * submitted onboarding was allowed and irreversible — approval and
       * request-changes both require status 'submitted', rotate refuses
       * 'revoked', so one tidy-up click stranded a completed intake with no
       * path to ever approve it. Approve or request changes first; archive
       * remains for abandoning the record deliberately.
       */
      if (action === 'revoke') {
        const { data: statusRow } = await admin
          .from('workspace_onboarding_instances')
          .select('status')
          .eq('id', instanceId)
          .eq('workspace_id', workspaceId)
          .maybeSingle()
        if (statusRow?.status === 'submitted') {
          throw new HttpError(
            409,
            'ONBOARDING_SUBMITTED',
            'This onboarding has submitted answers. Approve them or request changes first — revoking would strand the submission with no way to ever approve it.',
          )
        }
      }
    } else if (action === 'purge') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id', 'confirmation'])
      if (body.confirmation !== 'PURGE') {
        throw new HttpError(400, 'PURGE_CONFIRMATION_REQUIRED', 'Type PURGE to permanently delete onboarding data')
      }
      payload.confirmation = 'PURGE'
    } else {
      throw new HttpError(400, 'INVALID_ACTION', 'Unknown onboarding action')
    }

    if (action === 'purge') {
      const preview = await admin.rpc('workspace_onboarding_instance_operation_v1', {
        p_action: 'purge_paths',
        p_workspace_id: workspaceId,
        p_instance_id: instanceId,
        p_payload: payload,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (preview.error) rpcError(preview.error)
      const previewResult = responseRecord(preview.data, 'purge preview')
      const paths = Array.isArray(previewResult.storage_paths)
        ? previewResult.storage_paths.filter((path): path is string => typeof path === 'string')
        : []
      const storedPaths = await listPrivateOnboardingFiles(admin, workspaceId, instanceId)
      const purgePaths = [...new Set([...paths, ...storedPaths])]
      for (let offset = 0; offset < purgePaths.length; offset += 100) {
        const removal = await admin.storage.from(BUCKET).remove(purgePaths.slice(offset, offset + 100))
        if (removal.error) {
          throw new HttpError(503, 'ONBOARDING_STORAGE_PURGE_FAILED', 'Private onboarding files could not be purged. No database records were deleted')
        }
      }
    }

    const { data, error } = await admin.rpc('workspace_onboarding_instance_operation_v1', {
      p_action: operation,
      p_workspace_id: workspaceId,
      p_instance_id: instanceId,
      p_payload: payload,
      p_actor_user_id: user.id,
      p_token_issued_at: tokenIssuedAt,
    })
    if (error) rpcError(error)

    if (action === 'purge') {
      responseRecord(data, 'purge response')
      return jsonResponse(req, METHODS, 200, {
        purged: true,
        storage_cleanup_complete: true,
        client_record_retained: true,
      })
    }

    const instance = await addSignedAssetUrls(admin, ensureWorkspaceResponse(data, workspaceId))
    if (action === 'request_changes') {
      const generation = integerValue(instance.capability_generation, 'capability generation', 1, 2_147_483_646)
      const capability = await createOnboardingCapability(instanceId, generation, capabilitySecret())
      link = onboardingUrl(capability.token, linkOrigin)
      const listResult = await admin.rpc('workspace_onboarding_staff_list_v1', {
        p_workspace_id: workspaceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (listResult.error) rpcError(listResult.error)
      const workspace = responseRecord(responseRecord(listResult.data).workspace, 'workspace')
      const delivery = await sendOnboardingEmail({
        kind: 'changes_requested',
        workspaceName: responseString(workspace.name, 'workspace name', 200),
        recipientName: responseString(instance.recipient_name, 'recipient name', 200),
        recipientEmail: normalizeEmail(responseString(instance.recipient_email, 'recipient email', 254)),
        url: link,
        expiresAt: responseString(instance.capability_expires_at, 'capability expiry', 64),
        accentColor: responseString(instance.accent_color, 'accent color', 7),
        replyTo: await workspaceReplyTo(admin, workspaceId),
      })
      const recorded = await recordChangeRequestDelivery(admin, instanceId, delivery)
      return jsonResponse(req, METHODS, 200, {
        instance,
        onboarding_url: link,
        delivery: deliveryResponse(delivery, recorded),
      })
    }
    if (action === 'rotate' && link) {
      /*
       * Rotate emails the new link only when asked. Without send_email it
       * records nothing, so the delivery record keeps telling the truth about
       * the last send that did happen instead of being overwritten with a
       * 'skipped' nobody attempted.
       */
      if (!rotateSendEmail) {
        return jsonResponse(req, METHODS, 200, {
          instance,
          onboarding_url: link,
        })
      }
      const workspace = await staffWorkspace(admin, workspaceId, user.id, tokenIssuedAt, false)
      const changesRequested = instance.status === 'changes_requested'
      const delivery = await sendOnboardingEmail({
        kind: changesRequested ? 'changes_requested' : 'invitation',
        workspaceName: responseString(workspace.name, 'workspace name', 200),
        recipientName: responseString(instance.recipient_name, 'recipient name', 200),
        recipientEmail: normalizeEmail(responseString(instance.recipient_email, 'recipient email', 254)),
        url: link,
        expiresAt: responseString(instance.capability_expires_at, 'capability expiry', 64),
        accentColor: typeof instance.accent_color === 'string' ? instance.accent_color : undefined,
        replyTo: await workspaceReplyTo(admin, workspaceId),
        experienceTitle: typeof instance.experience_title === 'string' ? instance.experience_title : null,
        experienceBody: typeof instance.experience_body === 'string' ? instance.experience_body : null,
      })
      const recorded = changesRequested
        ? await recordChangeRequestDelivery(admin, instanceId, delivery)
        : await recordDelivery(admin, instanceId, delivery)
      return jsonResponse(req, METHODS, 200, {
        instance,
        onboarding_url: link,
        delivery: deliveryResponse(delivery, recorded),
      })
    }
    return jsonResponse(req, METHODS, 200, {
      instance,
      ...(link ? { onboarding_url: link } : {}),
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
