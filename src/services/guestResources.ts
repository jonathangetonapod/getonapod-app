import { supabase } from '@/lib/supabase'

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

/**
 * Create a new guest resource (admin only)
 */
export async function createGuestResource(input: {
  title: string
  description: string
  content?: string
  category: ResourceCategory
  type: ResourceType
  url?: string
  file_url?: string
  featured?: boolean
  display_order?: number
}) {
  const { data, error } = await supabase
    .from('guest_resources')
    .insert({
      title: input.title,
      description: input.description,
      content: input.content || null,
      category: input.category,
      type: input.type,
      url: input.url || null,
      file_url: input.file_url || null,
      featured: input.featured || false,
      display_order: input.display_order || 0,
    })
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
  updates: {
    title?: string
    description?: string
    content?: string
    category?: ResourceCategory
    type?: ResourceType
    url?: string
    file_url?: string
    featured?: boolean
    display_order?: number
  }
) {
  const { data, error } = await supabase
    .from('guest_resources')
    .update({
      ...updates,
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
