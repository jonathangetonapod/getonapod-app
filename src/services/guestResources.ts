import { supabase } from '@/lib/supabase'
import { safeExternalUrl } from '@/lib/externalUrl'
import {
  guestResourceCharacterLength,
  hasMeaningfulGuestResourceContent,
  isCanonicalGuestResourceContent,
  normalizeGuestResourceContent,
} from '@/lib/guestResourceContent'
import { toFunctionError } from '@/lib/functionErrors'

export type ResourceType = 'article' | 'video' | 'download' | 'link'
export type ResourceCategory = 'preparation' | 'technical_setup' | 'best_practices' | 'promotion' | 'examples' | 'templates'

export interface GuestResource {
  id: string
  title: string
  description: string
  content: string | null
  category: ResourceCategory
  type: ResourceType
  url: string | null
  file_url: string | null
  featured: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface GuestResourceCreateInput {
  title: string
  description: string
  content?: string | null
  category: ResourceCategory
  type: ResourceType
  url?: string | null
  file_url?: string | null
  featured?: boolean
  display_order?: number
}

export type GuestResourceUpdateInput = Partial<GuestResourceCreateInput>

export interface PortalGuestResource {
  id: string
  title: string
  description: string
  content: string | null
  category: ResourceCategory
  type: ResourceType
  url: string | null
  file_url: string | null
  featured: boolean
  display_order: number
  published_at: string
  updated_at: string
}

export interface PortalGuestResourcesRequest {
  clientId: string
  sessionToken?: string
  platformAdminImpersonation?: boolean
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PORTAL_RESOURCE_PAGE_SIZE = 100
const MAX_PORTAL_RESOURCES = 1_000
const RESOURCE_CATEGORIES: ResourceCategory[] = ['preparation', 'technical_setup', 'best_practices', 'promotion', 'examples', 'templates']
const RESOURCE_TYPES: ResourceType[] = ['article', 'video', 'download', 'link']
const FORBIDDEN_PORTAL_RESOURCE_FIELDS = ['workspace_id', 'status', 'visibility', 'client_ids', 'source_template_id']

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNullableSafeUrl(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && Boolean(safeExternalUrl(value)))
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function parsePortalGuestResource(value: unknown): PortalGuestResource {
  if (!isRecord(value) || FORBIDDEN_PORTAL_RESOURCE_FIELDS.some((field) => field in value)) {
    throw new Error('The portal guest resource response was invalid.')
  }
  const resourceType = value.type as ResourceType
  if (
    typeof value.id !== 'string'
    || !UUID_PATTERN.test(value.id)
    || typeof value.title !== 'string'
    || !value.title.trim()
    || guestResourceCharacterLength(value.title) > 200
    || typeof value.description !== 'string'
    || !value.description.trim()
    || guestResourceCharacterLength(value.description) > 2_000
    || !isNullableString(value.content)
    || (value.content !== null && !isCanonicalGuestResourceContent(value.content))
    || !RESOURCE_CATEGORIES.includes(value.category as ResourceCategory)
    || !RESOURCE_TYPES.includes(resourceType)
    || !isNullableSafeUrl(value.url)
    || !isNullableSafeUrl(value.file_url)
    || (resourceType === 'article' && !hasMeaningfulGuestResourceContent(value.content))
    || ((resourceType === 'video' || resourceType === 'link') && value.url === null)
    || (resourceType === 'download' && value.file_url === null)
    || typeof value.featured !== 'boolean'
    || typeof value.display_order !== 'number'
    || !Number.isSafeInteger(value.display_order)
    || value.display_order < 0
    || value.display_order > 1_000_000
    || typeof value.published_at !== 'string'
    || !value.published_at
    || !Number.isFinite(Date.parse(value.published_at))
    || typeof value.updated_at !== 'string'
    || !value.updated_at
    || !Number.isFinite(Date.parse(value.updated_at))
  ) {
    throw new Error('The portal guest resource response was invalid.')
  }

  return {
    id: value.id.toLowerCase(),
    title: value.title,
    description: value.description,
    content: value.content,
    category: value.category as ResourceCategory,
    type: resourceType,
    url: value.url,
    file_url: value.file_url,
    featured: value.featured,
    display_order: value.display_order,
    published_at: value.published_at,
    updated_at: value.updated_at,
  }
}

/**
 * Fetch the published resources visible to one authenticated portal client.
 * A bearer may only be omitted for an explicit platform-admin impersonation.
 */
export async function getPortalGuestResources({
  clientId,
  sessionToken,
  platformAdminImpersonation = false,
}: PortalGuestResourcesRequest): Promise<PortalGuestResource[]> {
  const canonicalClientId = clientId.trim().toLowerCase()
  if (!UUID_PATTERN.test(canonicalClientId)) throw new Error('Portal client ID is invalid.')

  const token = sessionToken?.trim() || ''
  if (!token && !platformAdminImpersonation) {
    throw new Error('A valid portal session is required to load guest resources.')
  }

  const resources: PortalGuestResource[] = []
  let expectedTotal: number | null = null

  while (expectedTotal === null || resources.length < expectedTotal) {
    const offset = resources.length
    const body: {
      clientId: string
      sessionToken?: string
      limit: number
      offset: number
    } = {
      clientId: canonicalClientId,
      limit: PORTAL_RESOURCE_PAGE_SIZE,
      offset,
    }
    if (token) body.sessionToken = token

    const { data, error } = await supabase.functions.invoke('get-guest-resources', { body })
    if (error) throw await toFunctionError(error, 'Failed to fetch guest resources.')
    if (
      !isRecord(data)
      || data.success !== true
      || !Array.isArray(data.resources)
      || typeof data.total !== 'number'
      || !Number.isSafeInteger(data.total)
      || data.total < 0
      || data.total > MAX_PORTAL_RESOURCES
      || typeof data.limit !== 'number'
      || data.limit !== PORTAL_RESOURCE_PAGE_SIZE
      || typeof data.offset !== 'number'
      || data.offset !== offset
      || data.resources.length > PORTAL_RESOURCE_PAGE_SIZE
      || (expectedTotal !== null && data.total !== expectedTotal)
      || (data.resources.length === 0 && resources.length < data.total)
    ) {
      throw new Error('The portal guest resources response was invalid.')
    }

    expectedTotal = data.total
    resources.push(...data.resources.map(parsePortalGuestResource))
    if (resources.length > expectedTotal) {
      throw new Error('The portal guest resources response was invalid.')
    }
  }

  if (new Set(resources.map((resource) => resource.id)).size !== resources.length) {
    throw new Error('The portal guest resources response was invalid.')
  }
  return resources
}

export interface ResourceView {
  id: string
  resource_id: string
  client_id: string
  viewed_at: string
}

/**
 * Get all guest resources with optional filtering
 */
export async function getGuestResources(options?: {
  category?: ResourceCategory
  featured?: boolean
}) {
  let query = supabase
    .from('guest_resources')
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false })

