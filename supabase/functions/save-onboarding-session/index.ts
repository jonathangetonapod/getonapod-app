import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { jsonResponse, optionsResponse } from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const

// Retired in the invite-only MVP: nothing in the app, the other functions,
// the schedules or the documented integrations called it, and client onboarding is handled by client-onboarding and workspace-onboarding.
serve((req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)
  return jsonResponse(req, METHODS, 410, {
    error: 'Onboarding session saving is not available',
    code: 'ONBOARDING_SESSION_DISABLED',
  })
})
