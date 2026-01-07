import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Create admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Verify the requesting user is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the user from the JWT
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !requestingUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if requesting user is an admin
    const { data: adminCheck } = await supabaseAdmin
      .from('admin_users')
      .select('id')
      .eq('email', requestingUser.email?.toLowerCase())
      .single()

    if (!adminCheck) {
      return new Response(
        JSON.stringify({ error: 'Only admins can manage admin users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { action, ...params } = await req.json()

    switch (action) {
      case 'list': {
        // List all admin users
        const { data: admins, error } = await supabaseAdmin
          .from('admin_users')
          .select('*')
          .order('created_at', { ascending: true })

        if (error) throw error

        return new Response(
          JSON.stringify({ success: true, admins }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'create': {
        const { email, password, name } = params

        if (!email || !password) {
          return new Response(
            JSON.stringify({ error: 'Email and password are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (password.length < 8) {
          return new Response(
            JSON.stringify({ error: 'Password must be at least 8 characters' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Create the auth user
        const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: email.toLowerCase(),
          password,
          email_confirm: true, // Auto-confirm email
          user_metadata: {
            full_name: name || email.split('@')[0]
          }
        })

        if (createError) {
          console.error('Error creating auth user:', createError)
          if (createError.message.includes('already been registered')) {
            return new Response(
              JSON.stringify({ error: 'An account with this email already exists' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
          throw createError
        }

        // Add to admin_users table
        const { data: adminUser, error: insertError } = await supabaseAdmin
          .from('admin_users')
          .insert({
            email: email.toLowerCase(),
            name: name || null,
            added_by: requestingUser.email
          })
          .select()
          .single()

        if (insertError) {
          // If insert fails, delete the auth user we just created
          await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
          throw insertError
        }

        return new Response(
          JSON.stringify({
            success: true,
            admin: adminUser,
            message: `Admin user ${email} created successfully`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'delete': {
        const { id, email } = params

        if (!id) {
          return new Response(
            JSON.stringify({ error: 'Admin user ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Don't allow deleting yourself
        if (email?.toLowerCase() === requestingUser.email?.toLowerCase()) {
          return new Response(
            JSON.stringify({ error: 'You cannot remove yourself as an admin' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Get the admin user to find their auth ID
        const { data: adminToDelete } = await supabaseAdmin
          .from('admin_users')
          .select('email')
          .eq('id', id)
          .single()

        if (!adminToDelete) {
          return new Response(
            JSON.stringify({ error: 'Admin user not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Find and delete the auth user
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
        const authUser = users.find(u => u.email?.toLowerCase() === adminToDelete.email.toLowerCase())

        if (authUser) {
          await supabaseAdmin.auth.admin.deleteUser(authUser.id)
        }

        // Delete from admin_users table
        const { error: deleteError } = await supabaseAdmin
          .from('admin_users')
          .delete()
          .eq('id', id)

        if (deleteError) throw deleteError

        return new Response(
          JSON.stringify({
            success: true,
            message: `Admin user removed successfully`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'reset-password': {
        const { email, newPassword } = params

        if (!email || !newPassword) {
          return new Response(
            JSON.stringify({ error: 'Email and new password are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (newPassword.length < 8) {
          return new Response(
            JSON.stringify({ error: 'Password must be at least 8 characters' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Find the auth user
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
        const authUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase())

        if (!authUser) {
          return new Response(
            JSON.stringify({ error: 'User not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Update the password
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          authUser.id,
          { password: newPassword }
        )

        if (updateError) throw updateError

        return new Response(
          JSON.stringify({
            success: true,
            message: `Password reset successfully for ${email}`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (error) {
    console.error('Error in manage-admin-users:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
