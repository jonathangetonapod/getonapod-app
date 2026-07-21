import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { jsonResponse, optionsResponse } from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const

// The raw magic-token exchange is retired. This handler deliberately performs
// no body parsing, token lookup, session creation, or service-role operation.
serve((req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)
  return jsonResponse(req, METHODS, 410, {
    error: 'Client portal magic links are not available',
    code: 'PORTAL_MAGIC_LINK_DISABLED',
  })
})
