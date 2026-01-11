import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Client ID from the logs
const clientId = 'fe2521cb-7782-4321-a065-08cdfdf319da'

async function checkSessions() {
  console.log('\n🔍 Checking sessions for client:', clientId)
  console.log('=' .repeat(80))

  // Get all sessions for this client
  const { data: sessions, error } = await supabase
    .from('client_portal_sessions')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Error fetching sessions:', error)
    return
  }

  console.log(`\n✅ Found ${sessions.length} session(s) for this client:\n`)

  sessions.forEach((session, index) => {
    const expiresAt = new Date(session.expires_at)
    const createdAt = new Date(session.created_at)
    const now = new Date()
    const isExpired = expiresAt < now

    console.log(`Session ${index + 1}:`)
    console.log(`  Token: ${session.session_token}`)
    console.log(`  Created: ${createdAt.toISOString()}`)
    console.log(`  Expires: ${expiresAt.toISOString()}`)
    console.log(`  Status: ${isExpired ? '❌ EXPIRED' : '✅ Valid'}`)
    console.log(`  IP: ${session.ip_address || 'unknown'}`)
    console.log(`  User Agent: ${session.user_agent || 'unknown'}`)
    console.log()
  })

  // Check if there are any expired sessions that should be cleaned up
  const expiredCount = sessions.filter(s => new Date(s.expires_at) < new Date()).length
  if (expiredCount > 0) {
    console.log(`⚠️  Note: ${expiredCount} expired session(s) found (should be cleaned up)`)
  }
}

checkSessions().catch(console.error)