  // Filter by category
  if (options?.category) {
    query = query.eq('category', options.category)
  }

  // Filter by featured
  if (options?.featured !== undefined) {
    query = query.eq('featured', options.featured)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Failed to fetch guest resources: ${error.message}`)
  }

  return data as GuestResource[]
}

/**
 * Get a single guest resource by ID
 */
export async function getGuestResourceById(resourceId: string) {
  const { data, error } = await supabase
    .from('guest_resources')
    .select('*')
    .eq('id', resourceId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch guest resource: ${error.message}`)
  }

  return data as GuestResource
}

function normalizeRequiredTemplateText(value: string, field: string, maximum: number): string {
  if (typeof value !== 'string') throw new Error(`${field} must be text.`)
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  if (guestResourceCharacterLength(normalized) > maximum) throw new Error(`${field} must be ${maximum.toLocaleString()} characters or fewer.`)
  return normalized
}

function normalizeOptionalTemplateContent(value: string | null | undefined): string | null {
  return normalizeGuestResourceContent(value)
}

function normalizeOptionalTemplateUrl(
  value: string | null | undefined,
  field: 'Resource URL' | 'File URL',
): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new Error(`${field} must be text.`)
  const normalized = value.trim()
  if (!normalized) return null
  if (guestResourceCharacterLength(normalized) > 2_048) throw new Error(`${field} must be 2,048 characters or fewer.`)
  const safeUrl = safeExternalUrl(normalized)
  if (!safeUrl) throw new Error(`${field} must be a safe HTTP or HTTPS URL without credentials.`)
  return safeUrl
}

function normalizeTemplateDisplayOrder(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error('Display order must be an integer between 0 and 1,000,000.')
  }
  return value
}

function normalizeTemplateCategory(value: ResourceCategory): ResourceCategory {
  if (!RESOURCE_CATEGORIES.includes(value)) throw new Error('Resource category is invalid.')
  return value
}

function normalizeTemplateType(value: ResourceType): ResourceType {
  if (!RESOURCE_TYPES.includes(value)) throw new Error('Resource type is invalid.')
  return value
}

