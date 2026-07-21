import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const diagnosticClientId = process.env.DIAGNOSTIC_CLIENT_ID

if (!supabaseUrl || !supabaseServiceKey || !diagnosticClientId) {
  throw new Error('VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and DIAGNOSTIC_CLIENT_ID are required')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function clearRateLimit() {
  const clientId = diagnosticClientId

  console.log('🧹 Clearing rate limit for Wesley...\n')

  // Delete recent magic link requests from activity log
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('client_portal_activity_log')
    .delete()
    .eq('client_id', clientId)
    .eq('action', 'request_magic_link')
    .gte('created_at', fifteenMinutesAgo)

  if (error) {
    console.error('❌ Error:', error)
  } else {
    console.log('✅ Rate limit cleared!')
    console.log('Wesley can now request a new magic link')
  }
}

clearRateLimit().catch(console.error)
