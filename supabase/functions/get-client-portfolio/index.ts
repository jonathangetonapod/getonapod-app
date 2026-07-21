import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { jsonResponse, optionsResponse } from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const

// The supported public client capability is public-client-dashboard. This
// orphan predecessor had no callers and exposed a second service-role read
// surface, so keep only a same-name containment tombstone during cutover.
serve((req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)
  return jsonResponse(req, METHODS, 410, {
    error: 'The legacy client portfolio endpoint is not available',
    code: 'LEGACY_CLIENT_PORTFOLIO_DISABLED',
  })
})
