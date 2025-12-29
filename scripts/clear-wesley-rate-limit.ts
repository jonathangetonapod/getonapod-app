import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ysjwveqnwjysldpfqzov.supabase.co'
const supabaseAnonKey = 'sb_publishable_cH4MjtOi8FWAgaTsltLasg_pOvc4752'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function clearRateLimit() {
  const email = 'wez.powell0@gmail.com'
  const clientId = 'c736b28d-e91b-45c4-8841-72ed9ec25837'

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
