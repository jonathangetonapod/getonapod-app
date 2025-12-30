import { supabase } from '@/lib/supabase'

export interface Client {
  id: string
  name: string
  email: string | null
  linkedin_url: string | null
  website: string | null
  calendar_link: string | null
  contact_person: string | null
  first_invoice_paid_date: string | null
  status: 'active' | 'paused' | 'churned'
  notes: string | null
  bio: string | null
  photo_url: string | null
  google_sheet_url: string | null
  created_at: string
  updated_at: string
  // Portal access fields
  portal_access_enabled?: boolean
  portal_last_login_at?: string | null
  portal_invitation_sent_at?: string | null
  portal_password?: string | null
  password_set_at?: string | null
  password_set_by?: string | null
}

export interface ClientWithStats extends Client {
  total_bookings: number
  booked_count: number
  in_progress_count: number
  recorded_count: number
  published_count: number
}

/**
 * Get all clients with optional filtering
 */
export async function getClients(options?: {
  search?: string
  status?: 'active' | 'paused' | 'churned'
  limit?: number
  offset?: number
}) {
  let query = supabase
    .from('clients')
    .select('*', { count: 'exact' })

  // Filter by status
  if (options?.status) {
    query = query.eq('status', options.status)
  }

  // Search by name or email
  if (options?.search) {
    query = query.or(`name.ilike.%${options.search}%,email.ilike.%${options.search}%`)
  }

  // Order by name
  query = query.order('name', { ascending: true })

  // Pagination
  if (options?.limit) {
    query = query.limit(options.limit)
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1)
  }

  const { data, error, count } = await query

  if (error) {
    throw new Error(`Failed to fetch clients: ${error.message}`)
  }

  return { clients: data as Client[], total: count || 0 }
}

/**
 * Get a single client by ID
 */
export async function getClientById(clientId: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch client: ${error.message}`)
  }

  return data as Client
}

/**
 * Create a new client
 */
export async function createClient(input: {
  name: string
  email?: string
  linkedin_url?: string
  website?: string
  calendar_link?: string
  contact_person?: string
  first_invoice_paid_date?: string
  status?: 'active' | 'paused' | 'churned'
  notes?: string
}) {
  const { data, error } = await supabase
    .from('clients')
    .insert([input])
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create client: ${error.message}`)
  }

  return data as Client
}

/**
 * Update an existing client
 */
export async function updateClient(clientId: string, updates: Partial<Client>) {
  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', clientId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update client: ${error.message}`)
  }

  return data as Client
}

/**
 * Delete a client
 */
export async function deleteClient(clientId: string) {
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', clientId)

  if (error) {
    throw new Error(`Failed to delete client: ${error.message}`)
  }
}

/**
 * Set or update client portal password
 */
export async function setClientPassword(clientId: string, password: string, setBy: string = 'Admin') {
  const { error } = await supabase
    .from('clients')
    .update({
      portal_password: password,
      password_set_at: new Date().toISOString(),
      password_set_by: setBy
    })
    .eq('id', clientId)

  if (error) {
    throw new Error(`Failed to set password: ${error.message}`)
  }
}

/**
 * Clear client portal password
 */
export async function clearClientPassword(clientId: string) {
  const { error } = await supabase
    .from('clients')
    .update({
      portal_password: null,
      password_set_at: null,
      password_set_by: null
    })
    .eq('id', clientId)

  if (error) {
    throw new Error(`Failed to clear password: ${error.message}`)
  }
}

/**
 * Generate a random password
 */
export function generatePassword(length: number = 12): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  let password = ''
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)

  for (let i = 0; i < length; i++) {
    password += charset[array[i] % charset.length]
  }

  return password
}

/**
 * Get client statistics
 */
export async function getClientStats() {
  // Total clients
  const { count: totalClients, error: clientsError } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })

  if (clientsError) {
    throw new Error(`Failed to fetch client count: ${clientsError.message}`)
  }

  // Active clients
  const { count: activeClients, error: activeError } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')

  if (activeError) {
    throw new Error(`Failed to fetch active client count: ${activeError.message}`)
  }

  // Total bookings
  const { count: totalBookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })

  if (bookingsError) {
    throw new Error(`Failed to fetch bookings count: ${bookingsError.message}`)
  }

  return {
    totalClients: totalClients || 0,
    activeClients: activeClients || 0,
    totalBookings: totalBookings || 0,
  }
}

/**
 * Upload client photo to Supabase Storage
 */
export async function uploadClientPhoto(clientId: string, file: File) {
  const fileExt = file.name.split('.').pop()
  const fileName = `${clientId}-${Date.now()}.${fileExt}`
  const filePath = `client-photos/${fileName}`

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('client-assets')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true
    })

  if (uploadError) {
    throw new Error(`Failed to upload photo: ${uploadError.message}`)
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('client-assets')
    .getPublicUrl(filePath)

  // Update client record with photo URL
  const { data, error } = await supabase
    .from('clients')
    .update({ photo_url: publicUrl })
    .eq('id', clientId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update client photo URL: ${error.message}`)
  }

  return data as Client
}

/**
 * Remove client photo
 */
export async function removeClientPhoto(clientId: string, photoUrl: string) {
  // Extract file path from URL
  const urlParts = photoUrl.split('/client-assets/')
  if (urlParts.length < 2) {
    throw new Error('Invalid photo URL')
  }
  const filePath = `client-photos/${urlParts[1]}`

  // Delete from storage
  const { error: deleteError } = await supabase.storage
    .from('client-assets')
    .remove([filePath])

  if (deleteError) {
    console.error('Failed to delete photo from storage:', deleteError)
    // Continue anyway to clear the URL
  }

  // Clear photo URL in database
  const { data, error } = await supabase
    .from('clients')
    .update({ photo_url: null })
    .eq('id', clientId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to clear client photo URL: ${error.message}`)
  }

  return data as Client
}
