import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { jsonResponse, optionsResponse } from '../_shared/workspaceAuth.ts'
const METHODS = ['POST'] as const
// Retired permanently. Historical purchases/refunds still use the signed webhook.
serve((req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)
  return jsonResponse(req, METHODS, 410, {
    code: 'CREDIT_BILLING_RETIRED',
    error: 'Credit billing has ended. Workspaces use a flat subscription and their own provider accounts.',
  })
})
