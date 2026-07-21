import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { jsonResponse, optionsResponse } from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const

// Video generation is retired for the invite-only MVP. This tombstone keeps
// an old deployment or stale caller from spending third-party quota.
serve((req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)
  return jsonResponse(req, METHODS, 410, {
    error: 'Video generation is not available',
    code: 'VIDEO_GENERATION_DISABLED',
  })
})
