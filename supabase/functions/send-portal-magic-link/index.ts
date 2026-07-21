import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { jsonResponse, optionsResponse } from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const

// Passwordless client-portal login is retired. Keep this same-name tombstone
// through the production cutover so an older deployed copy cannot send email,
// create raw tokens, or access provider credentials.
serve((req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)
  return jsonResponse(req, METHODS, 410, {
    error: 'Client portal magic links are not available',
    code: 'PORTAL_MAGIC_LINK_DISABLED',
  })
})
