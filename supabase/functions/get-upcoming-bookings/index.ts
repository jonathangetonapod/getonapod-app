import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { jsonResponse, optionsResponse } from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const

// Retired in the invite-only MVP: nothing in the app, the other functions,
// the schedules or the documented integrations called it, and bookings are read per client inside the workspace app and the portal.
serve((req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)
  return jsonResponse(req, METHODS, 410, {
    error: 'Upcoming bookings lookup is not available',
    code: 'UPCOMING_BOOKINGS_DISABLED',
  })
})