function normalizeCreateTemplateInput(input: GuestResourceCreateInput) {
  if (input.featured !== undefined && typeof input.featured !== 'boolean') {
    throw new Error('Featured must be a boolean.')
  }
  const type = normalizeTemplateType(input.type)
  const content = normalizeOptionalTemplateContent(input.content)
  const url = normalizeOptionalTemplateUrl(input.url, 'Resource URL')
  const fileUrl = normalizeOptionalTemplateUrl(input.file_url, 'File URL')
  if (type === 'article' && !hasMeaningfulGuestResourceContent(content)) {
    throw new Error('Article templates require meaningful content.')
  }
  if ((type === 'video' || type === 'link') && !url) {
    throw new Error('Video and link templates require a resource URL.')
  }
  if (type === 'download' && !fileUrl) {
    throw new Error('Download templates require a file URL.')
  }
  return {
    title: normalizeRequiredTemplateText(input.title, 'Title', 200),
    description: normalizeRequiredTemplateText(input.description, 'Description', 2_000),
    content,
    category: normalizeTemplateCategory(input.category),
    type,
    url,
    file_url: fileUrl,
    featured: input.featured ?? false,
    display_order: normalizeTemplateDisplayOrder(input.display_order ?? 0),
  }
}

function normalizeUpdateTemplateInput(updates: GuestResourceUpdateInput) {
  const normalized: Record<string, unknown> = {}
  if (updates.title !== undefined) normalized.title = normalizeRequiredTemplateText(updates.title, 'Title', 200)
  if (updates.description !== undefined) normalized.description = normalizeRequiredTemplateText(updates.description, 'Description', 2_000)
  if (updates.content !== undefined) normalized.content = normalizeOptionalTemplateContent(updates.content)
  if (updates.category !== undefined) normalized.category = normalizeTemplateCategory(updates.category)
  if (updates.type !== undefined) normalized.type = normalizeTemplateType(updates.type)
  if (updates.url !== undefined) normalized.url = normalizeOptionalTemplateUrl(updates.url, 'Resource URL')
  if (updates.file_url !== undefined) normalized.file_url = normalizeOptionalTemplateUrl(updates.file_url, 'File URL')
  if (updates.featured !== undefined) {
    if (typeof updates.featured !== 'boolean') throw new Error('Featured must be a boolean.')
    normalized.featured = updates.featured
  }
  if (updates.display_order !== undefined) {
    normalized.display_order = normalizeTemplateDisplayOrder(updates.display_order)
  }
  if (
    (normalized.type === 'video' || normalized.type === 'link')
    && (normalized.url === undefined || normalized.url === null)
  ) {
    throw new Error('Video and link templates require a resource URL.')
  }
  if (
    normalized.type === 'download'
    && (normalized.file_url === undefined || normalized.file_url === null)
  ) {
    throw new Error('Download templates require a file URL.')
  }
  if (
    normalized.type === 'article'
    && !hasMeaningfulGuestResourceContent(normalized.content as string | null | undefined)
  ) {
    throw new Error('Article templates require meaningful content.')
  }
  return normalized
}

/**
 * Create a new guest resource (admin only)
 */
export async function createGuestResource(input: GuestResourceCreateInput) {
  const normalizedInput = normalizeCreateTemplateInput(input)
  const { data, error } = await supabase
    .from('guest_resources')
    .insert(normalizedInput)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create guest resource: ${error.message}`)
  }

  return data as GuestResource
}

/**
 * Update a guest resource (admin only)
 */
export async function updateGuestResource(
  resourceId: string,
  updates: GuestResourceUpdateInput,
) {
  const normalizedUpdates = normalizeUpdateTemplateInput(updates)
  const { data, error } = await supabase
    .from('guest_resources')
    .update({
      ...normalizedUpdates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', resourceId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update guest resource: ${error.message}`)
  }

  return data as GuestResource
}

/**
 * Delete a guest resource (admin only)
 */
export async function deleteGuestResource(resourceId: string) {
  const { error } = await supabase
    .from('guest_resources')
    .delete()
    .eq('id', resourceId)

  if (error) {
    throw new Error(`Failed to delete guest resource: ${error.message}`)
  }
}

/**
 * Track a resource view
 */
export async function trackResourceView(resourceId: string, clientId: string) {
  const { data, error } = await supabase
    .from('guest_resource_views')
    .insert({
      resource_id: resourceId,
      client_id: clientId,
    })
    .select()
    .single()

  if (error) {
    // Don't throw error for tracking failures
    console.error('Failed to track resource view:', error)
    return null
  }

  return data as ResourceView
}

/**
 * Get resource views for a client
 */
export async function getClientResourceViews(clientId: string) {
  const { data, error } = await supabase
    .from('guest_resource_views')
    .select('*, guest_resources(*)')
    .eq('client_id', clientId)
    .order('viewed_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch resource views: ${error.message}`)
  }

  return data
}

/**
 * Get view count for a resource
 */
export async function getResourceViewCount(resourceId: string) {
  const { count, error } = await supabase
    .from('guest_resource_views')
    .select('*', { count: 'exact', head: true })
    .eq('resource_id', resourceId)

  if (error) {
    throw new Error(`Failed to fetch view count: ${error.message}`)
  }

  return count || 0
}
