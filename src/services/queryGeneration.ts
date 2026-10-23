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
 * The profile does not say enough to draft from. Nothing was charged; the fix
 * is on the client record, not a retry.
 */
export class ProfileTooThinError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProfileTooThinError'
  }
}

/** A generation that failed after it started; the function refunds the credit. */
export class StrategyGenerationError extends Error {
  readonly code: string | null

  constructor(message: string, code: string | null) {
    super(message)
    this.name = 'StrategyGenerationError'
    this.code = code
  }
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
      const error = await response.json().catch(() => ({})) as { error?: unknown; code?: unknown; status?: unknown }
      const message = typeof error.error === 'string' && error.error ? error.error : 'Failed to generate queries'
      if (error.status === 'profile_too_thin') throw new ProfileTooThinError(message)
      throw new StrategyGenerationError(message, typeof error.code === 'string' ? error.code : null)
    }

    const data = await response.json()
    return data.queries
  } catch (error) {
    console.error('Error generating queries:', error)
    // Typed refusals pass through as they are: callers branch on them, and
    // their message is already written for the operator.
    if (error instanceof ProfileTooThinError || error instanceof StrategyGenerationError) throw error
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
      const error = await response.json()
      throw new Error(error.error || 'Failed to regenerate query')
    }

    const data = await response.json()
    return data.query
  } catch (error) {
    console.error('Error regenerating query:', error)
    throw new Error(`Failed to regenerate query: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
