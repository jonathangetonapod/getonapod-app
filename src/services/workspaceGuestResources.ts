import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'
import { safeExternalUrl } from '@/lib/externalUrl'
import {
  guestResourceCharacterLength,
  hasMeaningfulGuestResourceContent,
  isCanonicalGuestResourceContent,
  normalizeGuestResourceContent,
} from '@/lib/guestResourceContent'
import type { ResourceCategory, ResourceType } from '@/services/guestResources'

export type WorkspaceResourceStatus = 'draft' | 'published' | 'archived'
export type WorkspaceResourceVisibility = 'all_clients' | 'selected_clients'

export interface WorkspaceGuestResource {
  id: string
  workspace_id: string
  title: string
  description: string
  content: string | null
  category: ResourceCategory
  type: ResourceType
  url: string | null
  file_url: string | null
  featured: boolean
  display_order: number
  status: WorkspaceResourceStatus
  visibility: WorkspaceResourceVisibility
  client_ids: string[]
  created_at: string
  updated_at: string
}

export interface WorkspaceGuestResourceInput {
  title: string
  description: string
  content?: string
  category: ResourceCategory
  type: ResourceType
  url?: string
  file_url?: string
  featured: boolean
  display_order: number
  status: WorkspaceResourceStatus
  visibility: WorkspaceResourceVisibility
  client_ids: string[]
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RESOURCE_CATEGORIES: ResourceCategory[] = [
  'preparation',
  'technical_setup',
  'best_practices',
  'promotion',
  'examples',
  'templates',
]
const RESOURCE_TYPES: ResourceType[] = ['article', 'video', 'download', 'link']
const RESOURCE_STATUSES: WorkspaceResourceStatus[] = ['draft', 'published', 'archived']
const RESOURCE_VISIBILITIES: WorkspaceResourceVisibility[] = ['all_clients', 'selected_clients']

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function canonicalUuid(value: string, label: string): string {
  const canonical = value.trim().toLowerCase()
  if (!UUID_PATTERN.test(canonical)) throw new Error(`${label} is invalid.`)
  return canonical
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function nullableSafeUrl(value: unknown): value is string | null {
  return value === null || (
    typeof value === 'string'
    && guestResourceCharacterLength(value) <= 2_048
    && Boolean(safeExternalUrl(value))
  )
}

function parseResource(
  value: unknown,
  expectedWorkspaceId: string,
): WorkspaceGuestResource {
  if (!isRecord(value)) throw new Error('The guest resource response was invalid.')

  const id = typeof value.id === 'string'
    ? canonicalUuid(value.id, 'The guest resource ID')
    : ''
  const workspaceId = typeof value.workspace_id === 'string'
    ? canonicalUuid(value.workspace_id, 'The guest resource workspace ID')
    : ''
  const clientIds = Array.isArray(value.client_ids)
    ? value.client_ids.map((clientId) => (
        typeof clientId === 'string' ? canonicalUuid(clientId, 'A guest resource client ID') : ''
      ))
    : null
  const resourceType = value.type as ResourceType
  const resourceStatus = value.status as WorkspaceResourceStatus

  if (
    !id
    || workspaceId !== expectedWorkspaceId
    || typeof value.title !== 'string'
    || !value.title.trim()
    || guestResourceCharacterLength(value.title) > 200
    || typeof value.description !== 'string'
    || !value.description.trim()
    || guestResourceCharacterLength(value.description) > 2_000
    || !nullableString(value.content)
    || (value.content !== null && !isCanonicalGuestResourceContent(value.content))
    || !RESOURCE_CATEGORIES.includes(value.category as ResourceCategory)
    || !RESOURCE_TYPES.includes(resourceType)
    || !nullableSafeUrl(value.url)
    || !nullableSafeUrl(value.file_url)
    || typeof value.featured !== 'boolean'
    || typeof value.display_order !== 'number'
    || !Number.isSafeInteger(value.display_order)
    || value.display_order < 0
    || value.display_order > 1_000_000
    || !RESOURCE_STATUSES.includes(resourceStatus)
    || !RESOURCE_VISIBILITIES.includes(value.visibility as WorkspaceResourceVisibility)
    || !clientIds
    || clientIds.some((clientId) => !clientId)
    || clientIds.length > 500
    || new Set(clientIds).size !== clientIds.length
    || (value.visibility === 'all_clients' && clientIds.length !== 0)
    || (
      resourceStatus === 'published'
      && (
        (resourceType === 'article' && !hasMeaningfulGuestResourceContent(value.content))
        ||
        ((resourceType === 'video' || resourceType === 'link') && value.url === null)
        || (resourceType === 'download' && value.file_url === null)
      )
    )
    || typeof value.created_at !== 'string'
    || !value.created_at
    || !Number.isFinite(Date.parse(value.created_at))
    || typeof value.updated_at !== 'string'
    || !value.updated_at
    || !Number.isFinite(Date.parse(value.updated_at))
  ) {
    throw new Error('The guest resource response was invalid.')
  }

  return {
    id,
    workspace_id: workspaceId,
    title: value.title,
    description: value.description,
    content: value.content,
    category: value.category as ResourceCategory,
    type: resourceType,
    url: value.url,
    file_url: value.file_url,
    featured: value.featured,
    display_order: value.display_order,
    status: resourceStatus,
    visibility: value.visibility as WorkspaceResourceVisibility,
    client_ids: clientIds,
    created_at: value.created_at,
    updated_at: value.updated_at,
  }
}

function cleanOptionalUrl(value: string | undefined, label: string): string | null {
  const trimmed = value?.trim() || ''
  if (!trimmed) return null
  if (!safeExternalUrl(trimmed)) throw new Error(`${label} must be a valid HTTP or HTTPS URL.`)
  return trimmed
}

function cleanInput(input: WorkspaceGuestResourceInput) {
  const title = input.title.trim()
  const description = input.description.trim()
  if (!title) throw new Error('Resource title is required.')
  if (guestResourceCharacterLength(title) > 200) throw new Error('Resource title must be 200 characters or fewer.')
  if (!description) throw new Error('Resource description is required.')
  if (guestResourceCharacterLength(description) > 2_000) throw new Error('Resource description must be 2,000 characters or fewer.')
  const content = normalizeGuestResourceContent(input.content, 'Resource content')
  if (!RESOURCE_CATEGORIES.includes(input.category)) throw new Error('Resource category is invalid.')
  if (!RESOURCE_TYPES.includes(input.type)) throw new Error('Resource type is invalid.')
  if (!RESOURCE_STATUSES.includes(input.status)) throw new Error('Resource status is invalid.')
  if (!RESOURCE_VISIBILITIES.includes(input.visibility)) throw new Error('Resource visibility is invalid.')
  if (!Number.isSafeInteger(input.display_order) || input.display_order < 0 || input.display_order > 1_000_000) {
    throw new Error('Display order must be an integer between 0 and 1,000,000.')
  }

  if (!Array.isArray(input.client_ids) || input.client_ids.length > 500) {
    throw new Error('A resource can be assigned to at most 500 clients.')
  }
  const clientIds = [...new Set(input.client_ids.map((clientId) => (
    canonicalUuid(clientId, 'A selected client ID')
  )))]
  if (input.visibility === 'all_clients' && clientIds.length > 0) {
    throw new Error('All-client resources cannot include selected client assignments.')
  }
  if (input.visibility === 'selected_clients' && clientIds.length === 0) {
    throw new Error('Select at least one client for this resource.')
  }

  const url = cleanOptionalUrl(input.url, 'Resource URL')
  const fileUrl = cleanOptionalUrl(input.file_url, 'File URL')
  if (
    input.status === 'published'
    && (input.type === 'video' || input.type === 'link')
    && !url
  ) {
    throw new Error('Published video and link resources require a resource URL.')
  }
  if (input.status === 'published' && input.type === 'download' && !fileUrl) {
    throw new Error('Published download resources require a file URL.')
  }
  if (
    input.status === 'published'
    && input.type === 'article'
    && !hasMeaningfulGuestResourceContent(content)
  ) {
    throw new Error('Published article resources require meaningful content.')
  }

  return {
    title,
    description,
    content,
    category: input.category,
    type: input.type,
    url,
    file_url: fileUrl,
    featured: input.featured,
    display_order: input.display_order,
    status: input.status,
    visibility: input.visibility,
    client_ids: clientIds,
  }
}

export async function listWorkspaceGuestResources(workspaceId: string): Promise<WorkspaceGuestResource[]> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const { data, error } = await supabase.functions.invoke('workspace-guest-resources', {
    body: { action: 'list', workspace_id: canonicalWorkspaceId },
  })

  if (error) throw await toFunctionError(error, 'Failed to fetch guest resources.')
  if (!isRecord(data) || !Array.isArray(data.resources)) {
    throw new Error('The guest resources response was invalid.')
  }
  return data.resources.map((resource) => parseResource(resource, canonicalWorkspaceId))
}

export async function createWorkspaceGuestResource(
  workspaceId: string,
  input: WorkspaceGuestResourceInput,
): Promise<WorkspaceGuestResource> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const { data, error } = await supabase.functions.invoke('workspace-guest-resources', {
    body: {
      action: 'create',
      workspace_id: canonicalWorkspaceId,
      resource: cleanInput(input),
    },
  })

