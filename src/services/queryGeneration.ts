import { supabase } from '@/lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export interface GenerateQueriesInput {
  workspaceId?: string
  clientId?: string
  prospectDashboardId?: string
  clientName?: string
  clientBio?: string
  clientEmail?: string
  prospectName?: string
  prospectBio?: string
  /** Distinct searches to build the run from. The function clamps to 3–20. */
  queryCount?: number
  /** Searches already used, so a fresh run looks somewhere else. */
  avoidQueries?: string[]
  additionalContext?: Record<string, unknown>
}

export interface GenerateQueriesResponse {
  queries: string[]
}

/**
 * A refusal from generate-podcast-queries, with what the finder needs to say
 * something useful: `code` (PROFILE_TOO_THIN, AI_PROVIDER_REJECTED, ...), the
 * one-line `reason` for a thin profile, and whether the credit came back.
 */
export interface QueryGenerationError extends Error {
  code: string | null
  generationStatus: 'profile_too_thin' | 'failed' | null
  reason: string | null
  creditsCharged: number
  creditsRefunded: number
}

async function toQueryGenerationError(response: Response, fallback: string): Promise<QueryGenerationError> {
  let payload: Record<string, unknown> = {}
  try {
    payload = await response.json()
  } catch {
    // Not JSON: the fallback message and no code.
  }
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null)
  const count = (value: unknown) => (typeof value === 'number' && value > 0 ? value : 0)
  const status = text(payload.status)
  const error = new Error(text(payload.error) || fallback) as QueryGenerationError
  error.name = text(payload.code) || 'EdgeFunctionError'
  error.code = text(payload.code)
  error.generationStatus = status === 'profile_too_thin' || status === 'failed' ? status : null
  error.reason = text(payload.reason)
  error.creditsCharged = count(payload.credits_charged)
  error.creditsRefunded = count(payload.credits_refunded)
  return error
}

export function isQueryGenerationError(error: unknown): error is QueryGenerationError {
  return error instanceof Error && 'generationStatus' in error
}

export function isProfileTooThin(error: unknown): error is QueryGenerationError {
  return isQueryGenerationError(error) && error.generationStatus === 'profile_too_thin'
}

/**
 * Generate AI-powered podcast search queries for a client OR prospect.
 * Strategic mix of precise, broad-synonym, wildcard and adjacent-category
 * searches. Count comes from the discovery strategy; the function defaults to
 * five when nothing is asked for, which is what it always used to produce.
 */
export async function generatePodcastQueries(
  input: GenerateQueriesInput
): Promise<string[]> {
  const { workspaceId, clientId, prospectDashboardId, clientName, clientBio, clientEmail, prospectName, prospectBio, queryCount, avoidQueries } = input
  const scopedRequest = Boolean(workspaceId && (clientId || prospectDashboardId))

  // Support both client and prospect mode
  const targetBio = prospectBio || clientBio

  if (!scopedRequest && (!targetBio || targetBio.trim().length === 0)) {
    throw new Error(`${prospectBio ? 'Prospect' : 'Client'} bio is required for query generation`)
  }

  try {
    // Get the authenticated user's JWT token
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw new Error('You must be logged in to generate queries')
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-podcast-queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(scopedRequest
        ? {
          workspaceId,
          ...(prospectDashboardId ? { prospectDashboardId } : { clientId }),
          ...(queryCount ? { queryCount } : {}),
          ...(avoidQueries?.length ? { avoidQueries } : {}),
        }
        : {
          clientName,
          clientBio,
          clientEmail,
          prospectName,
          prospectBio,
          ...(queryCount ? { queryCount } : {}),
          ...(avoidQueries?.length ? { avoidQueries } : {}),
        }),
    })

    if (!response.ok) {
      throw await toQueryGenerationError(response, 'The search strategy could not be generated.')
    }

    const data = await response.json()
    return data.queries
  } catch (error) {
    console.error('Error generating queries:', error)
    // The server's own words are already written for the person reading them.
    if (isQueryGenerationError(error)) throw error
    throw new Error(`Failed to generate podcast queries: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Regenerate a single query that didn't perform well
 */
export async function regenerateQuery(
  input: GenerateQueriesInput,
  oldQuery: string
): Promise<string> {
  const { workspaceId, clientId, prospectDashboardId, clientName, clientBio, clientEmail, prospectName, prospectBio, queryCount } = input
  const scopedRequest = Boolean(workspaceId && (clientId || prospectDashboardId))

  // Support both client and prospect mode
  const targetBio = prospectBio || clientBio

  if (!scopedRequest && (!targetBio || targetBio.trim().length === 0)) {
    throw new Error(`${prospectBio ? 'Prospect' : 'Client'} bio is required for query generation`)
  }

  try {
    // Get the authenticated user's JWT token
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw new Error('You must be logged in to regenerate queries')
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-podcast-queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(scopedRequest
        ? { workspaceId, ...(prospectDashboardId ? { prospectDashboardId } : { clientId }), oldQuery }
        : { clientName, clientBio, clientEmail, prospectName, prospectBio, oldQuery }),
    })

    if (!response.ok) {
      throw await toQueryGenerationError(response, 'The query could not be regenerated.')
    }

    const data = await response.json()
    return data.query
  } catch (error) {
    console.error('Error regenerating query:', error)
    if (isQueryGenerationError(error)) throw error
    throw new Error(`Failed to regenerate query: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
