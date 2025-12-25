// Admin email whitelist
// Only these email addresses can access the admin dashboard
export const ALLOWED_ADMIN_EMAILS = [
  'jonathan@getonapod.com'
]

export const isAdminEmail = (email: string | undefined): boolean => {
  if (!email) return false
  return ALLOWED_ADMIN_EMAILS.includes(email.toLowerCase())
}
