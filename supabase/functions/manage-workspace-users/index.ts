import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  errorResponse,
  HttpError,
  inviteRedirectUrl,
  jsonResponse,
  MEMBERSHIP_COLUMNS,
  optionsResponse,
  optionalString,
  parseJsonObject,
  requireEmail,
  requireOnlyKeys,
  requirePlatformAdmin,
  requireUuid,
  writeAudit,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const
const LIVE_STATUSES = ['invited', 'active', 'suspended']

type MembershipRow = Record<string, unknown> & {
  id: string
  workspace_id: string
  user_id: string | null
  email_normalized: string
  full_name: string | null
  role: string
  status: string
}

function userDto(row: MembershipRow) {
  const { email_normalized, ...membership } = row
  return { ...membership, email: email_normalized }
}

function membershipFromRpc(data: unknown): MembershipRow | null {
  const value = Array.isArray(data) ? data[0] : data
  return value && typeof value === 'object' ? value as MembershipRow : null
}

async function transitionMembership(
  admin: Parameters<typeof writeAudit>[0],
  membershipId: string,
  action: 'suspend' | 'reactivate' | 'revoke_pending',
  actorUserId: string,
): Promise<MembershipRow> {
  const { data, error } = await admin.rpc('transition_workspace_membership', {
    p_membership_id: membershipId,
    p_action: action,
    p_actor_user_id: actorUserId,
  })

  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('not found')) {
      throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Workspace account not found')
    }
    if (message.includes('platform administrator')) {
      throw new HttpError(409, 'PLATFORM_ADMIN_PROTECTED', 'Platform administrators cannot be changed here')
    }
    if (message.includes('not active')) {
      throw new HttpError(409, 'ACCOUNT_NOT_ACTIVE', 'Only an active account can be suspended')
    }
    if (message.includes('not suspended')) {
      throw new HttpError(409, 'ACCOUNT_NOT_SUSPENDED', 'Only a suspended account can be reactivated')
    }
    if (message.includes('not pending')) {
      throw new HttpError(409, 'INVITE_NOT_PENDING', 'Only a pending invitation can be revoked')
    }
    throw new HttpError(500, 'ACCOUNT_TRANSITION_FAILED', 'The workspace account could not be updated')
  }

  const membership = membershipFromRpc(data)
  if (!membership) {
    throw new HttpError(500, 'ACCOUNT_TRANSITION_FAILED', 'The workspace account could not be updated')
  }
  return membership
}