  if (error) throw await toFunctionError(error, 'Failed to create guest resource.')
  if (!isRecord(data) || data.success !== true) {
    throw new Error('The guest resource response was invalid.')
  }
  return parseResource(data.resource, canonicalWorkspaceId)
}

export async function updateWorkspaceGuestResource(
  workspaceId: string,
  resourceId: string,
  input: WorkspaceGuestResourceInput,
): Promise<WorkspaceGuestResource> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const canonicalResourceId = canonicalUuid(resourceId, 'Guest resource ID')
  const { data, error } = await supabase.functions.invoke('workspace-guest-resources', {
    body: {
      action: 'update',
      workspace_id: canonicalWorkspaceId,
      resource_id: canonicalResourceId,
      resource: cleanInput(input),
    },
  })

  if (error) throw await toFunctionError(error, 'Failed to update guest resource.')
  if (!isRecord(data) || data.success !== true) {
    throw new Error('The guest resource response was invalid.')
  }
  const resource = parseResource(data.resource, canonicalWorkspaceId)
  if (resource.id !== canonicalResourceId) throw new Error('The guest resource response was invalid.')
  return resource
}

export async function deleteWorkspaceGuestResource(workspaceId: string, resourceId: string): Promise<void> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const canonicalResourceId = canonicalUuid(resourceId, 'Guest resource ID')
  const { data, error } = await supabase.functions.invoke('workspace-guest-resources', {
    body: {
      action: 'delete',
      workspace_id: canonicalWorkspaceId,
      resource_id: canonicalResourceId,
    },
  })

  if (error) throw await toFunctionError(error, 'Failed to delete guest resource.')
  if (!isRecord(data) || data.success !== true) {
    throw new Error('The guest resource response was invalid.')
  }
}
