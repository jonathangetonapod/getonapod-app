import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { jsonResponse, optionsResponse } from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const

// Retired in the invite-only MVP: nothing in the app, the other functions,
// the schedules or the documented integrations called it, and the legacy admin analytics page had no remaining caller.
serve((req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)
  return jsonResponse(req, METHODS, 410, {
    error: 'Pipeline analytics are not available',
    code: 'PIPELINE_ANALYTICS_DISABLED',
  })
})
