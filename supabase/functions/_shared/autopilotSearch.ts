// The Podscan half of an autopilot run: every drafted query searched in turn,
// with the rules for when a failed search ends the run. Kept out of the tick
// so the rules are tested rather than read.

import { HttpError } from './httpError.ts'
import { isPodscanAuthError } from './podscan.ts'

/**
 * Why the index could not be searched:
 * - `refused`: our key or account was refused, or no key is configured.
 * - `quota`: the account's daily request limit is spent.
 * - `unavailable`: a timeout, a 5xx, a busy index or the run's time budget.
 */
export type PodscanSearchFailureKind = 'refused' | 'quota' | 'unavailable'

/**
 * The podcast index could not be searched. Kept apart from "searched and found
 * nothing": a refused key used to read as a quiet week with no new shows.
 */
export class PodscanSearchError extends Error {
  constructor(readonly kind: PodscanSearchFailureKind) {
    super(`podscan search failed: ${kind}`)
  }
}

export function podscanSearchFailureKind(error: unknown): PodscanSearchFailureKind {
  if (isPodscanAuthError(error)) return 'refused'
  if (error instanceof HttpError && error.code === 'PODSCAN_DAILY_LIMIT') return 'quota'
  return 'unavailable'
}

export interface QuerySearchOutcome<T> {
  /** Results per query that answered, in query order. */
  results: T[][]
  /** How many queries the index answered. */
  successful: number
}

/**
 * Runs every query. A refused key or a spent quota fails every query the same
 * way, so the first one ends the run. Any other failure costs only that query,
 * and the run fails only when no query was answered at all: one that answered
 * with shows already on the list is still an answer.
 */
export async function searchAcrossQueries<T>(
  queries: string[],
  search: (query: string) => Promise<T[]>,
  options: { spacingMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<QuerySearchOutcome<T>> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const results: T[][] = []
  let lastFailure: PodscanSearchError | null = null
  for (const [index, query] of queries.entries()) {
    try {
      results.push(await search(query))
    } catch (error) {
      if (!(error instanceof PodscanSearchError) || error.kind !== 'unavailable') throw error
      lastFailure = error
    }
    if (options.spacingMs && index < queries.length - 1) await sleep(options.spacingMs)
  }
  if (results.length === 0 && lastFailure) throw lastFailure
  return { results, successful: results.length }
}
