/**
 * What the admin pages say after a Podscan-backed fetch: the client
 * dashboard's metadata fetch (get-client-podcasts) and the database's bulk
 * import. Kept here so the wording, and the cases that used to be told wrong,
 * are tested rather than read.
 */

export interface DashboardFetchResult {
  podcasts?: unknown[] | null
  fetched?: number
  cached?: number
  failed?: number
  stoppedEarly?: boolean
  remaining?: number
}

export interface FetchNotice {
  title: string
  description: string
  destructive?: boolean
}

function plural(count: number, word: string): string {
  return `${count} ${count === 1 ? word : `${word}s`}`
}

/**
 * The notices for one metadata fetch, in the order to show them. An empty
 * list is not always an empty sheet: every show can have failed at Podscan,
 * or the run can have stopped on its time budget before fetching any.
 */
export function dashboardFetchNotices(result: DashboardFetchResult): FetchNotice[] {
  const returned = result.podcasts?.length ?? 0
  const fetched = result.fetched ?? 0
  const failed = result.failed ?? 0
  const remaining = result.remaining ?? 0
  const failure: FetchNotice = {
    title: `${plural(failed, 'podcast')} could not be fetched`,
    description: 'Podscan did not return them. Click again to retry, or check the IDs in the sheet.',
    destructive: true,
  }
  const partial: FetchNotice = {
    title: `Partial fetch — ${fetched} new, ${remaining} remaining`,
    description: 'Click again to continue fetching',
  }

  if (returned === 0) {
    if (failed > 0) return result.stoppedEarly ? [failure, partial] : [failure]
    if (result.stoppedEarly) return [partial]
    return [{
      title: 'No podcasts found',
      description: 'Google Sheet is empty or has no valid podcast IDs',
      destructive: true,
    }]
  }

  const notices: FetchNotice[] = [result.stoppedEarly
    ? partial
    : {
        title: '✅ Metadata Cache Complete',
        description: `${result.cached ?? 0} from cache, ${fetched} newly fetched. Click "Run AI Analysis" to personalize.`,
      }]
  if (failed > 0) notices.push(failure)
  return notices
}

export interface BulkImportNotice {
  kind: 'success' | 'warning'
  message: string
}

export function bulkImportNotice(input: {
  saved: number
  keywords: string
  failedPages: number
  cancelled: boolean
}): BulkImportNotice {
  if (input.cancelled) {
    return { kind: 'success', message: `Cancelled. ${input.saved} podcasts saved before stopping.` }
  }
  if (input.failedPages > 0) {
    const skipped = input.failedPages === 1 ? '1 page could not be fetched and was skipped.' : `${input.failedPages} pages could not be fetched and were skipped.`
    return { kind: 'warning', message: `Imported ${input.saved} podcasts from "${input.keywords}". ${skipped}` }
  }
  return { kind: 'success', message: `Imported ${input.saved} podcasts from "${input.keywords}"` }
}

/** The failure toast, saying what was kept when part of the import ran. */
export function bulkImportFailureMessage(error: unknown, saved: number): string {
  const reason = error instanceof Error && error.message ? error.message : 'Bulk import failed.'
  return saved > 0 ? `${reason} ${saved} podcasts were saved before it stopped.` : reason
}
