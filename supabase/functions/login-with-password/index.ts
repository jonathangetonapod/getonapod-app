import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface LoginRequest {
  email: string
  password: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { email, password }: LoginRequest = await req.json()
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const userAgent = req.headers.get('user-agent') || 'unknown'

    // Validate input
    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Rate limiting: Check recent failed attempts
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

    const { data: recentAttempts, error: attemptsError } = await supabase
      .from('client_portal_activity_log')
      .select('id')
      .eq('action', 'password_login_failed')
      .gte('created_at', fifteenMinutesAgo)
      .eq('metadata->>email', email)

    if (attemptsError) {
      console.error('Error checking rate limit:', attemptsError)
    }

    if (recentAttempts && recentAttempts.length >= 5) {
      // Log rate limit exceeded
      await supabase.from('client_portal_activity_log').insert({
        client_id: null,
        session_id: null,
        action: 'password_login_rate_limited',
        metadata: { email, ip },
        ip_address: ip,
        user_agent: userAgent
      })

      return new Response(
        JSON.stringify({ error: 'Too many failed login attempts. Please try again in 15 minutes.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find client by email
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, email, portal_access_enabled, portal_password')
      .eq('email', email)
      .single()

    if (clientError || !client) {
      // Log failed attempt (generic message to prevent email enumeration)
      await supabase.from('client_portal_activity_log').insert({
        client_id: null,
        session_id: null,
        action: 'password_login_failed',
        metadata: { email, reason: 'client_not_found', ip },
        ip_address: ip,
        user_agent: userAgent
      })

      return new Response(
        JSON.stringify({ error: 'Invalid email or password' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if portal access is enabled
    if (!client.portal_access_enabled) {
      await supabase.from('client_portal_activity_log').insert({
        client_id: client.id,
        session_id: null,
        action: 'password_login_failed',
        metadata: { email, reason: 'access_disabled', ip },
        ip_address: ip,
        user_agent: userAgent
      })

      return new Response(
        JSON.stringify({ error: 'Portal access is not enabled for this account' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if password is set
    if (!client.portal_password) {
      await supabase.from('client_portal_activity_log').insert({
        client_id: client.id,
        session_id: null,
        action: 'password_login_failed',
        metadata: { email, reason: 'password_not_set', ip },
        ip_address: ip,
        user_agent: userAgent
      })

      return new Response(
        JSON.stringify({ error: 'Password authentication is not set up for this account. Please use magic link login or contact your administrator.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify password (plain text comparison since we store plain text)
    if (password !== client.portal_password) {
      await supabase.from('client_portal_activity_log').insert({
        client_id: client.id,
        session_id: null,
        action: 'password_login_failed',
        metadata: { email, reason: 'incorrect_password', ip },
        ip_address: ip,
        user_agent: userAgent
      })

      return new Response(
        JSON.stringify({ error: 'Invalid email or password' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Password is correct - create session
    const sessionToken = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    const { data: session, error: sessionError } = await supabase
      .from('client_portal_sessions')
      .insert({
        client_id: client.id,
        session_token: sessionToken,
        expires_at: expiresAt.toISOString(),
        ip_address: ip,
        user_agent: userAgent
      })
      .select()
      .single()

    if (sessionError) {
      console.error('Error creating session:', sessionError)
      return new Response(
        JSON.stringify({ error: 'Failed to create session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update last login timestamp
    await supabase
      .from('clients')
      .update({ portal_last_login_at: new Date().toISOString() })
      .eq('id', client.id)

    // Log successful login
    await supabase.from('client_portal_activity_log').insert({
      client_id: client.id,
      session_id: session.id,
      action: 'password_login_success',
      metadata: { email, ip },
      ip_address: ip,
      user_agent: userAgent
    })

    // Return session token and client data
    return new Response(
      JSON.stringify({
        session_token: sessionToken,
        client: {
          id: client.id,
          name: client.name,
          email: client.email
        },
        expires_at: expiresAt.toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in login-with-password:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
