import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const platformAdminJwt = process.env.DIAGNOSTIC_PLATFORM_ADMIN_JWT
const diagnosticClientId = process.env.DIAGNOSTIC_CLIENT_ID

if (!supabaseUrl || !supabaseAnonKey || !platformAdminJwt || !diagnosticClientId) {
  throw new Error('VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, DIAGNOSTIC_PLATFORM_ADMIN_JWT, and DIAGNOSTIC_CLIENT_ID are required')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { headers: { Authorization: `Bearer ${platformAdminJwt}` } },
})

async function checkWesleySession() {
  const clientId = diagnosticClientId

  console.log('🔍 Checking Wesley\'s sessions...\n')

  // Try to call the Edge Function without a session token (like admin impersonation)
  console.log('🧪 Test 1: Calling Edge Function WITHOUT session token (admin mode)...')
  const { data: test1, error: error1 } = await supabase.functions.invoke('get-client-bookings', {
    body: {
      clientId: clientId
    }
  })

  console.log('Raw response:', { data: test1, error: error1 })

  if (error1) {
    console.error('❌ Error:', error1.message)
  } else if (test1?.error) {
    console.error('❌ Function returned error:', test1.error)
  } else {
    console.log(`✅ SUCCESS: Got ${test1?.bookings?.length || 0} bookings`)
    if (test1?.bookings?.[0]) {
      console.log('First booking:', test1.bookings[0].podcast_name)
    }
  }

  console.log('\n---\n')

  // Now test with a fake session token to see the error message
  console.log('🧪 Test 2: Calling with FAKE session token to see error...')
  const { data: test2, error: error2 } = await supabase.functions.invoke('get-client-bookings', {
    body: {
      clientId: clientId,
      sessionToken: 'fake-token-12345'
    }
  })

  if (error2) {
    console.error('❌ Error:', error2)
  } else if (test2.error) {
    console.log('📝 Function error message:', test2.error)
  } else {
    console.log('Unexpected success:', test2)
  }
}

checkWesleySession().catch(console.error)
