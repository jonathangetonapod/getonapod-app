import { supabase } from './supabase'

// Fallback admin email (always has access even if DB fails)
export const FALLBACK_ADMIN_EMAIL = 'jonathan@getonapod.com'

// Cache for admin emails
let adminEmailsCache: string[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 60000 // 1 minute

// Synchronous check (uses cache or fallback)
export const isAdminEmail = (email: string | undefined): boolean => {
  if (!email) return false
  const normalizedEmail = email.toLowerCase()

  // Always allow fallback admin
  if (normalizedEmail === FALLBACK_ADMIN_EMAIL) return true

  // Check cache if available
  if (adminEmailsCache) {
    return adminEmailsCache.includes(normalizedEmail)
  }

  // If no cache, only allow fallback
  return false
}

// Async check with database lookup
export const isAdminEmailAsync = async (email: string | undefined): Promise<boolean> => {
  if (!email) return false
  const normalizedEmail = email.toLowerCase()

  // Always allow fallback admin
  if (normalizedEmail === FALLBACK_ADMIN_EMAIL) return true

  // Check cache first
  const now = Date.now()
  if (adminEmailsCache && (now - cacheTimestamp) < CACHE_TTL) {
    return adminEmailsCache.includes(normalizedEmail)
  }

  // Fetch from database
  try {
    const { data, error } = await supabase
      .from('admin_users')
      .select('email')

    if (error) {
      console.error('Error fetching admin emails:', error)
      return normalizedEmail === FALLBACK_ADMIN_EMAIL
    }

    adminEmailsCache = (data || []).map(u => u.email.toLowerCase())
    cacheTimestamp = now

    return adminEmailsCache.includes(normalizedEmail)
  } catch (error) {
    console.error('Error checking admin status:', error)
    return normalizedEmail === FALLBACK_ADMIN_EMAIL
  }
}

// Preload admin emails into cache
export const preloadAdminEmails = async (): Promise<void> => {
  try {
    const { data } = await supabase
      .from('admin_users')
      .select('email')

    if (data) {
      adminEmailsCache = data.map(u => u.email.toLowerCase())
      cacheTimestamp = Date.now()
    }
  } catch (error) {
    console.error('Error preloading admin emails:', error)
  }
}

// For backwards compatibility
export const ALLOWED_ADMIN_EMAILS = [FALLBACK_ADMIN_EMAIL]
