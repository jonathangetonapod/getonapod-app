import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { jsonResponse, optionsResponse } from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const

// Platform-administrator creation/deletion/password reset is intentionally not
// self-service in the invite-only MVP. Tenant accounts are managed through
// manage-workspace-users; the operator allowlist remains an audited deployment
// concern so one browser action cannot remove the final administrator.
serve((req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)
  return jsonResponse(req, METHODS, 410, {
    error: 'Platform administrator management is not available',
    code: 'ADMIN_MANAGEMENT_DISABLED',
  })
})
