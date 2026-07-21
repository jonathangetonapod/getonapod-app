import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { jsonResponse, optionsResponse } from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const

// This historical endpoint exposed a pre-workspace outreach workflow. Deploy
// the same-name tombstone once during cutover to overwrite any remote legacy
// copy without reading its body or touching paid providers.
serve((req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)
  return jsonResponse(req, METHODS, 410, {
    error: 'The legacy outreach endpoint is not available',
    code: 'LEGACY_OUTREACH_DISABLED',
  })
})
