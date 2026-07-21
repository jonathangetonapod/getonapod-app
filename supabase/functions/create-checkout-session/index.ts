import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  jsonResponse,
  optionsResponse,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const

// Billing is intentionally disabled for the invite-only MVP. Keeping an
// explicit tombstone prevents an accidentally deployed historical checkout
// implementation from creating charges while old clients still call the URL.
serve((req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)
  return jsonResponse(req, METHODS, 410, {
    error: 'Billing is not available',
    code: 'BILLING_DISABLED',
  })
})
