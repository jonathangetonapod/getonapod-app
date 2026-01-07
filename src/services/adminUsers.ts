import { supabase } from '@/lib/supabase'

export interface AdminUser {
  id: string
  email: string
  name: string | null
  added_by: string | null
  created_at: string
  updated_at: string
}

// Cache for admin emails to avoid repeated DB calls
let adminEmailsCache: string[] | null = null
let cacheTimestamp: number = 0
const CACHE_TTL = 60000 // 1 minute cache

/**
 * Get all admin users from database
 */
export async function getAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('admin_users')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching admin users:', error)
    throw new Error(`Failed to fetch admin users: ${error.message}`)
  }

  return data || []
}

/**
 * Get admin emails (with caching)
 */
export async function getAdminEmails(): Promise<string[]> {
  const now = Date.now()

  // Return cached value if still valid
  if (adminEmailsCache && (now - cacheTimestamp) < CACHE_TTL) {
    return adminEmailsCache
  }

  try {
    const { data, error } = await supabase
      .from('admin_users')
      .select('email')

    if (error) {
      console.error('Error fetching admin emails:', error)
      // Return cached value on error, or empty array
      return adminEmailsCache || []
    }

    adminEmailsCache = (data || []).map(u => u.email.toLowerCase())
    cacheTimestamp = now
    return adminEmailsCache
  } catch (error) {
    console.error('Error fetching admin emails:', error)
    return adminEmailsCache || []
  }
}

/**
 * Check if an email is an admin (with caching)
 */
export async function isAdminEmailAsync(email: string | undefined): Promise<boolean> {
  if (!email) return false

  const adminEmails = await getAdminEmails()
  return adminEmails.includes(email.toLowerCase())
}

/**
 * Add a new admin user
 */
export async function addAdminUser(email: string, name?: string, addedBy?: string): Promise<AdminUser> {
  const { data, error } = await supabase
    .from('admin_users')
    .insert({
      email: email.toLowerCase(),
      name: name || null,
      added_by: addedBy || null
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') { // Unique constraint violation
      throw new Error('This email is already an admin')
    }
    console.error('Error adding admin user:', error)
    throw new Error(`Failed to add admin user: ${error.message}`)
  }

  // Clear cache
  adminEmailsCache = null

  return data
}

/**
 * Remove an admin user by ID
 */
export async function removeAdminUser(id: string): Promise<void> {
  const { error } = await supabase
    .from('admin_users')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error removing admin user:', error)
    throw new Error(`Failed to remove admin user: ${error.message}`)
  }

  // Clear cache
  adminEmailsCache = null
}

/**
 * Clear the admin emails cache (call after modifications)
 */
export function clearAdminCache(): void {
  adminEmailsCache = null
  cacheTimestamp = 0
}
