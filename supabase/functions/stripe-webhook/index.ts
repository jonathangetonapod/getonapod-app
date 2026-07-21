import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { jsonResponse, optionsResponse } from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const

// Billing is out of scope for this MVP. Returning a permanent tombstone makes
// the deployment intent explicit; the Stripe webhook must also be removed from
// the Stripe dashboard before this release is promoted.
serve((req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)
  return jsonResponse(req, METHODS, 410, {
    error: 'Billing is not available',
    code: 'BILLING_DISABLED',
  })
})