async function deleteAuthUserIfPresent(
  admin: Parameters<typeof writeAudit>[0],
  userId: string,
  expectedEmail: string,
  code: string,
  message: string,
): Promise<void> {
  const { data, error: lookupError } = await admin.auth.admin.getUserById(userId)
  if (lookupError) {
    const missing = lookupError.status === 404 || lookupError.message.toLowerCase().includes('not found')
    if (missing) return
    throw new HttpError(503, code, message)
  }
  if (!data.user) return

  if (data.user.email?.trim().toLowerCase() !== expectedEmail) {
    throw new HttpError(409, code, message)
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
  if (deleteError) throw new HttpError(503, code, message)
}

async function requireBoundAuthIdentity(
  admin: Parameters<typeof writeAudit>[0],
  row: MembershipRow,
): Promise<void> {
  if (!row.user_id) return

  const { data, error } = await admin.auth.admin.getUserById(row.user_id)
  const authEmail = data.user?.email?.trim().toLowerCase()
  if (error || !authEmail || authEmail !== row.email_normalized) {
    throw new HttpError(
      409,
      'ACCOUNT_IDENTITY_MISMATCH',
      'The account identity changed and requires manual review',
    )
  }

  const { data: protectedAdmin, error: protectedAdminError } = await admin.rpc(
    'is_platform_admin_email',
    { p_email: authEmail },
  )
  if (protectedAdminError) {
    throw new HttpError(500, 'ACCOUNT_PROTECTION_UNAVAILABLE', 'The account protection check failed')
  }
  if (protectedAdmin === true) {
    throw new HttpError(409, 'PLATFORM_ADMIN_PROTECTED', 'Platform administrators cannot be changed here')
  }
}

function workspaceName(email: string, fullName: string | null, requested: string | null): string {
  if (requested) return requested
  if (fullName) return `${fullName}'s Workspace`
  return `${email.split('@')[0]}'s Workspace`
}

function workspaceSlug(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'workspace'

  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req)
    const action = typeof body.action === 'string' ? body.action : ''
    const { admin, user } = await requirePlatformAdmin(req)

    if (action === 'list') {
      requireOnlyKeys(body, ['action'])

      const { data, error } = await admin
        .from('workspace_memberships')
        .select(`${MEMBERSHIP_COLUMNS}, workspace:workspaces(id,name,slug,status,is_default)`)
        .order('invited_at', { ascending: false })

      if (error) {
        throw new HttpError(500, 'USER_LIST_FAILED', 'Workspace users could not be loaded')
      }

      const membershipRows = (data ?? []) as unknown as MembershipRow[]

      return jsonResponse(req, METHODS, 200, {
        // Default-workspace memberships are platform operators managed by the
        // legacy allowlist, not invite-only tenant accounts. Hiding them keeps
        // this UI aligned with the lifecycle actions it can actually perform.
        users: membershipRows
          .filter((row) => {
            const workspace = (row as { workspace?: { is_default?: boolean } | null }).workspace
            return workspace?.is_default === false
          })
          .map((row) => userDto(row)),
      })
    }

    if (action === 'invite') {
      requireOnlyKeys(body, ['action', 'email', 'full_name', 'workspace_name'])
      const email = requireEmail(body.email)
      const fullName = optionalString(body.full_name, 'full_name', 120)
      const requestedWorkspaceName = optionalString(body.workspace_name, 'workspace_name', 120)
      const name = workspaceName(email, fullName, requestedWorkspaceName)

      // Protect operator identities before any expired-invite cleanup can
      // delete a bound Auth user for this email.
      const { data: existingAdmin, error: existingAdminError } = await admin.rpc(
        'is_platform_admin_email',
        { p_email: email },
      )

      if (existingAdminError) {
        throw new HttpError(500, 'INVITE_CHECK_FAILED', 'The invitation could not be verified')
      }
      if (existingAdmin === true) {
        throw new HttpError(409, 'PLATFORM_ADMIN_EXISTS', 'This email is already a platform administrator')
      }

      const { data: existing, error: existingError } = await admin
        .from('workspace_memberships')
        .select('id,status,user_id,workspace_id,invite_expires_at')
        .eq('email_normalized', email)
        .in('status', LIVE_STATUSES)
        .limit(1)

      if (existingError) {
        throw new HttpError(500, 'INVITE_CHECK_FAILED', 'The invitation could not be verified')
      }
      const existingMembership = existing?.[0]
      if (existingMembership) {
        const expired = existingMembership.status === 'invited'
          && typeof existingMembership.invite_expires_at === 'string'
          && Date.parse(existingMembership.invite_expires_at) <= Date.now()

        if (!expired) {
          throw new HttpError(409, 'ACCOUNT_ALREADY_INVITED', 'This email already has workspace access')
        }

        if (existingMembership.user_id) {
          await deleteAuthUserIfPresent(
            admin,
            existingMembership.user_id,
            email,
            'EXPIRED_INVITE_CLEANUP_FAILED',
            'The expired invitation could not be cleaned up',
          )
        }
        await transitionMembership(admin, existingMembership.id, 'revoke_pending', user.id)
      }

      let createdWorkspaceId: string | null = null
      let createdMembershipId: string | null = null
      let createdAuthUserId: string | null = null
      let lifecycleEstablished = false

      try {
        const { data: workspace, error: workspaceError } = await admin
          .from('workspaces')
          .insert({
            name,
            slug: workspaceSlug(name),
            status: 'active',
            is_default: false,
            created_by: user.id,
          })
          .select('id,name,slug,status')
          .single()

        if (workspaceError || !workspace) {
          throw new HttpError(500, 'WORKSPACE_CREATE_FAILED', 'The workspace could not be created')
        }
        createdWorkspaceId = workspace.id

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        const { data: membership, error: membershipError } = await admin
          .from('workspace_memberships')
          .insert({
            workspace_id: workspace.id,
            user_id: null,
            email_normalized: email,
            full_name: fullName,
            role: 'owner',
            status: 'invited',
            invite_expires_at: expiresAt,
            invited_by: user.id,
          })
          .select(MEMBERSHIP_COLUMNS)
          .single()

        if (membershipError || !membership) {
          throw new HttpError(500, 'MEMBERSHIP_CREATE_FAILED', 'The invitation could not be created')
        }
        const membershipRow = membership as unknown as MembershipRow
        createdMembershipId = membershipRow.id

        const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
          email,
          {
            redirectTo: inviteRedirectUrl(membershipRow.id),
            data: {
              full_name: fullName,
              workspace_id: workspace.id,
              workspace_membership_id: membershipRow.id,
            },
          },
        )

        if (inviteError || !invited.user) {
          if (inviteError?.message.toLowerCase().includes('registered')) {
            throw new HttpError(409, 'AUTH_ACCOUNT_EXISTS', 'This email already has an account')
          }
          throw new HttpError(502, 'INVITE_EMAIL_FAILED', 'The invitation email could not be sent')
        }
        createdAuthUserId = invited.user.id

        const { data: boundMembership, error: bindError } = await admin
          .from('workspace_memberships')
          .update({ user_id: invited.user.id })
          .eq('id', membershipRow.id)
          .eq('status', 'invited')
          .select(MEMBERSHIP_COLUMNS)
          .single()

        if (bindError || !boundMembership) {
          const { data: racedMembership } = await admin
            .from('workspace_memberships')
            .select(MEMBERSHIP_COLUMNS)
            .eq('id', membershipRow.id)
            .eq('user_id', invited.user.id)
            .eq('status', 'active')
            .maybeSingle()

          if (!racedMembership) {
            throw new HttpError(500, 'INVITE_BIND_FAILED', 'The invitation could not be finalized')
          }

          lifecycleEstablished = true
          return jsonResponse(req, METHODS, 201, {
            success: true,
            user: userDto({
              ...(racedMembership as unknown as MembershipRow),
              workspace,
            } as MembershipRow),
          })
        }

        await writeAudit(admin, {
          workspaceId: workspace.id,
          actorUserId: user.id,
          action: 'workspace.membership.invited',
          entityType: 'workspace_membership',
          entityId: membershipRow.id,
          metadata: { email, role: 'owner' },
        })

        lifecycleEstablished = true

        return jsonResponse(req, METHODS, 201, {
          success: true,
          user: userDto({
            ...(boundMembership as unknown as MembershipRow),
            workspace,
          } as MembershipRow),
        })
      } catch (error) {
        // An emailed invite is harmless after its Auth user is removed; the
        // link becomes invalid. Cleanup is best effort and never replaces the
        // original safe error response.
        if (!lifecycleEstablished) {
          if (createdAuthUserId) {
            const { error: authCleanupError } = await admin.auth.admin.deleteUser(createdAuthUserId)
            if (authCleanupError) console.error('Workspace invite Auth cleanup failed')
          }
          if (createdMembershipId) {
            const { error: membershipCleanupError } = await admin
              .from('workspace_memberships')
              .delete()
              .eq('id', createdMembershipId)
            if (membershipCleanupError) console.error('Workspace invite membership cleanup failed')
          }
          if (createdWorkspaceId) {
            const { error: workspaceCleanupError } = await admin
              .from('workspaces')
              .delete()
              .eq('id', createdWorkspaceId)
            if (workspaceCleanupError) console.error('Workspace invite workspace cleanup failed')
          }
        }
        throw error
      }
    }

    if (action === 'suspend' || action === 'reactivate' || action === 'revoke_pending') {
      requireOnlyKeys(body, ['action', 'membership_id'])
      const membershipId = requireUuid(body.membership_id, 'membership_id')

      const { data: membership, error: membershipError } = await admin
        .from('workspace_memberships')
        .select(MEMBERSHIP_COLUMNS)
        .eq('id', membershipId)
        .maybeSingle()

      if (membershipError) {
        throw new HttpError(500, 'ACCOUNT_LOOKUP_FAILED', 'The workspace account could not be loaded')
      }
      if (!membership) {
        throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Workspace account not found')
      }

      const row = membership as unknown as MembershipRow
      const { data: protectedAdmin, error: protectedAdminError } = await admin.rpc(
        'is_platform_admin_email',
        { p_email: row.email_normalized },
      )
      if (protectedAdminError) {
        throw new HttpError(500, 'ACCOUNT_PROTECTION_UNAVAILABLE', 'The account protection check failed')
      }
      if (protectedAdmin === true) {
        throw new HttpError(409, 'PLATFORM_ADMIN_PROTECTED', 'Platform administrators cannot be changed here')
      }
      await requireBoundAuthIdentity(admin, row)

      if (action === 'suspend') {
        if (row.status !== 'active') {
          throw new HttpError(409, 'ACCOUNT_NOT_ACTIVE', 'Only an active account can be suspended')
        }

        if (row.user_id) {
          const { error } = await admin.auth.admin.updateUserById(row.user_id, {
            ban_duration: '876000h',
          })
          if (error) throw new HttpError(500, 'AUTH_SUSPEND_FAILED', 'The account could not be suspended')
        }

        try {
          const updated = await transitionMembership(admin, row.id, 'suspend', user.id)
          return jsonResponse(req, METHODS, 200, { success: true, user: userDto(updated) })
        } catch (error) {
          if (row.user_id) {
            const { error: compensationError } = await admin.auth.admin.updateUserById(
              row.user_id,
              { ban_duration: 'none' },
            )
            if (compensationError) console.error('Workspace suspension Auth compensation failed')
          }
          throw error
        }
      }

      if (action === 'reactivate') {
        if (row.status !== 'suspended') {
          throw new HttpError(409, 'ACCOUNT_NOT_SUSPENDED', 'Only a suspended account can be reactivated')
        }

        if (row.user_id) {
          const { error } = await admin.auth.admin.updateUserById(row.user_id, {
            ban_duration: 'none',
          })
          if (error) throw new HttpError(500, 'AUTH_REACTIVATE_FAILED', 'The account could not be reactivated')
        }

        try {
          const updated = await transitionMembership(admin, row.id, 'reactivate', user.id)
          return jsonResponse(req, METHODS, 200, { success: true, user: userDto(updated) })
        } catch (error) {
          if (row.user_id) {
            const { error: compensationError } = await admin.auth.admin.updateUserById(
              row.user_id,
              { ban_duration: '876000h' },
            )
            if (compensationError) console.error('Workspace reactivation Auth compensation failed')
          }
          throw error
        }
      }

      if (row.status !== 'invited') {
        throw new HttpError(409, 'INVITE_NOT_PENDING', 'Only a pending invitation can be revoked')
      }

      if (row.user_id) {
        await deleteAuthUserIfPresent(
          admin,
          row.user_id,
          row.email_normalized,
          'AUTH_REVOKE_FAILED',
          'The invitation could not be revoked',
        )
      }

      const revoked = await transitionMembership(admin, row.id, 'revoke_pending', user.id)
      return jsonResponse(req, METHODS, 200, { success: true, user: userDto(revoked) })
    }

    throw new HttpError(400, 'INVALID_ACTION', 'Unknown workspace user action')
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
