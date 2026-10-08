import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { jsonResponse, optionsResponse } from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const

// Retired in the invite-only MVP: nothing in the app, the other functions,
// the schedules or the documented integrations called it, and podcast lists are exported from the workspace app.
serve((req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)
  return jsonResponse(req, METHODS, 410, {
    error: 'Podcast CSV export is not available',
    code: 'PODCAST_CSV_EXPORT_DISABLED',
  })
})
