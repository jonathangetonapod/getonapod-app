import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  errorResponse,
  HttpError,
  jsonResponse,
  MEMBERSHIP_COLUMNS,
  optionsResponse,
  parseOptionalJsonObject,
  requireAuthenticatedUser,
  requireOnlyKeys,
  WORKSPACE_COLUMNS,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['GET', 'POST'] as const

type MembershipRow = Record<string, unknown> & {
  workspace_id: string
  status: string
  invite_expires_at: string | null
}

type WorkspaceRow = Record<string, unknown> & {
  status: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only GET and POST are allowed')
    }

    if (req.method === 'POST') {
      const body = await parseOptionalJsonObject(req)
      requireOnlyKeys(body, [])
    }

    const { admin, user, email, platformAdmin } = await requireAuthenticatedUser(req)

    // Accepted/suspended memberships are permanently bound to the Auth user ID.
    const { data: userMemberships, error: userMembershipError } = await admin
      .from('workspace_memberships')
      .select(MEMBERSHIP_COLUMNS)
      .eq('user_id', user.id)
      .limit(2)

    if (userMembershipError) {
      throw new HttpError(500, 'CONTEXT_UNAVAILABLE', 'Account context is unavailable')
    }

    let memberships = (userMemberships ?? []) as unknown as MembershipRow[]

    // Email matching is restricted to unaccepted invitations. Once accepted,
    // authorization never follows a mutable email address.
    if (memberships.length === 0) {
      const { data: pendingMemberships, error: pendingError } = await admin
        .from('workspace_memberships')
        .select(MEMBERSHIP_COLUMNS)
        .is('user_id', null)
        .eq('email_normalized', email)
        .eq('status', 'invited')
        .limit(2)

      if (pendingError) {
        throw new HttpError(500, 'CONTEXT_UNAVAILABLE', 'Account context is unavailable')
      }
      memberships = (pendingMemberships ?? []) as unknown as MembershipRow[]
    }

    if (memberships.length > 1) {
      throw new HttpError(409, 'MULTIPLE_WORKSPACES', 'The account has an ambiguous workspace assignment')
    }

    const membership = memberships[0] ?? null
    if (!membership) {
      return jsonResponse(req, METHODS, 200, {
        user: { id: user.id, email },
        platform_admin: platformAdmin,
        state: 'no_membership',
        membership: null,
        workspace: null,
      })
    }

    const { data: workspaceData, error: workspaceError } = await admin
      .from('workspaces')
      .select(WORKSPACE_COLUMNS)
      .eq('id', membership.workspace_id)
      .maybeSingle()

    if (workspaceError || !workspaceData) {
      throw new HttpError(500, 'CONTEXT_UNAVAILABLE', 'Account context is unavailable')
    }
    const workspace = workspaceData as unknown as WorkspaceRow

    let state: 'active' | 'pending' | 'expired' | 'suspended'
    if (membership.status === 'invited') {
      const expiresAt = membership.invite_expires_at
        ? new Date(membership.invite_expires_at).getTime()
        : Number.NaN
      state = !Number.isFinite(expiresAt) || expiresAt <= Date.now() || workspace.status !== 'active'
        ? 'expired'
        : 'pending'
    } else if (membership.status === 'suspended' || workspace.status === 'suspended') {
      state = 'suspended'
    } else if (membership.status === 'active' && workspace.status === 'active') {
      state = 'active'
    } else {
      throw new HttpError(500, 'INVALID_ACCOUNT_STATE', 'Account context is unavailable')
    }

    return jsonResponse(req, METHODS, 200, {
      user: { id: user.id, email },
      platform_admin: platformAdmin,
      state,
      membership,
      workspace,
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
